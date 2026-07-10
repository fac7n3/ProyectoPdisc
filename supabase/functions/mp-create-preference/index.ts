// F2-07: crea una preferencia de Checkout Pro (Mercado Pago) para una o más
// órdenes ya existentes (create_order, pending, payment_method='mercadopago').
// El Access Token de MP es secreto y SOLO vive acá (Edge Function) — el
// frontend nunca lo ve, solo recibe el link de checkout ya armado.
//
// Seguridad: el cliente Supabase se crea con el JWT del usuario que llama
// (no service role), así que las RLS existentes de `orders` (orders_select_own)
// son las que deciden qué órdenes puede usar — mismo criterio que el resto del
// proyecto (nunca confiar en datos del cliente sin revalidar server-side).

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://proyectopdisc.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const { order_ids: orderIds } = await req.json();
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return jsonResponse({ error: "order_ids requerido." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, store_id, total_price, payment_method, payment_status")
      .in("id", orderIds);

    if (error) throw error;

    if (!orders || orders.length !== orderIds.length) {
      return jsonResponse({ error: "Alguna orden no existe o no te pertenece." }, 403);
    }

    const invalid = orders.find(
      (o: { payment_method: string; payment_status: string }) =>
        o.payment_method !== "mercadopago" || o.payment_status !== "pending",
    );
    if (invalid) {
      return jsonResponse(
        { error: "Alguna orden no está pendiente de pago con Mercado Pago." },
        400,
      );
    }

    const items = orders.map((o: { id: string; total_price: number }) => ({
      title: `Pedido Baradero Local #${o.id.slice(0, 8)}`,
      quantity: 1,
      unit_price: Number(o.total_price),
      currency_id: "ARS",
    }));

    const preferenceRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items,
        external_reference: orderIds.join(","),
        back_urls: {
          success: `${SITE_URL}/pages/perfil.html?mp=success`,
          failure: `${SITE_URL}/pages/carrito.html?mp=failure`,
          pending: `${SITE_URL}/pages/perfil.html?mp=pending`,
        },
        auto_return: "approved",
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      }),
    });

    const preference = await preferenceRes.json();
    if (!preferenceRes.ok) {
      console.error("Error de Mercado Pago:", preference);
      return jsonResponse({ error: "No se pudo crear la preferencia de pago." }, 502);
    }

    return jsonResponse({
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno." }, 500);
  }
});
