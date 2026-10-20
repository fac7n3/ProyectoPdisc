// A113-274: primer paso de la vinculación de la cuenta de Mercado Pago de un
// comercio. Devuelve la URL de autorización de Mercado Pago con un `state`
// aleatorio de un solo uso, guardado del lado del servidor y atado al usuario
// y a la tienda. mp-oauth-callback lo exige al volver.
//
// El client_id vive acá (secret MP_CLIENT_ID) y no en el front: antes el botón
// armaba la URL con VITE_MP_CLIENT_ID, una variable que había que cargar a mano
// también en Vercel -- si faltaba, la URL salía con "undefined" y nadie se enteraba.
//
// MP_OAUTH_PKCE=true: usar PKCE (code_challenge S256). Hace falta si la
// aplicación en Mercado Pago tiene activado "authorization code con PKCE"
// (Tus integraciones -> la app -> Detalles de la aplicación); si no lo tiene,
// dejarlo apagado.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_CLIENT_ID = Deno.env.get("MP_CLIENT_ID")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://proyectopdisc.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USE_PKCE = Deno.env.get("MP_OAUTH_PKCE") === "true";

// Tiene que coincidir EXACTO con la Redirect URL cargada en la aplicación de
// Mercado Pago, y con la que usa mp-oauth-callback al canjear el code.
const REDIRECT_URI = `${SITE_URL}/pages/vender.html`;
const AUTH_URL = "https://auth.mercadopago.com/authorization";
const STATE_TTL_MS = 10 * 60 * 1000; // el `code` de MP también vale 10 minutos

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const { store_id: storeId } = await req.json();
    if (typeof storeId !== "string" || !UUID_RE.test(storeId)) {
      return jsonResponse({ error: "Falta indicar qué comercio querés vincular." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesión inválida." }, 401);
    }

    const { data: store } = await callerClient
      .from("stores")
      .select("id, owner_id")
      .eq("id", storeId)
      .single();

    if (!store || store.owner_id !== userData.user.id) {
      return jsonResponse({ error: "No sos el dueño de este comercio." }, 403);
    }

    const state = randomToken();
    let codeVerifier: string | null = null;
    const params: Record<string, string> = {
      client_id: MP_CLIENT_ID,
      response_type: "code",
      platform_id: "mp",
      state,
      redirect_uri: REDIRECT_URI,
    };

    if (USE_PKCE) {
      codeVerifier = randomToken(48); // 64 caracteres, dentro de los 43-128 que pide MP
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
      params.code_challenge = base64Url(new Uint8Array(digest));
      params.code_challenge_method = "S256";
    }

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Limpieza de paso: los intentos vencidos (nadie volvió de Mercado Pago).
    await serviceClient.from("mp_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const { error: insertError } = await serviceClient.from("mp_oauth_states").insert({
      state,
      store_id: storeId,
      user_id: userData.user.id,
      code_verifier: codeVerifier,
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });
    if (insertError) throw insertError;

    return jsonResponse({ url: `${AUTH_URL}?${new URLSearchParams(params).toString()}` });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Hubo un error interno. Probá de nuevo en un rato." }, 500);
  }
});
