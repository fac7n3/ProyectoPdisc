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
// Qué se verifica antes de marcar una orden como pagada (todo esto se agregó
// el 2026-09-16, antes alcanzaba con que el webhook dijera "approved"):
//   1. el pago existe y se puede leer con NUESTRO token (o el del vendedor);
//   2. su `external_reference` son uuids con forma de uuid;
//   3. las órdenes están `pending` y son de Mercado Pago;
//   4. **el monto cobrado cubre lo que suman esas órdenes**. Si no, se marcan
//      `needs_review` y se avisa al vendedor, nunca `paid`.
// Y si después llega una devolución/contracargo (`refunded`, `charged_back`,
// `in_mediation`), la orden vuelve a `needs_review` -- antes se quedaba
// `paid` para siempre y el vendedor despachaba una venta que ya no existía.
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

  // limit(2) y no .maybeSingle(): `stores.mp_collector_id` no tiene unique,
  // así que una misma cuenta de MP puede terminar vinculada a dos tiendas (es
  // lo que evita ahora mp-oauth-callback, pero puede haber quedado de antes).
  // Con .maybeSingle() ese caso devolvía error, se caía en silencio al token
  // global y el pago no se confirmaba nunca, sin dejar rastro de por qué.
  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id")
    .eq("mp_collector_id", mpUserId)
    .limit(2);

  if (storesError) {
    console.error("Error buscando la tienda por mp_collector_id:", storesError);
    return { token: MP_ACCESS_TOKEN, storeId: null };
  }

  if (stores && stores.length > 1) {
    console.error(
      `mp_collector_id ${mpUserId} está vinculado a más de una tienda: no se puede ` +
      "saber con qué token leer el pago. Hay que desvincular una desde el panel.",
    );
    return { token: "", storeId: null };
  }

  const store = stores?.[0];
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estados de MP en los que la plata ya no está: devolución, contracargo o disputa abierta. */
const DISPUTED_STATUSES = ["refunded", "charged_back", "in_mediation"];

/**
 * Avisa a los dueños de las tiendas de esas órdenes. Una sola consulta de
 * `stores` para todas (antes se pedía el owner_id de a una dentro del for,
 * un N+1 contra la base por cada orden del pago).
 */
async function notifyStoreOwners(
  supabase: ReturnType<typeof createClient>,
  orders: Array<{ id: string; store_id: string }>,
  type: string,
  extraPayload: Record<string, unknown> = {},
) {
  const storeIds = [...new Set(orders.map((o) => o.store_id))];
  if (storeIds.length === 0) return;

  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, owner_id")
    .in("id", storeIds);

  if (error) {
    console.error("Error buscando los dueños para notificar:", error);
    return;
  }

  const ownerByStore = new Map(
    (stores ?? []).map((st: { id: string; owner_id: string | null }) => [st.id, st.owner_id]),
  );

  for (const order of orders) {
    const ownerId = ownerByStore.get(order.store_id);
    if (!ownerId) continue;
    await supabase
      .rpc("create_notification", {
        p_user_id: ownerId,
        p_type: type,
        p_payload: { order_id: order.id, ...extraPayload },
      })
      .then(
        () => {},
        (err: unknown) => console.error(`Error creando notificación ${type}:`, err),
      );
  }
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

    // external_reference lo escribe mp-create-preference como "uuid,uuid,...",
    // pero acá llega desde afuera: si trae cualquier otra cosa, el `.in("id",
    // ...)` de abajo explota con un error de casteo de uuid, cae en el catch y
    // devuelve 500 -- y Mercado Pago reintenta un webhook con 500 durante
    // días. Filtrar por forma de uuid lo convierte en un "no hay nada que
    // hacer" (200) en vez de un reintento eterno.
    const orderIds: string[] = String(payment.external_reference ?? "")
      .split(",")
      .map((id: string) => id.trim())
      .filter((id: string) => UUID_RE.test(id));

    if (orderIds.length === 0) {
      if (payment.external_reference) {
        console.warn("external_reference sin uuids válidos, se ignora:", payment.external_reference);
      }
      return new Response("ok", { status: 200 });
    }

    if (payment.status === "approved") {
      // Qué órdenes de las que dice este pago se pueden marcar realmente.
      // Se leen ANTES de escribir para poder comparar el total contra lo que
      // Mercado Pago dice que se cobró: hasta ahora se marcaba pagado con
      // mirar solo `status === "approved"`, sin verificar ni una vez el monto.
      const { data: pendingOrders, error: pendingError } = await supabase
        .from("orders")
        .select("id, store_id, total_price")
        .in("id", orderIds)
        .eq("payment_method", "mercadopago")
        .eq("payment_status", "pending");

      if (pendingError) throw pendingError;

      if (!pendingOrders || pendingOrders.length === 0) {
        // Ya las confirmó un webhook anterior (MP reintenta el mismo evento) o
        // el pago apunta a órdenes que no están esperando cobro.
        return new Response("ok", { status: 200 });
      }

      const expectedTotal = pendingOrders.reduce(
        (sum: number, o: { total_price: number }) => sum + Number(o.total_price),
        0,
      );
      // Pesos enteros en todo el sistema (ver CLAUDE.md), así que redondear
      // alcanza: no hay centavos que perdonar.
      const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));

      if (paidAmount < expectedTotal) {
        // Se cobró menos de lo que suman las órdenes. Puede ser un intento de
        // pagar de menos, o un pago partido en dos medios (MP manda un webhook
        // por cada uno y cada `transaction_amount` es parcial). En los dos
        // casos lo correcto es NO dar la venta por cobrada y que el vendedor
        // mire: marcar `paid` de más regala mercadería, marcar `needs_review`
        // de más solo pide una revisión.
        console.warn(
          `Pago ${payment.id}: se cobraron ${paidAmount} y las órdenes suman ${expectedTotal}.`,
        );
        const { data: flagged, error: flagError } = await supabase
          .from("orders")
          .update({ payment_status: "needs_review", payment_id: String(payment.id) })
          .in("id", pendingOrders.map((o: { id: string }) => o.id))
          .eq("payment_method", "mercadopago")
          .eq("payment_status", "pending")
          .select("id, store_id");

        if (flagError) throw flagError;
        await notifyStoreOwners(supabase, flagged ?? [], "mp_payment_amount_mismatch", {
          paid_amount: paidAmount,
          expected_amount: expectedTotal,
        });
        return new Response("ok", { status: 200 });
      }

      const { data: updated, error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          status: "paid",
          payment_id: String(payment.id),
        })
        .in("id", pendingOrders.map((o: { id: string }) => o.id))
        .eq("payment_method", "mercadopago")
        .eq("payment_status", "pending")
        .select("id, store_id");

      if (error) throw error;
      await notifyStoreOwners(supabase, updated ?? [], "order_paid");
    } else if (DISPUTED_STATUSES.includes(payment.status)) {
      // Devolución, contracargo o disputa abierta: la plata ya no está, pero
      // hasta ahora la orden se quedaba en `paid` para siempre y el vendedor
      // despachaba igual. Se marca para revisión (no `rejected`: el pedido
      // puede estar entregado, lo resuelve una persona) y se le avisa.
      const { data: disputed, error: disputedError } = await supabase
        .from("orders")
        .update({ payment_status: "needs_review" })
        .in("id", orderIds)
        .eq("payment_method", "mercadopago")
        .eq("payment_id", String(payment.id))
        .eq("payment_status", "paid")
        .select("id, store_id");

      if (disputedError) throw disputedError;
      await notifyStoreOwners(supabase, disputed ?? [], "mp_payment_refunded", {
        mp_status: payment.status,
      });
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
