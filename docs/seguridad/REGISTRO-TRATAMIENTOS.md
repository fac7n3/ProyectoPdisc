# Registro de actividades de tratamiento — Baradero Local

> ISO/IEC 27701 7.2.8 (registro de tratamientos), 7.5 (transferencias), 7.4.7 (retención),
> 7.3 (derechos del titular) · SOC 2 P1–P8 · Ley 25.326.
> Versión 1.0 · 2026-11-02. **Actualizarlo** cada vez que se sume un dato personal, una
> finalidad, un proveedor o se cambie un plazo (regla de `POLITICAS-SEGURIDAD.md` §1).

**Responsable del tratamiento:** Baradero Local (proyecto `fac7n3/ProyectoPdisc`).
**Contacto para titulares:** Mi perfil → Soporte en el sitio; correo publicado
`soporte@baraderolocal.com.ar` (ver pendiente P-05: el dominio todavía no existe).
**Autoridad de control:** Agencia de Acceso a la Información Pública (AAIP).
**Inscripción en el Registro Nacional de Bases de Datos:** pendiente (P-06).

## 1. Actividades de tratamiento

| # | Actividad | Titulares | Datos | Finalidad | Base legal (Ley 25.326 art. 5) | Dónde vive | Quién accede |
|---|---|---|---|---|---|---|---|
| T1 | Cuenta y autenticación | Todos | Email, contraseña (hash, en Supabase Auth), nombre, foto, proveedor de login (Google) | Crear la cuenta e identificar a la persona | Relación contractual | `auth.users`, `profiles`, bucket `avatars` (público) | La persona; admin |
| T2 | Perfil personal | Clientes | Teléfono, fecha de nacimiento, tipo y número de documento | Contacto por pedidos; verificación de mayoría de edad/identidad | Contractual; consentimiento (campos opcionales) | `profiles` | La persona; admin; comercio y repartidor solo el teléfono, de sus pedidos |
| T3 | Direcciones de envío | Clientes | Calle, número, barrio, teléfono | Entregar pedidos | Contractual | `user_addresses`, `orders.shipping_address` | La persona; comercio del pedido; repartidor de la entrega |
| T4 | Compras y pagos | Clientes, comercios | Pedido, productos, montos, método de pago, comprobante de transferencia, código de retiro | Cumplir la compraventa; respaldo contable | Contractual; obligación legal (contable) | `orders`, `order_items`, `order_events`, `payment_proofs` + bucket privado `payment-proofs` | Comprador; comercio; admin |
| T5 | Pagos con Mercado Pago | Clientes, comercios | Id de pago, monto, estado; tokens OAuth del comercio | Cobrar y conciliar | Contractual | Mercado Pago; `store_mp_credentials` (solo service role) | Edge Functions; nadie desde la API |
| T6 | Alta y gestión de comercios | Vendedores | Nombre del comercio, CUIT, dirección y ubicación del local en el mapa (migración 147), teléfono/WhatsApp, redes, alias/CBU/titular/banco | Verificar comercios y que puedan cobrar | Contractual | `seller_requests`, `stores` | Dueño y empleados; admin; el comprador ve alias/CBU al pagar por transferencia |
| T7 | Empleados de comercio | Empleados | Email, permisos por sección | Dar acceso al panel | Contractual / interés legítimo del comercio | `store_staff` | Dueño; admin; auditado |
| T8 | Directorio de profesionales | Profesionales | Nombre, oficio, foto, teléfono/WhatsApp, redes, horarios, zonas, fotos de trabajos | Publicarlos en "Contratar" | Consentimiento (alta voluntaria) | `professional_requests`, `professionals` y tablas `professional_*` | Público (lo publicado); admin |
| T9 | Consultas a profesionales | Clientes, profesionales | Mensaje, fecha deseada, fotos adjuntas | Pedir presupuesto | Consentimiento | `professional_inquiries` + bucket privado | Cliente y profesional |
| T10 | Entregas | Repartidores, clientes | Estado de la entrega, foto del pedido al retirar, foto y motivos si llegó mal, código de entrega | Coordinar y probar la entrega | Contractual | `deliveries`, `delivery_feedback`, bucket privado `delivery-evidence` | Repartidor, comercio y comprador del pedido; admin |
| T11 | Reseñas | Clientes | Calificación, comentario, autor | Reputación pública | Consentimiento (publicación voluntaria) | `reviews` | Público (sin nombre real por defecto) |
| T12 | Soporte y reclamos | Todos | Asunto, mensaje, adjuntos, respuestas | Atender reclamos | Contractual; obligación legal (Defensa del Consumidor) | `support_tickets`, `support_ticket_messages`, bucket `support-attachments` (migración 73 sin aplicar) | La persona; admin |
| T13 | Notificaciones | Todos | Tipo, contenido, leída | Avisar cambios de pedidos y cuenta | Contractual | `notifications` | La persona |
| T14 | Recomendaciones y búsqueda | Visitantes, clientes | Búsquedas, productos vistos (en la base: seudonimizados a los 30 días); productos vistos en el navegador (`localStorage`) | Mejorar el buscador; recomendar productos | Interés legítimo (minimizado) | `search_events`, `product_views`, `localStorage` | Admin (agregado) |
| T15 | Registro técnico y seguridad | Visitantes, usuarios | Mensaje de error, URL sin tokens, navegador, id de cuenta; acciones de admins y eventos de seguridad (sin datos personales) | Detectar errores y abusos; rendición de cuentas | Interés legítimo; obligación de seguridad (art. 9) | `error_logs`, `admin_audit_log`; logs de Supabase y Vercel | Admin |
| T16 | Ubicación para "Comercios cerca tuyo" | Visitantes | Latitud/longitud | Mostrar comercios cercanos y el mapa | Consentimiento (permiso del navegador, a pedido) | Solo `sessionStorage` del navegador; se envía a Google Maps para dibujar el mapa | Nadie en la plataforma |
| T17 | Combos "Impulsá tus ventas" | Comercios | Plan comprado, pago | Cobrar y activar el combo | Contractual | `boost_purchases`, Mercado Pago | Dueño; admin |

No se tratan datos sensibles en el sentido del art. 2 de la Ley 25.326 (salud, religión,
origen étnico, etc.). Las farmacias de turno y contactos de emergencia son datos públicos
de establecimientos, no de personas.

## 2. Destinatarios

- **Comercio** de cada pedido: datos del pedido, nombre, teléfono y dirección de entrega (RLS).
- **Repartidor**: dirección y teléfono del comprador **solo** mientras la entrega es suya
  (`profiles_select_order_participants`).
- **Profesional**: lo que el vecino escribe en la consulta.
- **Autoridades**: solo ante una orden legal; cada entrega se registra a mano (fecha,
  autoridad, datos, fundamento) en `docs/seguridad/` como anexo confidencial fuera del
  repo público.

## 3. Subencargados y transferencias internacionales

| Proveedor | Qué hace | Datos | Región | Certificación | DPA |
|---|---|---|---|---|---|
| Supabase Inc. | Base de datos, Auth, Storage, Edge Functions, Realtime | Todos los de §1 | EE.UU. (`us-west-2`, AWS) | SOC 2 Tipo II, HIPAA | Disponible (supabase.com/legal/dpa) — **archivar firmado (P-07)** |
| Vercel Inc. | Hosting del sitio, CDN, Speed Insights (anónimo) | IP y navegador de los visitantes (logs de acceso) | EE.UU. / global | SOC 2 Tipo II, ISO 27001 | Incluido en sus términos (vercel.com/legal/dpa) — archivar (P-07) |
| Mercado Pago (MercadoLibre S.R.L.) | Pagos | Monto, id de pago; los datos de tarjeta los recibe MP directo | Argentina | PCI DSS | Términos de MP para integradores — archivar (P-07) |
| Google LLC | Login con Google; mapa del inicio | Email, nombre y foto (login); coordenadas (mapa) | EE.UU. | SOC 2, ISO 27001/27701 | Términos de Google Cloud / Maps |
| OpenStreetMap Foundation (Nominatim) | Sugerencias de calles | Texto de la dirección que se tipea | Reino Unido / UE | — | Política de uso de Nominatim |
| GitHub (Microsoft) | Repositorio, CI y backups cifrados (si se activa P-02) | Código; backups **cifrados** | EE.UU. | SOC 2, ISO 27001 | GitHub DPA |

**Transferencia internacional (Ley 25.326 art. 12; ISO 27701 7.5.1):** los datos se
alojan en EE.UU., país sin declaración de adecuación de la AAIP. Fundamento: proveedores
con certificaciones independientes y acuerdos de tratamiento; la transferencia está
informada en la Política de Privacidad. Para reforzarlo, archivar los DPAs con cláusulas
contractuales y evaluar la región de Supabase si algún día se migra el proyecto
(São Paulo, `sa-east-1`, además bajaría ~200 ms de latencia).

## 4. Plazos de retención

| Dato | Plazo | Cómo se aplica |
|---|---|---|
| Cuenta, perfil, direcciones, favoritos, carrito | Mientras la cuenta esté activa | Baja de cuenta: `delete-account` borra usuario, perfil, direcciones, favoritos, foto y adjuntos |
| Pedidos, ítems, comprobantes | **Mínimo 10 años** desde la venta (respaldo contable, Código Civil y Comercial art. 328); hoy no se purgan | Sobreviven a la baja **sin** `client_id` (anonimizados) |
| Reseñas | Mientras la cuenta exista; se borran con la cuenta | Cascada al borrar el usuario |
| Reclamos de soporte | Mientras la cuenta exista | Adjuntos borrados en la baja |
| Notificaciones leídas | 1 año | `purge_expired_personal_data()` (diario) |
| Búsquedas y productos vistos | Seudonimizados a 30 días; borrados a 180 | Ídem |
| Errores técnicos | 90 días | Ídem |
| Estados OAuth de Mercado Pago | 10 minutos de validez; borrados al día | Ídem |
| Log de auditoría (sin datos personales) | 2 años | Ídem |
| Backups cifrados (si se activa P-02) | 30 días | Retención del artefacto |
| Logs de Supabase/Vercel | Según el plan del proveedor (1 día en Free) | Proveedor |
| Productos vistos en el navegador | Últimos 40, hasta que la persona limpie los datos del sitio | `localStorage` |

## 5. Procedimiento de derechos del titular (ISO 27701 7.3 · Ley 25.326 arts. 14–16)

| Derecho | Cómo se ejerce | Plazo legal | Cómo se resuelve |
|---|---|---|---|
| Acceso | Soporte | **10 días corridos** (art. 14) | Admin exporta con SQL los datos de la persona (perfil, direcciones, pedidos, reseñas, reclamos, notificaciones, consultas) a un JSON y se lo entrega por el mismo canal |
| Rectificación / actualización | Mi perfil (autoservicio) o Soporte | **5 días hábiles** (art. 16) | La persona lo edita; o admin |
| Supresión | Mi perfil → Eliminar mi cuenta | 5 días hábiles | Automático (`delete-account`). Si tiene comercio o pedidos en curso, se le explica qué falta y se resuelve por Soporte |
| Oposición a recomendaciones | Limpiar datos del sitio en el navegador | — | Ver P-14 (botón dedicado) |
| Revocar consentimiento de ubicación | Permisos del navegador | Inmediato | No se guarda en la base |

Pasos para cada pedido que llega por Soporte:

1. **Verificar identidad:** el pedido tiene que venir desde la cuenta logueada (Soporte) o
   desde el email de la cuenta. Nunca entregar datos a otro correo.
2. Registrar el pedido (el propio ticket de soporte sirve de registro, con fecha).
3. Resolver dentro del plazo y responder en el ticket.
4. Si se niega (por ejemplo, datos que hay que conservar por ley), responder con el
   fundamento y mencionar a la AAIP.
