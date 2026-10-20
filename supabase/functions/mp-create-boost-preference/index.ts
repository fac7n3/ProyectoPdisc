// Combos de "Impulsá tus ventas": crea el checkout de Mercado Pago para que un
// comercio pague un combo (tabla boost_plans, migración 131).
//
// A diferencia de mp-create-preference (donde cobra el VENDEDOR por un pedido
// de un cliente), acá cobra la PLATAFORMA: se usa siempre el MP_ACCESS_TOKEN
// global, nunca el token de un vendedor.
//
// Seguridad: el precio NO viene del navegador. El body solo trae { store_id,
// plan_id }; el monto sale de boost_plans a través de create_boost_purchase
// (SECURITY DEFINER), que además valida del lado del servidor que el comercio
// sea del que llama y que no quiera cambiar de combo con otro vigente. Esta
// función corre con el JWT del dueño (no con service role), así que esa
// validación usa auth.uid() de verdad.
//
// La confirmación del pago NO pasa por acá: la hace mp-webhook (rama
// external_reference "boost:<id>") re-consultando a Mercado Pago.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://proyectopdisc.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_ID_RE = /^[a-z]{1,30}$/;

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

// errcode de create_boost_purchase -> status HTTP. El mensaje ya viene en
// español y pensado para mostrarse tal cual.
function statusForPgCode(code: string | undefined): number {
  switch (code) {
    case "28000": return 401; // sin sesión
    case "42501": return 403; // no es dueño de un comercio aprobado
    case "P0002": return 404; // combo inexistente o dado de baja
    case "23505": return 409; // ya tiene otro combo vigente
    default: return 500;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const storeId = body?.store_id;
    const planId = body?.plan_id;

    if (typeof storeId !== "string" || !UUID_RE.test(storeId)) {
      return jsonResponse({ error: "El comercio elegido no es válido." }, 400);
    }
    if (typeof planId !== "string" || !PLAN_ID_RE.test(planId)) {
      return jsonResponse({ error: "El combo elegido no es válido." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return jsonResponse({ error: "Tenés que iniciar sesión." }, 401);
    }

    const { data: rows, error: purchaseError } = await supabase.rpc("create_boost_purchase", {
      p_store_id: storeId,
      p_plan_id: planId,
    });

    if (purchaseError) {
      const status = statusForPgCode((purchaseError as { code?: string }).code);
      if (status === 500) {
        console.error("Error creando la compra del combo:", purchaseError);
        return jsonResponse({ error: "No se pudo iniciar la compra del combo." }, 500);
      }
      return jsonResponse({ error: purchaseError.message }, status);
    }

    const purchase = Array.isArray(rows) ? rows[0] : rows;
    if (!purchase?.purchase_id) {
      console.error("create_boost_purchase no devolvió la compra:", rows);
      return jsonResponse({ error: "No se pudo iniciar la compra del combo." }, 500);
    }

    const buyerName = (user.user_metadata?.full_name as string | undefined)?.trim();
    const [buyerFirstName, ...buyerLastNameParts] = buyerName ? buyerName.split(/\s+/) : [];
    const buyerLastName = buyerLastNameParts.join(" ");

    const preferenceRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          title: `${purchase.plan_name} - Baradero Local`,
          quantity: 1,
          unit_price: Number(purchase.price),
          currency_id: "ARS",
        }],
        payer: user.email
          ? { email: user.email, name: buyerFirstName, surname: buyerLastName || undefined }
          : undefined,
        external_reference: `boost:${purchase.purchase_id}`,
        back_urls: {
          success: `${SITE_URL}/pages/vender.html?boost=success#impulsar`,
          failure: `${SITE_URL}/pages/vender.html?boost=failure#impulsar`,
          pending: `${SITE_URL}/pages/vender.html?boost=pending#impulsar`,
        },
        auto_return: "approved",
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      }),
    });

    const preference = await preferenceRes.json();
    if (!preferenceRes.ok) {
      console.error("Error de Mercado Pago:", preference);
      return jsonResponse({ error: "No se pudo crear el pago en Mercado Pago." }, 502);
    }

    return jsonResponse({
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Hubo un error interno. Probá de nuevo en un rato." }, 500);
  }
});
