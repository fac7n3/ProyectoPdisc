// F2-07: webhook público de Mercado Pago. Sin JWT (MP llama anónimo) —
// verify_jwt=false a propósito, la autenticación acá es "re-confirmar contra
// la API real de MP con nuestro Access Token", nunca confiar en el payload
// del webhook en sí (puede ser spoofeado; el payment_id sí es real y MP no
// te deja leer el pago de otra cuenta con tu propio access token).

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    let type = url.searchParams.get("type") ?? url.searchParams.get("topic");

    if (!paymentId && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body?.data?.id) {
        paymentId = String(body.data.id);
        type = body.type ?? type;
      }
    }

    // Pings de prueba / otros tipos de evento (no "payment") -- no hay nada que hacer.
    if (!paymentId || type !== "payment") {
      return new Response("ok", { status: 200 });
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!paymentRes.ok) {
      // Id de pago inexistente o de otra cuenta -- no confiamos en nada del
      // webhook que no podamos re-confirmar contra la API real.
      return new Response("ok", { status: 200 });
    }

    const payment = await paymentRes.json();
    const orderIds: string[] = (payment.external_reference ?? "")
      .split(",")
      .filter(Boolean);
    if (orderIds.length === 0) {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
