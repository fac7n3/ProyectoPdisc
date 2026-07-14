// F2-07 + P0-6 (split payments piloto): webhook público de Mercado Pago.
// Sin JWT (MP llama anónimo) -- verify_jwt=false a propósito, la
// autenticación acá es "re-confirmar contra la API real de MP", nunca
// confiar en el payload del webhook en sí.
//
// P0-6: antes esto siempre re-confirmaba con el MP_ACCESS_TOKEN global de la
// plataforma. Ahora un pago puede haberse hecho con el access_token DE UN
// VENDEDOR (split payments) -- hay que usar ESE token para poder leer el
// pago. El payload del webhook trae un campo `user_id` (la cuenta de MP a la
// que llega la notificación); para un pago con split, coincide con
// `stores.mp_collector_id` del vendedor que armó la preferencia. Si no
// matchea ningún vendedor vinculado, se asume que es un pago del flujo viejo
// (pre-split, con el token global) y se usa el MP_ACCESS_TOKEN de siempre --
// mantiene compatibilidad con cualquier orden `pending` que haya quedado en
// vuelo de antes de esta migración.
//
// NOTA: la relación "webhook.user_id == collector del pago" no está 100%
// confirmada en la documentación pública de Mercado Pago (ver hallazgo en
// docs/MIGRACIONES_PENDIENTES.md o el mensaje del PR) -- hay que confirmarla
// empíricamente con el primer pago real de split en el piloto. Si no
// coincide, el fallback al token global simplemente no va a encontrar el
// pago (GET falla, no se confirma nada) -- no hay riesgo de seguridad, solo
// de que un pago tarde en confirmarse hasta ajustar esto.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID")!;
const MP_CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

async function resolveAccessToken(
  supabase: ReturnType<typeof createClient>,
  mpUserId: string | null,
): Promise<{ token: string; storeId: string | null }> {
  if (!mpUserId) {
    return { token: MP_ACCESS_TOKEN, storeId: null };
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("mp_collector_id", mpUserId)
    .maybeSingle();

  if (!store) {
    return { token: MP_ACCESS_TOKEN, storeId: null };
  }

  const { data: creds } = await supabase
    .from("store_mp_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("store_id", store.id)
    .maybeSingle();

  if (!creds) {
    return { token: MP_ACCESS_TOKEN, storeId: store.id as string };
  }

  const expiresAt = new Date(creds.expires_at as string).getTime();
  if (expiresAt - Date.now() >= REFRESH_MARGIN_MS) {
    return { token: creds.access_token as string, storeId: store.id as string };
  }

  const refreshRes = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok || !refreshed.access_token) {
    // No se pudo renovar -- el vendedor tiene que re-vincular. Devolvemos
    // storeId igual para que el caller pueda marcar sus órdenes pendientes.
    return { token: "", storeId: store.id as string };
  }

  await supabase
    .from("store_mp_credentials")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? creds.refresh_token,
      expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 0) * 1000).toISOString(),
    })
    .eq("store_id", store.id);

  return { token: refreshed.access_token as string, storeId: store.id as string };
}

async function markNeedsReview(supabase: ReturnType<typeof createClient>, storeId: string) {
  const { data: updated } = await supabase
    .from("orders")
    .update({ payment_status: "needs_review" })
    .eq("store_id", storeId)
    .eq("payment_method", "mercadopago")
    .eq("payment_status", "pending")
    .select("id");

  if (!updated || updated.length === 0) return;

  const { data: store } = await supabase.from("stores").select("owner_id").eq("id", storeId).single();
  if (!store?.owner_id) return;

  await supabase
    .rpc("create_notification", {
      p_user_id: store.owner_id,
      p_type: "mp_split_needs_review",
      p_payload: { store_id: storeId, order_ids: updated.map((o: { id: string }) => o.id) },
    })
    .then(
      () => {},
      (err: unknown) => console.error("Error creando notificación needs_review:", err),
    );
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    let type = url.searchParams.get("type") ?? url.searchParams.get("topic");
    let mpUserId = url.searchParams.get("user_id");

    if (!paymentId && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body?.data?.id) {
        paymentId = String(body.data.id);
        type = body.type ?? type;
        mpUserId = body.user_id != null ? String(body.user_id) : mpUserId;
      }
    }

    if (!paymentId || type !== "payment") {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { token: accessToken, storeId } = await resolveAccessToken(supabase, mpUserId);

    if (!accessToken) {
      // Vendedor con token vencido/revocado y el refresh falló -- no se
      // puede confirmar nada de este vendedor hasta que re-vincule.
      if (storeId) await markNeedsReview(supabase, storeId);
      return new Response("ok", { status: 200 });
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!paymentRes.ok) {
      // Id de pago inexistente, de otra cuenta, o el user_id del webhook no
      // matcheó ningún vendedor y el token global tampoco pudo leerlo --
      // no confiamos en nada del webhook que no podamos re-confirmar.
      return new Response("ok", { status: 200 });
    }

    const payment = await paymentRes.json();
    const orderIds: string[] = (payment.external_reference ?? "")
      .split(",")
      .filter(Boolean);
    if (orderIds.length === 0) {
      return new Response("ok", { status: 200 });
    }

    if (payment.status === "approved") {
      const { data: updated, error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          status: "paid",
          payment_id: String(payment.id),
        })
        .in("id", orderIds)
        .eq("payment_method", "mercadopago")
        .eq("payment_status", "pending")
        .select("id, store_id");

      if (error) throw error;

      for (const order of updated ?? []) {
        const { data: store } = await supabase
          .from("stores")
          .select("owner_id")
          .eq("id", order.store_id)
          .single();
        if (store?.owner_id) {
          await supabase
            .rpc("create_notification", {
              p_user_id: store.owner_id,
              p_type: "order_paid",
              p_payload: { order_id: order.id },
            })
            .then(
              () => {},
              (notifyErr: unknown) => console.error("Error creando notificación:", notifyErr),
            );
        }
      }
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "rejected" })
        .in("id", orderIds)
        .eq("payment_method", "mercadopago")
        .eq("payment_status", "pending");
      if (error) throw error;
    }
    // "pending"/"in_process": no hacemos nada todavía, esperamos otro webhook.

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    // Error real de procesamiento (no un pago inexistente) -- devolver 500
    // para que Mercado Pago reintente el webhook más tarde en vez de perderlo.
    return new Response("error", { status: 500 });
  }
});
