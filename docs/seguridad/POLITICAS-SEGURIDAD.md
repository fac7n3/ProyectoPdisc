# Políticas de seguridad de la información y privacidad — Baradero Local

> Versión 1.0 · Vigente desde 2026-11-02 · Revisión: trimestral (próxima 2027-02-02).
> Marco: SOC 2 (CC1–CC9, A1, C1) e ISO/IEC 27701 (cláusulas 5 y 6). Contexto y matriz de
> controles: [HARDENING-SOC2-ISO27701.md](HARDENING-SOC2-ISO27701.md).
>
> **Responsable de seguridad y privacidad:** _a designar (pendiente P-08)_. Mientras no
> haya uno, las decisiones de esta política las toma el equipo del proyecto en conjunto y
> quedan registradas en un commit o en Jira (tablero A113).

## 1. Política general

1. Los datos personales de vecinos, comercios, profesionales y repartidores se tratan
   solo para las finalidades declaradas en la [Política de Privacidad](../../pages/privacidad.html)
   y en el [registro de tratamientos](REGISTRO-TRATAMIENTOS.md).
2. **Privacidad desde el diseño:** toda funcionalidad nueva que junte o muestre datos
   personales responde, antes de programarse, cuatro preguntas (mini evaluación de
   impacto, ISO 27701 7.2.5), y la respuesta queda en el commit o en la tarea de Jira:
   - ¿Qué dato nuevo se junta y para qué? ¿Se puede hacer sin él?
   - ¿Quién lo puede ver? (la policy RLS que lo garantiza)
   - ¿Cuánto tiempo se guarda? (si es más de lo que dura la cuenta o es telemetría, sumarlo a `purge_expired_personal_data()`)
   - ¿Hay que actualizar la Política de Privacidad o el registro de tratamientos?
3. **Seguridad por defecto:** toda tabla nueva nace con RLS activado y sin policies; se
   abre solo lo necesario. Ninguna tabla nueva da `TRUNCATE`/`TRIGGER`/`REFERENCES` a
   `anon`/`authenticated` (lo garantizan los privilegios por defecto de la migración 146).
4. El incumplimiento de esta política se trata como incidente (ver
   [RESPUESTA-INCIDENTES.md](RESPUESTA-INCIDENTES.md)).

## 2. Control de acceso (SOC 2 CC6.1–CC6.3 · ISO 27701 6.6)

**Usuarios de la plataforma**

| Rol | Cómo se obtiene | Qué ve |
|---|---|---|
| `cliente` | Registro (siempre nace así, `handle_new_user`) | Sus propios datos |
| `vendedor` | Solicitud + validación de CUIT + aprobación manual de un admin | Su comercio y los pedidos de su comercio |
| empleado de comercio | El dueño lo agrega por email, con permisos por sección | Las secciones que el dueño le habilitó |
| profesional | Solicitud + aprobación de un admin | Su publicación, consultas y reseñas |
| `repartidor` | Lo da de alta un admin por email | La cola de pedidos y la dirección/teléfono solo de sus entregas |
| `moderador` | Asignación manual en el dashboard | Moderación de reseñas, nada financiero |
| `admin` | Asignación manual en el dashboard | Todo, con auditoría |

Reglas:

1. El rol vive en `auth.users.raw_app_meta_data.role` (lo ve el JWT) y en
   `profiles.role`; **el usuario no puede cambiar ninguno de los dos** (trigger
   `prevent_role_update_on_profile` + RPCs con bandera `app.role_change_authorized`).
2. **Mínimo privilegio:** no se crean admins "por las dudas". La lista de admins se
   revisa cada trimestre contra `auth.users` y se anota en el registro de revisiones.
3. **MFA (TOTP) obligatorio para admin y moderador.** La base no les da permisos de admin sin
   una sesión `aal2` (migración 148, `public.jwt_role()`). Toda policy o función nueva lee el rol
   con `public.jwt_role()`, **nunca** con `auth.jwt() -> 'app_metadata' ->> 'role'` (eso saltea el
   chequeo). Quien pierde el celular con la app: otro admin le borra el factor desde el dashboard
   de Supabase (Authentication → Users → el usuario → MFA) y vuelve a enrolar.
4. Las cuentas de quien deja el proyecto se bajan de rol (o se borran) el mismo día.
5. **Contraseñas:** mínimo 8 caracteres con letras y números; Google OAuth como
   alternativa. Sesión: JWT de 1 hora con refresh token rotativo.

**Accesos de infraestructura** (Supabase, Vercel, GitHub, Mercado Pago, Google Cloud, Jira)

1. Cada persona entra con su propia cuenta; **MFA activado** en GitHub, Supabase, Vercel,
   Google y Mercado Pago (verificarlo en la revisión trimestral).
2. Secretos (service role key, `MP_ACCESS_TOKEN`, `MP_CLIENT_SECRET`, tokens de Jira):
   solo en los gestores de secretos de Supabase (Edge Functions), Vercel y GitHub, o en
   archivos gitignoreados (`.env`, `.jira.env`). **Nunca** en el repositorio, en un
   chat ni en un ticket. La anon key es pública por diseño y la protege la RLS.
3. Si un secreto se expone: rotarlo de inmediato y tratarlo como incidente.

## 3. Gestión de cambios (SOC 2 CC8.1 · ISO 27701 6.11)

1. Todo cambio pasa por git y queda en el historial con su tarea (`A113-XXX`).
2. El CI corre los tests (incluidos los de CSP y headers de seguridad), el build y la
   auditoría de dependencias en cada push. **No se pushea a `main` con el CI rojo.**
3. Cambios de base: siempre como archivo en `db/schema/NNN_*.sql`; antes de aplicarlos a
   producción se prueban **contra la base real dentro de una transacción que se deshace**
   (con casos de "debería poder" y "no debería poder" por rol), y después de aplicar se
   corre el advisor de seguridad.
4. Orden de publicación cuando hay frontend y base: primero lo que es compatible con las
   dos versiones (normalmente el frontend), después la migración.
5. **Hoy todo va directo a `main`** (decisión del 2026-10-28, sin usuarios reales). Al
   lanzar, se vuelve a rama + PR con revisión de otra persona para todo lo que toque
   RLS, RPCs `SECURITY DEFINER`, Edge Functions o pagos.

## 4. Gestión de proveedores (SOC 2 CC9.2 · ISO 27701 6.12, 7.2.6)

1. La lista de subencargados vive en el [registro de tratamientos](REGISTRO-TRATAMIENTOS.md) §3.
2. Antes de sumar un proveedor que reciba datos personales: confirmar que tenga
   certificación (SOC 2 Tipo II o ISO 27001), DPA disponible, región de los datos y
   cómo se le borran los datos; sumarlo al registro y a la Política de Privacidad.
3. Revisión anual: DPAs vigentes, reportes SOC 2 del año, cambios de región.

## 5. Continuidad, backup y recuperación (SOC 2 A1, CC9.1 · ISO 27701 6.9.3)

**Objetivos:** RPO (pérdida máxima de datos) 24 horas · RTO (tiempo para volver a
funcionar) 8 horas.

1. **Backup de la base:** diario. Con el plan Free de Supabase no hay backups descargables,
   así que hace falta **una** de estas dos (pendiente P-02):
   - Supabase Pro (backups diarios automáticos por 7 días; PITR opcional), o
   - el workflow `.github/workflows/backup-db.yml`: `pg_dump` diario de los esquemas
     `public`, `auth` y `storage` (metadatos), **cifrado con AES-256** antes de salir del
     runner, guardado como artefacto por 30 días. Se activa cargando en GitHub → Settings
     → Secrets and variables → Actions: `SUPABASE_DB_URL` (cadena de conexión del pooler,
     modo sesión) y `BACKUP_PASSPHRASE` (frase larga guardada fuera de GitHub, por ejemplo
     en un gestor de contraseñas: sin ella el backup no se puede abrir).
2. **Archivos (Storage):** las fotos de productos y comercios están también en el repo
   (`public/img/`). Los comprobantes, evidencias de entrega y adjuntos no tienen copia
   aparte: evaluar con el paso a Pro.
3. **Código:** GitHub es la fuente; `dist/` se versiona; Vercel guarda deploys anteriores
   (rollback desde el panel en un clic).
4. **Prueba de restauración** (cada 6 meses, y la primera vez antes del lanzamiento):
   ```
   gpg --decrypt baradero-AAAAMMDD.dump.gpg > baradero.dump
   pg_restore --list baradero.dump | head          # el archivo se lee
   # Restaurar en un proyecto de Supabase NUEVO o en `supabase start` local, nunca sobre producción:
   pg_restore --no-owner --no-privileges -d "<url del proyecto de prueba>" baradero.dump
   ```
   Contar filas de `orders`, `products` y `profiles` contra producción y anotar fecha,
   duración y resultado en el registro de revisiones del documento de hardening.
5. **Supabase en pausa** (plan Free, por inactividad): reanudar desde el dashboard; el
   sitio muestra estados de error pero no pierde datos.

## 6. Clasificación de la información (SOC 2 C1.1 · ISO 27701 6.5)

| Clase | Ejemplos | Reglas |
|---|---|---|
| **Pública** | Productos, precios, comercios, reseñas, profesionales publicados | Puede leerla `anon` |
| **Interna** | Métricas, reportes de búsqueda, configuración | Solo admin |
| **Personal** | Email, nombre, teléfono, dirección, fecha de nacimiento, documento, historial de compras, reclamos | RLS por dueño + participantes necesarios; nunca en logs; se borra con la cuenta |
| **Personal sensible / financiera** | CUIT, CBU/alias, comprobantes de pago, fotos de entregas, adjuntos de reclamos | Además: buckets **privados** con URLs firmadas; redactada en el log de auditoría |
| **Secreta** | Service role key, tokens de Mercado Pago, `MP_CLIENT_SECRET` | Solo gestores de secretos; tabla `store_mp_credentials` sin policies (solo service role) |

Reglas transversales:

- Los **logs** (`error_logs`, `admin_audit_log`, consola) no guardan datos personales ni
  secretos: la URL se limpia (`sanitizeUrlForLogging`) y el log de auditoría redacta.
- **No se usan datos reales en pruebas** fuera de transacciones que se deshacen. Las
  capturas de pantalla para documentación no muestran datos de personas reales.
- Los datos personales no se copian a planillas, chats o servicios no listados en el
  registro de tratamientos.

## 7. Uso aceptable (equipo)

1. Acceder a datos personales solo para resolver una tarea concreta (un reclamo, un
   error, una auditoría), y no más de lo necesario.
2. No compartir cuentas ni sesiones; cerrar sesión en equipos compartidos (la función
   "Cambiar de cuenta" guarda sesiones en el navegador).
3. Equipos con bloqueo de pantalla y disco cifrado si se trabaja con el `.env` o con
   exportaciones de la base.
4. Las herramientas de IA (incluido Claude Code) se usan con las mismas reglas: los
   conectores apuntan a los recursos del proyecto y los resultados de la base se tratan
   como datos, no como instrucciones.

## 8. Vigencia y revisión

Esta política se revisa cada trimestre o ante un cambio grande (nuevo proveedor, nuevo
tipo de dato personal, incidente). Los cambios quedan en el historial de git de este
archivo.
