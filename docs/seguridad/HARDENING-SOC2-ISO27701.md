# Hardening de Baradero Local — SOC 2 + ISO/IEC 27701

> Proceso de hardening y análisis de brechas (gap analysis) de la plataforma contra
> **SOC 2** (AICPA Trust Services Criteria 2017, revisión 2022: Seguridad, Disponibilidad,
> Confidencialidad, Integridad del Procesamiento y Privacidad) y **ISO/IEC 27701:2019**
> (extensión de privacidad de ISO 27001/27002, controles de *responsable del tratamiento*).
> Marco legal local: **Ley 25.326** de Protección de Datos Personales (Argentina).
>
> Fecha: 2026-11-02 · Próxima revisión: **2027-02-02** (trimestral) o ante un cambio grande.
>
> **Esto no es una certificación.** SOC 2 lo emite un auditor (CPA) después de un período
> de observación, e ISO 27701 un organismo certificador sobre un SGSI ISO 27001. Este
> documento deja la plataforma *lista para empezar* ese camino: controles técnicos
> aplicados, políticas escritas y la lista de lo que falta, con dueño.

Documentos del paquete:

| Documento | Qué cubre |
|---|---|
| Este archivo | Alcance, qué se hizo, matriz de controles, pendientes priorizados |
| [POLITICAS-SEGURIDAD.md](POLITICAS-SEGURIDAD.md) | Políticas: seguridad de la información, accesos, cambios, proveedores, continuidad, clasificación, uso aceptable |
| [REGISTRO-TRATAMIENTOS.md](REGISTRO-TRATAMIENTOS.md) | Registro de actividades de tratamiento, subencargados, transferencias internacionales, plazos de retención y procedimiento de derechos del titular |
| [RESPUESTA-INCIDENTES.md](RESPUESTA-INCIDENTES.md) | Plan de respuesta a incidentes, incluida la brecha de datos personales |
| [`/SECURITY.md`](../../SECURITY.md) | Cómo reportar una vulnerabilidad |

---

## 1. Alcance

**Sistema en alcance:** el sitio `proyectopdisc.vercel.app` (Vite multipágina, JS vanilla),
la base y servicios de Supabase (proyecto `otzhdwuaffcplrveuadc`, Postgres 17, región
`us-west-2`), las 6 Edge Functions (`supabase/functions/`), el repositorio
`fac7n3/ProyectoPdisc` y su CI, y las integraciones con Mercado Pago y Google OAuth.

**Rol de privacidad (ISO 27701):** Baradero Local es **responsable del tratamiento**
(controller) de los datos de clientes, vendedores, profesionales y repartidores. Los
comercios reciben datos de sus compradores para cumplir el pedido (son responsables de lo
que hagan con ellos fuera de la plataforma; los Términos lo dicen). Supabase, Vercel,
Mercado Pago y Google son **encargados/subencargados** (ver el registro de tratamientos).

**Fuera de alcance:** facturación/AFIP (F12-18), dominio propio (F11-04), proveedores de
email/WhatsApp (F8-02/03), apps nativas.

## 2. Método

1. Inventario de datos personales tabla por tabla (51 tablas en `public`, 11 buckets).
2. Advisor de seguridad de Supabase + revisión manual de RLS, grants, triggers y cron.
3. Revisión de headers HTTP, CSP, CI, dependencias (`npm audit`) y configuración de Auth.
4. Mapeo de cada hallazgo a un criterio SOC 2 y a una cláusula/control de ISO 27701.
5. Corrección de todo lo que se podía resolver con código y verificación contra la base
   real (en transacciones deshechas antes de aplicar) y en navegador.
6. Lo que depende de una decisión, un pago o un acceso de cuenta queda en la sección 5.

## 3. Qué se hizo en este hardening (2026-11-02)

| # | Cambio | Dónde | SOC 2 | ISO 27701 | Verificación |
|---|---|---|---|---|---|
| H-01 | **Log de auditoría sin datos personales.** `log_admin_action` copiaba la fila entera: el log tenía **72 registros** con email, teléfono, DNI, CUIT, CBU, direcciones y mensajes de soporte, que sobrevivían a la baja de la cuenta. Ahora guarda solo las columnas que cambiaron (antes/después) y lo personal sale `[redactado]`; se redactaron las filas viejas. | migración 146 | CC7.2, P4.2, P4.3 | 7.4.1, 7.4.5, 7.4.7 | 0 valores personales en el log después de aplicar |
| H-02 | **Log de auditoría append-only.** Ni un admin desde la API ni `postgres` puede editarlo, borrarlo o truncarlo. Se permite solo que la FK anonimice `admin_id` al borrar la cuenta de un admin y la limpieza a los 2 años. | migración 146 | CC7.2, CC4.1 | 6.9.4 (27002 8.15) | UPDATE y TRUNCATE rechazados; SET NULL permitido |
| H-03 | **Eventos de seguridad de cualquier actor**: alta/baja/cambio de permisos de empleados de un comercio y vinculación/desvinculación/renovación de Mercado Pago (sin tokens). Antes solo se auditaba a admins. | migración 146 | CC6.2, CC6.3, CC7.2 | 6.6.2, 6.9.4 | alta de empleado de prueba quedó en el log |
| H-04 | **Retención automática** (pg_cron diario 03:17 ART): errores 90 días; búsquedas y vistas seudonimizadas a 30 días y borradas a 180; estados OAuth vencidos al día; notificaciones leídas al año; log de auditoría a 2 años. | migración 146, `purge_expired_personal_data()` | C1.2, P4.2 | 7.4.4, 7.4.7, 7.4.8 | función corrida en transacción; job programado |
| H-05 | **Mínimo privilegio en tablas**: se sacaron `TRUNCATE`, `TRIGGER` y `REFERENCES` a `anon`/`authenticated` en las 51 tablas y en las futuras (TRUNCATE salta la RLS; la API nunca lo usa). | migración 146 | CC6.1, CC6.3 | 6.6.1 | 0 grants restantes |
| H-06 | **`error_logs` sin suplantación**: un visitante no puede registrar errores a nombre de otra cuenta y cada campo tiene tope de largo (el insert es público). | migración 146 | CC7.2, PI1.2 | 6.9.4 | insert con `user_id` ajeno rechazado por RLS |
| H-07 | `_is_uuid` con `search_path` fijo (advisor). | migración 146 | CC8.1 | 6.11 | advisor |
| H-08 | **Headers HTTP**: HSTS 2 años, CSP de header (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`, `upgrade-insecure-requests`), COOP, `X-Permitted-Cross-Domain-Policies`, Permissions-Policy ampliada. Test nuevo `js/security-headers.test.mjs`. | `vercel.json` | CC6.6, CC6.7 | 6.10, 6.11 | 0 violaciones de CSP en 8 páginas (Chromium) |
| H-09 | **CI**: corre `npm test` (incluye CSP y headers), `npm audit` de producción bloqueante y de desarrollo informativo; token del workflow con `contents: read`. **Dependabot** semanal (npm) y mensual (Actions). | `.github/` | CC7.1, CC8.1 | 6.9.6, 6.11.2 | — |
| H-10 | **Dependencias**: 2 vulnerabilidades altas (Vite dev server, sharp/libheif) actualizadas dentro del rango (vite 8.3.5, sharp 0.35.5). Producción ya tenía 0. | `package-lock.json` | CC7.1 | 6.9.6 | `npm audit`: 0; build y tests OK |
| H-11 | **Contraseñas**: `supabase/config.toml` pasa de 6 caracteres sin requisitos a 8 con letras y números (igual que `js/register.js`). **Falta aplicarlo en el dashboard** (ver P-04). | `supabase/config.toml` | CC6.1 | 6.6.4 | — |
| H-12 | **Política de privacidad** actualizada: datos que realmente se tratan hoy, subencargados (incluidos Nominatim y Google Maps), transferencia internacional (art. 12), plazos concretos de retención y de respuesta a derechos (arts. 14 y 16), y qué pasa con los datos al dar de baja la cuenta. | `pages/privacidad.html` | P1.1, P2.1, P6.1 | 7.3.2, 7.3.3, 7.5.1, 7.5.2 | — |
| H-13 | Políticas, registro de tratamientos, plan de incidentes y `SECURITY.md`. | `docs/seguridad/` | CC1–CC3, CC7.3–CC7.5, P1–P8 | 5.x, 7.2.8, 6.13 | — |
| H-14 | Workflow de **backup diario cifrado** de la base (se activa cargando dos secretos; ver P-02). | `.github/workflows/backup-db.yml` | A1.2, A1.3 | 6.9.3 (27002 8.13) | **sin probar** hasta cargar los secretos |
| H-15 | **Verificación en dos pasos (TOTP) para admin y moderador, exigida en la base** (P-01). `public.jwt_role()` reemplaza la lectura del rol del JWT en las 98 policies y 25 funciones que la hacían: un admin/moderador sin sesión `aal2` queda como cliente. Modo "por cuenta" (arranque): se exige `aal2` a la cuenta que ya enroló un factor, así nadie queda sin panel mientras se enrolan; `security_settings.require_staff_mfa = true` lo vuelve obligatorio para todas (activarlo cuando las 3 cuentas tengan factor). Pantalla: alta con QR y baja en Mi perfil → Seguridad, código después de iniciar sesión (contraseña o Google) y guard de `admin.html` (pide el código o manda a activarla). | migración 151, `js/mfa.js`, `js/mfa-utils.js` | CC6.1 | 6.6.4 (27002 5.17, 8.5) | Base real en transacción deshecha: admin aal1 con factor → sin admin (perfiles 34→1, RPC rechazada), aal2 → admin; moderador igual; estricto: admin sin factor aal1 → sin admin; cliente/vendedor/anon sin cambios. Chromium con Supabase simulado: 30 checks |

## 4. Matriz de controles

Estado: ✅ implementado · 🟡 parcial · ❌ falta · 👤 depende de una acción de cuenta/pago.

### 4.1 SOC 2 — Criterios comunes (Seguridad)

| Criterio | Control en Baradero Local | Estado | Evidencia |
|---|---|---|---|
| CC1 Entorno de control | Políticas escritas, responsables definidos, revisión trimestral | 🟡 | `POLITICAS-SEGURIDAD.md`; falta nombrar responsable de seguridad (P-08) |
| CC2 Comunicación | Política de privacidad y Términos públicos; `SECURITY.md`; avisos al usuario por notificación | ✅ | `pages/privacidad.html`, `pages/terminos.html` |
| CC3 Evaluación de riesgos | Este análisis + auditorías por área (2026-09) documentadas en el skill de progreso | 🟡 | repetirlo cada trimestre |
| CC4 Monitoreo | Advisor de Supabase, log de auditoría, `error_logs`, Speed Insights | 🟡 | falta revisión periódica registrada (P-09) |
| CC5 Actividades de control | Cambios por commit + CI + tests; RLS como control preventivo | ✅ | `.github/workflows/ci.yml` |
| CC6.1 Acceso lógico | RLS en 51/51 tablas; rol en JWT (`app_metadata`) que el usuario no puede tocar; trigger que impide cambiar `role`/`is_suspended`; RPCs `SECURITY DEFINER` con chequeo de rol | ✅ | migraciones 47, 75, 96–105, 146 |
| CC6.1 Autenticación fuerte | Contraseñas 8+ (cliente); refresh token con rotación; **TOTP exigido en la base a admin/moderador que enrolaron** (H-15) | 🟡 | falta que las 3 cuentas enrolen y activar el modo estricto (P-01); P-04 |
| CC6.2/6.3 Alta y baja de accesos | Admin y repartidor solo por admin; vendedor por aprobación manual + CUIT; empleados con permisos por sección; todo auditado | ✅ | H-03 |
| CC6.4 Acceso físico | Delegado en Supabase (AWS) y Vercel, ambos con SOC 2 Tipo II | ✅ | reportes SOC 2 de los proveedores (pedirlos, P-07) |
| CC6.5 Baja de activos | Baja de cuenta con borrado real (`delete-account`), incluida foto y adjuntos | ✅ | `supabase/functions/delete-account` |
| CC6.6 Protección perimetral | HTTPS + HSTS, CSP, anti-framing, CORS de Supabase, `verify_jwt` en funciones | ✅ | H-08 |
| CC6.7 Datos en tránsito/salida | TLS en todo; tokens de MP solo en tabla sin policies (service role) | ✅ | `store_mp_credentials` |
| CC6.8 Software malicioso / no autorizado | CSP sin orígenes de script externos; dependencias auditadas en CI; Dependabot | ✅ | H-09, H-10 |
| CC7.1 Gestión de vulnerabilidades | `npm audit` en CI, Dependabot, advisor de Supabase | 🟡 | falta revisar el advisor de forma periódica (P-09) |
| CC7.2 Monitoreo de eventos | Log de auditoría append-only de admins + eventos de seguridad; logs de Auth/API de Supabase; `error_logs` | 🟡 | sin alertas automáticas (P-10) |
| CC7.3–7.5 Respuesta a incidentes | Plan escrito con roles, plazos y notificación | 🟡 | `RESPUESTA-INCIDENTES.md`; falta un simulacro (P-11) |
| CC8.1 Gestión de cambios | Git, CI con tests y build, migraciones versionadas en `db/schema/`, deploy automático de `main` | 🟡 | sin revisión por pares (todo va directo a `main` por decisión del 2026-10-28; volver a PR con usuarios reales) |
| CC9.1 Continuidad | Plan de continuidad en las políticas; backups | 👤 | plan Free sin backups descargables (P-02) |
| CC9.2 Proveedores | Lista de subencargados con su rol y certificaciones | 🟡 | firmar/archivar DPAs (P-07) |

### 4.2 SOC 2 — Criterios adicionales

| Criterio | Control | Estado | Evidencia / pendiente |
|---|---|---|---|
| A1.1 Capacidad | Vercel (CDN) + Supabase; caché inmutable de assets | 🟡 | plan Free: pausa por inactividad, sin SLA |
| A1.2 Backups y recuperación | Workflow de backup cifrado | 👤 | P-02 |
| A1.3 Prueba de recuperación | Procedimiento escrito | ❌ | P-03 |
| C1.1 Identificación de información confidencial | Clasificación de datos | ✅ | `POLITICAS-SEGURIDAD.md` §6 |
| C1.2 Eliminación | Retención automática + baja de cuenta | ✅ | H-04 |
| PI1.x Integridad del procesamiento | Precios y totales calculados en el servidor (`create_order`); insert directo a `orders` bloqueado; webhook de MP re-consulta el pago y verifica monto; estados solo por RPC | ✅ | migraciones 96, 101, 116; `mp-webhook` |

### 4.3 SOC 2 — Privacidad (P1–P8)

| Criterio | Control | Estado |
|---|---|---|
| P1 Aviso | Política de privacidad actualizada (H-12) | ✅ |
| P2 Elección y consentimiento | Registro con aceptación de Términos; ubicación solo a pedido; sin rastreo publicitario | 🟡 (no hay registro de la versión de política aceptada, P-12) |
| P3 Recolección | Solo lo necesario por flujo; datos opcionales marcados | ✅ |
| P4 Uso, retención y eliminación | Finalidades declaradas; retención automática; baja de cuenta | ✅ |
| P5 Acceso | El usuario ve y edita sus datos en Mi perfil; copia completa por pedido a Soporte | 🟡 (procedimiento manual, ver registro §5) |
| P6 Divulgación a terceros | Subencargados listados; comercio/repartidor ven solo lo necesario por RLS | ✅ |
| P7 Calidad | El usuario corrige sus datos; validaciones de formato (CUIT, CBU, teléfono) | ✅ |
| P8 Monitoreo y reclamos | Soporte en el sitio; mención de la AAIP | ✅ |

### 4.4 ISO/IEC 27701

**Cláusulas 5 (PIMS sobre ISO 27001)**

| Cláusula | Estado | Comentario |
|---|---|---|
| 5.2 Contexto: partes interesadas y requisitos (Ley 25.326, Ley 24.240 de Defensa del Consumidor) | 🟡 | identificado acá; falta revisión legal (la política dice que es borrador) |
| 5.3 Liderazgo y política | 🟡 | `POLITICAS-SEGURIDAD.md`; falta aprobación formal y responsable (P-08) |
| 5.4 Evaluación de riesgos de privacidad | 🟡 | este documento; falta PIA formal por cada flujo nuevo (regla en las políticas) |
| 5.5–5.7 Soporte, operación, evaluación | 🟡 | revisión trimestral fijada |
| 5.8 Mejora | ✅ | pendientes con dueño (§5) |

**Cláusula 6 (extensiones de ISO 27002) — las relevantes**

| Control | Estado | Evidencia |
|---|---|---|
| 6.2 Políticas | 🟡 | `POLITICAS-SEGURIDAD.md` |
| 6.3 Organización (responsable de privacidad) | ❌ | P-08 |
| 6.5 Clasificación y etiquetado de datos personales | ✅ | políticas §6 |
| 6.6 Control de acceso | 🟡 | RLS completo; MFA de admins listo (H-15), falta enrolar las 3 cuentas (P-01) |
| 6.7 Criptografía | ✅ | TLS + cifrado en reposo del proveedor; tokens OAuth con `state` de un uso |
| 6.9.3 Backup | 👤 | P-02 |
| 6.9.4 Registro de eventos (sin datos personales innecesarios) | ✅ | H-01, H-02, H-03; `error-logger.js` limpia tokens de la URL |
| 6.10 Seguridad en comunicaciones | ✅ | H-08 |
| 6.11 Desarrollo seguro / datos de prueba | 🟡 | tests de RLS en transacciones deshechas; **cuentas de prueba en producción** (P-13) |
| 6.12 Proveedores | 🟡 | P-07 |
| 6.13 Incidentes (incluye brecha de datos personales) | 🟡 | `RESPUESTA-INCIDENTES.md` |
| 6.15 Cumplimiento | 🟡 | revisión legal pendiente |

**Anexo A — controles del responsable del tratamiento**

| Control | Estado | Evidencia |
|---|---|---|
| 7.2.1 Finalidad identificada y documentada | ✅ | registro de tratamientos |
| 7.2.2 Base legal | ✅ | registro de tratamientos (contrato, consentimiento, interés legítimo, obligación legal) |
| 7.2.5 Evaluación de impacto (PIA) | 🟡 | regla para flujos nuevos; ninguna formal todavía |
| 7.2.6 Contratos con encargados | 👤 | P-07 |
| 7.2.8 Registro de tratamientos | ✅ | `REGISTRO-TRATAMIENTOS.md` |
| 7.3.2/7.3.3 Información al titular | ✅ | H-12 |
| 7.3.4 Retirar consentimiento | 🟡 | ubicación y recomendaciones se borran limpiando el navegador; falta un botón "borrar historial de vistos" (P-14) |
| 7.3.6 Acceso, rectificación, supresión | 🟡 | edición y baja en Mi perfil; copia de datos por Soporte |
| 7.3.8 Copia de los datos | 🟡 | manual (el botón "Descargar mis datos" se sacó a pedido del usuario el 2026-09-06) |
| 7.3.9 Gestión de pedidos del titular | ✅ | procedimiento con plazos legales (registro §5) |
| 7.4.1 Minimización en la recolección | ✅ | |
| 7.4.2 Minimización en el tratamiento | ✅ | H-01, seudonimización de búsquedas/vistas a 30 días |
| 7.4.4/7.4.5 Desidentificación y borrado al fin del tratamiento | ✅ | H-04; pedidos quedan sin `client_id` tras la baja |
| 7.4.7 Plazos de retención | ✅ | registro §4 |
| 7.4.8 Eliminación segura | ✅ | borrado en base + objetos de Storage |
| 7.4.9 Transmisión segura | ✅ | TLS |
| 7.5.1/7.5.2 Transferencias internacionales | 🟡 | declaradas en la política (EE.UU.); falta archivar DPAs con cláusulas (P-07) |
| 7.5.3 Registro de transferencias | ✅ | registro §3 |
| 7.5.4 Registro de divulgaciones a terceros | 🟡 | divulgaciones a autoridades: registrar a mano en el log de incidentes/legales |

## 5. Pendientes priorizados

| ID | Prioridad | Qué | Por qué | Quién |
|---|---|---|---|---|
| P-01 | **Alta** | **MFA de admin/moderador: el código está hecho y aplicado (H-15, 2026-11-02); falta la parte del usuario.** (1) Activar TOTP en el dashboard de Supabase (Authentication → Multi-Factor → TOTP: enroll y verify); hasta entonces Mi perfil avisa que no está habilitada y deja seguir al panel. (2) Cada una de las 3 cuentas admin entra al panel, la manda a Mi perfil y escanea el QR. (3) Con las 3 enroladas (consulta al final de `db/schema/151_admin_mfa_aal2.sql`): `update public.security_settings set require_staff_mfa = true, updated_at = now() where id;`. | Mientras una cuenta no enrola, su contraseña sola sigue dando acceso de admin. SOC 2 CC6.1 · ISO 27701 6.6.4. | Usuario (dashboard + enrolar) y luego un `update` |
| P-02 | **Alta** | **Backups**: pasar a Supabase Pro (backups diarios 7 días, PITR opcional) **o** activar el workflow `backup-db.yml` cargando `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE` en GitHub → Settings → Secrets. | Hoy, en plan Free, no hay un backup descargable: un `DELETE` accidental o un incidente es irrecuperable. SOC 2 A1.2. | Usuario (pago o secretos) |
| P-03 | Alta | Probar una restauración (procedimiento en políticas §5) y anotar fecha y resultado. | Un backup que nunca se restauró no es un control. SOC 2 A1.3. | Equipo |
| P-04 | Alta | En el dashboard de Supabase (Authentication): contraseña mínima 8 + letras y números; **Leaked Password Protection** (requiere Pro); activar TOTP; OTP de email a 1 hora o menos (ya está). | `config.toml` no se aplica solo. | Usuario |
| P-05 | Media | **Correo de contacto real**: la política y los Términos dicen `soporte@baraderolocal.com.ar`, pero el dominio no está comprado (F11-04): ese correo probablemente rebota. Mientras tanto la política ya ofrece Mi perfil → Soporte. | Un titular tiene que poder ejercer sus derechos. Ley 25.326 art. 14 · ISO 27701 7.3.9. | Usuario (decidir correo) |
| P-06 | Media | Inscribir la base de datos en el **Registro Nacional de Bases de Datos** de la AAIP. | Obligación de la Ley 25.326 (art. 21) para bases con fines de comercialización. | Usuario |
| P-07 | Media | Archivar DPAs y reportes SOC 2 de Supabase (se pide desde el dashboard; el DPA está en supabase.com/legal/dpa), Vercel (vercel.com/legal/dpa) y Mercado Pago. | ISO 27701 7.2.6, 7.5.1 · SOC 2 CC9.2. | Usuario |
| P-08 | Media | Nombrar un **responsable de seguridad y privacidad** (puede ser una persona del grupo) y anotarlo en las políticas. | ISO 27701 6.3.1.1 · SOC 2 CC1.3. | Equipo |
| P-09 | Media | Revisión mensual: advisor de seguridad de Supabase, log de auditoría, `error_logs`, PRs de Dependabot. Anotar la fecha en este archivo (§6). | SOC 2 CC4.1/CC7.1 requiere evidencia de que el monitoreo ocurre. | Equipo |
| P-10 | Baja | Alertas: Supabase Log Drains o un cron que avise a los admins (notificación) ante picos de errores o cambios de rol. | CC7.2. | Código |
| P-11 | Baja | Simulacro de incidente (tabletop) una vez por año. | CC7.4. | Equipo |
| P-12 | Baja | Guardar la versión de Términos/Política aceptada y la fecha en `profiles` al registrarse. | P2.1 · ISO 27701 7.2.4 (evidencia de consentimiento). | Código |
| P-13 | Baja | Antes del lanzamiento: separar los comercios y cuentas de prueba (`proyectopdisc+...`, 14 tiendas de seed) o marcarlos; y no usar datos reales en pruebas. | ISO 27002 8.33. | Equipo |
| P-14 | Baja | Botón "Borrar mi historial de productos vistos" en Ajustes (borra `bl_viewed_products`). | 7.3.4. | Código |
| P-15 | Baja | El bucket `avatars` es público: cualquier persona con la URL ve la foto de perfil. Evaluar pasarlo a privado con URLs firmadas, o aclararlo en la política. | Minimización. | Código |
| P-16 | Baja | Advisor: las funciones `SECURITY DEFINER` ejecutables por `anon`/`authenticated` se revisaron una por una (2026-09-06 y 2026-09-22) y validan rol/dueño adentro; volver a revisarlas cuando se agregue una nueva. | CC8.1. | Equipo |

## 6. Registro de revisiones

| Fecha | Quién | Qué se revisó | Resultado |
|---|---|---|---|
| 2026-11-02 | Claude Code (sesión de hardening) | Todo el alcance (este documento) | 14 controles aplicados, 16 pendientes |
| 2026-11-02 | Claude Code (sesión de MFA) | P-01: MFA de admin/moderador | H-15 aplicado (migración 151); P-01 queda en manos del usuario (dashboard + enrolar + modo estricto) |
