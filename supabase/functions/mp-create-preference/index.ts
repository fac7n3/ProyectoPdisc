// F2-07 + P0-6 (split payments piloto): crea una preferencia de Checkout Pro
// para una o más órdenes ya existentes (create_order, pending,
// payment_method='mercadopago').
//
// Antes de P0-6, esto cobraba TODO con la cuenta de Mercado Pago de la
// plataforma (un solo MP_ACCESS_TOKEN global) -- ningún vendedor recibía
// la plata directo. Ahora, si el vendedor de la tienda vinculó su cuenta
// (store_mp_credentials + stores.mp_collector_id), la preferencia se arma
// con EL ACCESS TOKEN DEL VENDEDOR + un `marketplace_fee` (comisión de la
// plataforma, arranca en 0%). Simplificación a propósito del piloto: MP no
// permite dividir un solo pago entre varios collector_id (una preferencia =
// un solo vendedor), así que si `order_ids` mezcla más de una tienda, se
// rechaza con un mensaje claro en vez de intentar algo que no es posible.
//
// Seguridad: el cliente scoped al JWT del llamador decide qué órdenes puede
// pagar (RLS `orders_select_own`, igual que antes). El access_token del
// vendedor se lee con un cliente service-role aparte (mismo modelo de
// confianza que mp-webhook) -- nunca sale de esta función.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://proyectopdisc.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID")!;
const MP_CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET")!;
const MP_MARKETPLACE_FEE_PCT = Number(Deno.env.get("MP_MARKETPLACE_FEE_PCT") ?? "0");

// Refrescar si falta menos de un día para el vencimiento (o ya venció).
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

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

async function refreshVendorToken(
  serviceClient: ReturnType<typeof createClient>,
  storeId: string,
  refreshToken: string,
) {
  const res = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const token = await res.json();
  if (!res.ok || !token.access_token) {
    return null;
  }
  const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 0) * 1000).toISOString();
  await serviceClient
    .from("store_mp_credentials")
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? refreshToken,
      expires_at: expiresAt,
    })
    .eq("store_id", storeId);
  return token.access_token as string;
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

    const { data: userData } = await supabase.auth.getUser();
    const buyerEmail = userData?.user?.email;
    const buyerName = (userData?.user?.user_metadata?.full_name as string | undefined)?.trim();
    const [buyerFirstName, ...buyerLastNameParts] = buyerName ? buyerName.split(/\s+/) : [];
    const buyerLastName = buyerLastNameParts.join(" ");

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

    const storeIds = [...new Set(orders.map((o: { store_id: string }) => o.store_id))];
    if (storeIds.length > 1) {
      return jsonResponse(
        {
          error:
            "Mercado Pago todavía no soporta pagar a varios comercios en un solo pago. Pagá cada comercio por separado.",
        },
        400,
      );
    }
    const storeId = storeIds[0] as string;

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: store, error: storeError } = await serviceClient
      .from("stores")
      .select("mp_split_pilot, mp_collector_id")
      .eq("id", storeId)
      .single();

    if (storeError || !store?.mp_split_pilot || !store.mp_collector_id) {
      return jsonResponse(
        { error: "Este comercio todavía no tiene Mercado Pago vinculado." },
        400,
      );
    }

    const { data: creds, error: credsError } = await serviceClient
      .from("store_mp_credentials")
      .select("access_token, refresh_token, expires_at")
      .eq("store_id", storeId)
      .single();

    if (credsError || !creds) {
      return jsonResponse(
        { error: "Este comercio todavía no tiene Mercado Pago vinculado." },
        400,
      );
    }

    let vendorAccessToken = creds.access_token as string;
    const expiresAt = new Date(creds.expires_at as string).getTime();
    if (expiresAt - Date.now() < REFRESH_MARGIN_MS) {
      const refreshed = await refreshVendorToken(serviceClient, storeId, creds.refresh_token as string);
      if (!refreshed) {
        return jsonResponse(
          {
            error:
              "El vendedor tiene que volver a vincular su cuenta de Mercado Pago (el acceso venció).",
          },
          409,
        );
      }
      vendorAccessToken = refreshed;
    }

    const totalAmount = orders.reduce(
      (sum: number, o: { total_price: number }) => sum + Number(o.total_price),
      0,
    );
    const marketplaceFee = Math.round((totalAmount * MP_MARKETPLACE_FEE_PCT) / 100);

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
        Authorization: `Bearer ${vendorAccessToken}`,
      },
      body: JSON.stringify({
        items,
        marketplace_fee: marketplaceFee,
        payer: buyerEmail
          ? { email: buyerEmail, name: buyerFirstName, surname: buyerLastName || undefined }
          : undefined,
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
