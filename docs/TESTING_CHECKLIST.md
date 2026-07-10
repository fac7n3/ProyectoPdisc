# Checklist de testing manual — Baradero Local

> F10-01. Cobertura de los flujos reales implementados (Fases 0-9), organizada por rol.
> Marcar con [x] al verificar en un browser real (no solo preview) antes de cada release grande.
> No reemplaza tests automatizados (F10-02, opcional) — es la red de seguridad mínima pre-deploy.

## Cliente

### Cuenta
- [ ] Registro con email/password crea perfil con rol `cliente` (nunca otro rol, ver A113-238).
- [ ] Login con Google OAuth funciona y redirige a home.
- [ ] Cerrar sesión limpia el estado y protege páginas privadas (perfil, carrito).

### Catálogo y búsqueda
- [ ] Home muestra productos reales con imagen, precio y tienda (no "Tienda" genérico, no ícono roto).
- [ ] Filtro "Ofertas" muestra solo productos con `compare_at_price` (F9-03).
- [ ] Búsqueda por texto y por categoría en `search.html` devuelve resultados correctos.
- [ ] Detalle de producto (`producto.html`) muestra variantes (si tiene), fotos adicionales, reseñas.
- [ ] "Contactar al vendedor" desde producto/comercio abre `mensajes.html` con la conversación correcta.

### Carrito y checkout
- [ ] Agregar/quitar productos actualiza el carrito y el badge.
- [ ] Carrito se sincroniza entre dispositivos si hay sesión (F4-01).
- [ ] Al abrir el carrito, productos inactivos/sin stock se quitan o ajustan solos (F4-02).
- [ ] Elegir "Envío" muestra el costo real ($350 o gratis ≥$5000 por tienda) y pide dirección.
- [ ] Cupón válido aplica descuento; cupón inválido se rechaza sin romper el flujo.
- [ ] Pago simulado: confirma la orden al instante.
- [ ] Pago por transferencia: sube comprobante, queda "pending" hasta que el vendedor confirme.
- [ ] Carrito de productos de 2+ tiendas genera una orden por tienda.

### Perfil
- [ ] "Mis compras" muestra historial real con estado, método de pago/envío.
- [ ] "Mis favoritos" persiste entre sesiones (DB) y funciona sin sesión (localStorage).
- [ ] Pestaña "Notificaciones" muestra eventos reales (pedido creado, pagado, enviado, entregado).
- [ ] Dejar una reseña de producto/tienda (solo una vez, editable).
- [ ] Reportar una reseña ajena.

## Vendedor

### Alta y aprobación
- [ ] Solicitud de vendedor (CUIT + datos) queda "pending" hasta aprobación del admin.
- [ ] Un vendedor no puede auto-aprobarse (RPC rechaza si no es admin).

### Dashboard
- [ ] Alta de producto: título, precio, stock, categoría, imagen, precio anterior (oferta) opcional.
- [ ] Editar producto precarga los datos correctos; activar/desactivar oculta del catálogo público.
- [ ] Variantes: alta/baja desde el form de edición (solo visible con producto ya creado).
- [ ] Fotos adicionales: subir/borrar, la miniatura cambia la imagen principal en `producto.html`.
- [ ] Estadísticas (ventas hoy, ingresos del mes, productos activos) reflejan datos reales.
- [ ] "Mis pedidos": listar, marcar pickup como listo/entregado, cancelar pending/paid.
- [ ] "Pagos por confirmar": ver comprobante (signed URL), confirmar/rechazar transferencia.
- [ ] "Envíos en curso": ver estado de las entregas asignadas a un repartidor.
- [ ] Editar perfil de tienda (descripción, zona, horarios, dirección, teléfono).
- [ ] Notificaciones del vendedor (pedido nuevo, pago confirmado).

## Repartidor

- [ ] Solicitud de repartidor (vehículo, patente si aplica) queda "pending" hasta aprobación.
- [ ] "Pedidos disponibles" solo muestra órdenes `delivery` + `paid` sin asignar.
- [ ] Tomar un pedido lo saca de la lista de disponibles para otros repartidores (constraint unique).
- [ ] Transiciones de estado en orden: asignado → en camino → entregado (no se puede saltear).
- [ ] Repartidor suspendido no puede tomar ni actualizar pedidos.

## Admin

- [ ] Aprobar/rechazar solicitudes de vendedor y repartidor.
- [ ] Suspender/reactivar un comercio oculta/muestra sus productos en el catálogo público.
- [ ] Moderar un producto puntual de otro vendedor (activar/desactivar).
- [ ] CRUD de categorías (alta/edición/baja).
- [ ] CRUD de cupones.
- [ ] Ver y confirmar/rechazar comprobantes de transferencia de cualquier comercio.
- [ ] Métricas globales (usuarios por rol, comercios por estado, ventas totales, entregas).
- [ ] Reseñas reportadas: ocultar/mostrar.

## Transversal (todas las páginas)

- [ ] Sin errores en la consola del navegador en ningún flujo de arriba.
- [ ] Responsive: layout usable en mobile (375px) en home, carrito, perfil, vender, admin, repartidor.
- [ ] PWA: manifest y service worker registran correctamente (`navigator.serviceWorker.getRegistrations()`).
- [ ] Sin conexión: aparece el banner "Sin conexión a internet" (offline/online del navegador).
- [ ] Falla de red simulada (Supabase caído): grillas muestran error con botón "Reintentar", no pantalla en blanco.
- [ ] Headers de seguridad presentes en producción (`X-Content-Type-Options`, `X-Frame-Options`, etc. — ver F1-05).
