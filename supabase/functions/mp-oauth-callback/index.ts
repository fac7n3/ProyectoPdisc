// P0-6: intercambia el `code` de la vinculación OAuth de un vendedor con
// Mercado Pago Marketplace por su access_token/refresh_token, y los guarda
// en `store_mp_credentials` (RLS sin policies -- solo esta función, con
// service role, puede escribir ahí). Actualiza `stores.mp_collector_id` con
// el `user_id` que devuelve MP (eso es el `collector_id` que usa
// mp-create-preference para armar la preferencia a nombre del vendedor).
//
// Seguridad: verify_jwt=true (lo llama el vendedor ya autenticado desde
// vender.js). El cliente scoped al JWT del llamador se usa solo para
// confirmar ownership del store_id (mismo criterio del resto del proyecto:
// nunca confiar en un store_id que mande el cliente sin revalidar). El
// intercambio de `code` por tokens y el guardado en la base usan un cliente
// con SERVICE_ROLE_KEY, igual que mp-webhook.
//
// ⚠️ PENDIENTE ANTES DE RETOMAR LA VINCULACIÓN (A113-274): FALTA EL `state`.
// El flujo OAuth no lleva parámetro `state`, así que nada ata el `code` que
// llega a la persona que arrancó la vinculación. Si alguien consigue que un
// vendedor ya logueado dispare esta función con un `code` ajeno (por ejemplo
// mandándole un link a vender.html con ese code en la query), la tienda del
// vendedor queda vinculada a la cuenta de Mercado Pago DEL ATACANTE -- y a
// partir de ahí todos los cobros de esa tienda van a esa cuenta. Es el ataque
// clásico de "account linking" de OAuth.
// Hoy no es explotable porque NADA en el frontend llama a esta función (la
// vinculación quedó pausada, ver A113-274 en CLAUDE.md), pero hay que
// resolverlo ANTES de cablearla: generar un `state` aleatorio al abrir el
// consentimiento, guardarlo del lado del servidor asociado al usuario, y acá
// exigirlo y compararlo antes de intercambiar el `code`.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID")!;
const MP_CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://proyectopdisc.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REDIRECT_URI = `${SITE_URL}/pages/vender.html`;

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
    const { code, store_id: storeId } = await req.json();
    if (!code || !storeId) {
      return jsonResponse({ error: "code y store_id son requeridos." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesión inválida." }, 401);
    }

    const { data: store, error: storeError } = await callerClient
      .from("stores")
      .select("id, owner_id")
      .eq("id", storeId)
      .single();

    if (storeError || !store || store.owner_id !== userData.user.id) {
      return jsonResponse({ error: "No sos el dueño de este comercio." }, 403);
    }

    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      console.error("Error de OAuth de Mercado Pago:", token);
      return jsonResponse({ error: "No se pudo vincular la cuenta de Mercado Pago." }, 502);
    }

    const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 0) * 1000).toISOString();
    const mpUserId = String(token.user_id);

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Una cuenta de Mercado Pago no puede quedar vinculada a dos tiendas.
    // `stores.mp_collector_id` no tiene unique, y mp-webhook resuelve el token
    // del vendedor buscando por ese campo: con dos filas no sabe cuál usar,
    // cae al token global, no puede leer el pago y la venta no se confirma
    // nunca -- sin ningún error visible para el vendedor.
    const { data: alreadyLinked, error: linkedError } = await serviceClient
      .from("stores")
      .select("id, name")
      .eq("mp_collector_id", mpUserId)
      .neq("id", storeId)
      .limit(1);

    if (linkedError) throw linkedError;

    if (alreadyLinked && alreadyLinked.length > 0) {
      return jsonResponse({
        error:
          `Esa cuenta de Mercado Pago ya está vinculada a otro comercio ("${alreadyLinked[0].name}"). ` +
          "Desvinculala de ahí primero, o usá otra cuenta.",
      }, 409);
    }

    const { error: upsertError } = await serviceClient
      .from("store_mp_credentials")
      .upsert({
        store_id: storeId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        mp_user_id: mpUserId,
        expires_at: expiresAt,
      });

    if (upsertError) throw upsertError;

    const { error: storeUpdateError } = await serviceClient
      .from("stores")
      .update({ mp_collector_id: mpUserId })
      .eq("id", storeId);

    if (storeUpdateError) throw storeUpdateError;

    return jsonResponse({ ok: true, mp_collector_id: mpUserId });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno." }, 500);
  }
});
