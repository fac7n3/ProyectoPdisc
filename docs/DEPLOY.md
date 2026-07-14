# Guía de deploy — Baradero Local

> F11-07. Pasos para llevar el proyecto a producción desde cero, o para
> entender la configuración actual si algo deja de funcionar después de un
> cambio de dominio/credenciales.

## 1) Supabase (base de datos + auth + storage + edge functions)

1. Crear un proyecto en [supabase.com](https://supabase.com) (o usar el existente: `otzhdwuaffcplrveuadc`, org "Mercado Local").
2. Aplicar las migraciones de `db/schema/` **en orden** — ver [RUN_LOCAL.md](RUN_LOCAL.md) para el orden exacto y qué hace cada una (39 archivos al momento de escribir esto).
3. **Auth → Providers → Google**: cargar el Client ID/Secret de un proyecto de Google Cloud Console con el callback `https://<tu-proyecto>.supabase.co/auth/v1/callback` autorizado.
4. **Auth → URL Configuration** (¡el paso que más rompe deploys nuevos!):
   - **Site URL**: el dominio de producción real (ej. `https://proyectopdisc.vercel.app`), **no** `localhost`.
   - **Redirect URLs**: agregar `https://<tu-dominio>/**`. Si además querés seguir probando en local, sumá `http://localhost:<puerto>/**` sin borrar la de producción.
   - Síntoma si esto queda mal: el login con Google redirige a `localhost` y da `ERR_CONNECTION_REFUSED` aunque el código esté bien (el código arma la URL de vuelta con `window.location.origin`, dinámico — el problema es que Supabase no la deja pasar si no está en esta lista).
5. **Auth → Policies → Password**: activar "Leaked Password Protection" (checkbox simple, sin costo).
6. **Project Settings → Edge Functions → Secrets**: cargar `MP_ACCESS_TOKEN` (ver sección Mercado Pago abajo).
7. **Storage**: los buckets `products`/`stores` (públicos) y `payment-proofs` (privado) ya vienen con sus policies en las migraciones — no necesitan config manual.

## 2) Vercel (hosting)

1. Conectar el repo de GitHub (`fac7n3/ProyectoPdisc`, rama `main`) a un proyecto de Vercel — framework autodetectado como Vite.
2. **Project Settings → Environment Variables**: cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API — el `.env` del repo ya **no** los tiene, ver nota abajo; Vercel construye desde cero en cada deploy, no sirve el `dist/` commiteado directamente).
3. Cada push a `main` dispara un deploy automático a producción. **Si el repo pasa a privado, Vercel deja de poder deployar** (queda `BLOCKED` sin build logs) — causa real (investigado 2026-07-14): el plan **Hobby** de Vercel no permite deployar un repo privado cuando el proyecto pertenece a un **Team** (acá, `baradero-local`); es un chequeo de plan/billing, no un permiso del GitHub App que haya que reotorgar. Para tener el repo privado y seguir deployando: upgradear el team a Pro, o mover el proyecto a una cuenta personal, o reemplazar la integración Git nativa por GitHub Actions + `vercel deploy --prebuilt`.
4. **Dominio propio** (cuando se compre uno): Project Settings → Domains → agregar el dominio, seguir las instrucciones de DNS. Después de esto, hay que **repetir el paso 4 de Supabase** (Site URL/Redirect URLs) con el nuevo dominio, o el login con Google se rompe de nuevo.

## 3) Mercado Pago (pagos)

1. Cuenta de [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel).
2. Dentro de la aplicación, pestaña **"Credenciales de producción"** (no "de prueba") → copiar el **Access Token**.
3. Cargarlo como secret `MP_ACCESS_TOKEN` en Supabase (Project Settings → Edge Functions → Secrets) — mismo nombre que en desarrollo, no requiere tocar código ni volver a desplegar las funciones (`mp-create-preference`, `mp-webhook`).
4. Nada más que configurar del lado de Mercado Pago: el webhook (`notification_url`) se manda automático en cada preferencia creada, apuntando a `https://<proyecto>.supabase.co/functions/v1/mp-webhook`.
5. **Importante**: mientras el secret tenga el Access Token de **prueba**, todo pago es simulado (sandbox) aunque el sitio esté en producción. El cambio a plata real es únicamente reemplazar ese secret.

## 4) Checklist antes de anunciar el lanzamiento

- [ ] Migraciones aplicadas y verificadas (`get_advisors` sin hallazgos críticos nuevos).
- [ ] Google OAuth probado en el dominio real (no localhost).
- [ ] Un pago de prueba completo end-to-end con las credenciales de **producción** de Mercado Pago (arrancar con un monto bajo).
- [ ] Al menos un comercio real aprobado y con productos cargados (ver [GUIA_USUARIO.md](GUIA_USUARIO.md) para el flujo de alta de vendedor).
- [ ] Política de privacidad + botón de arrepentimiento (requisito legal en Argentina para e-commerce, Res. 424/2020) — pendiente, no es un tema de código.
- [ ] Decidir el plan de Supabase (Free no tiene backups automáticos — ver [RUN_LOCAL.md](RUN_LOCAL.md) sección Fase 11 para el detalle de esta decisión).
