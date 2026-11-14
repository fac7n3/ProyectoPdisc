# Baradero Local

> *"Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."*

Baradero Local es una plataforma de comercio de proximidad para la ciudad de Baradero (Buenos Aires, Argentina). Permite a los vecinos descubrir y comprar productos de los comercios de la ciudad, y a los comerciantes administrar su tienda, su stock y sus pedidos desde un panel propio. Además, incluye un directorio de profesionales y técnicos, información de servicios locales y un panel de administración para la gestión de la plataforma.

Producción: <https://baraderolocal.vercel.app> (también responde en <https://proyectopdisc.vercel.app>)

---

## Contenido

- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura y seguridad](#arquitectura-y-seguridad)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Puesta en marcha en desarrollo](#puesta-en-marcha-en-desarrollo)
- [Pruebas](#pruebas)
- [Despliegue](#despliegue)
- [Documentación](#documentación)

---

## Funcionalidades

### Clientes

- Catálogo con filtros por categoría, búsqueda tolerante a errores de tipeo y a sinónimos, y sección de ofertas.
- Comparador en la búsqueda: cuando el mismo producto está en varios comercios, muestra cuál es más barato y cuál queda más cerca.
- Carrito agrupado por comercio, sincronizado entre dispositivos y disponible también sin sesión iniciada. Los envíos y los cupones se calculan por comercio.
- Medios de pago: Mercado Pago (Checkout Pro), transferencia bancaria con comprobante y efectivo con retiro en el local.
- Retiro en el local o envío a domicilio dentro de Baradero.
- Seguimiento del pedido con línea de tiempo, código de retiro, historial de compras y reseñas de productos y comercios.
- Notificaciones en tiempo real y centro de notificaciones.
- Favoritos de productos y de comercios.
- Directorio de profesionales y técnicos con solicitud de presupuesto.
- Farmacias de turno con estado en vivo, y listado de contactos de emergencia y veterinarias.
- Modo claro y modo oscuro.
- Aplicación web instalable (PWA).

### Comercios

- Alta y edición de productos con fotos múltiples, opciones (color, sabor, talle), ofertas con precio anterior y fecha de vencimiento, y cupones.
- Gestión de pedidos con actualización en tiempo real y confirmación de pagos por transferencia.
- Vinculación de la cuenta de Mercado Pago del comercio para cobrar directamente.
- Perfil del comercio personalizable (con la ubicación del local marcada en un mapa), métricas de ventas, reseñas y gestión de empleados con permisos por sección.
- Herramientas de promoción: banners en el inicio y combos de visibilidad.

### Profesionales y técnicos

- Panel propio para administrar datos, servicios y precios de referencia, horarios, zonas de cobertura y fotos de trabajos.
- Gestión de consultas de presupuesto y respuesta pública a las reseñas.

### Repartidores

- Panel con cola de pedidos disponibles, toma de entregas, confirmación de retiro y seguimiento de estados.

### Administración

- Aprobación manual de comercios (con validación de CUIT) y de profesionales.
- Moderación de productos, comercios y reseñas, y gestión de categorías, cupones y promociones del inicio.
- Carga de farmacias, turnos y contactos de emergencia.
- Métricas globales de la plataforma.

### Accesibilidad

El sitio está pensado para ser utilizable con lectores de pantalla como TalkBack: enlace para saltar al contenido, un único `<h1>` por pantalla, campos de formulario con nombre accesible y botones dinámicos que anuncian el producto al que corresponden. El detalle y los puntos pendientes están en [docs/ACCESIBILIDAD.md](docs/ACCESIBILIDAD.md).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Vite 8 (aplicación multipágina), JavaScript ES6 sin framework, CSS con variables nativas |
| Base de datos y autenticación | [Supabase](https://supabase.com/): PostgreSQL con Row Level Security, Auth (correo y Google OAuth), Storage y Realtime |
| Lógica de servidor | Edge Functions de Supabase (Deno) para la integración con Mercado Pago y la baja de cuentas |
| Pagos | Mercado Pago (Checkout Pro y OAuth por comercio) |
| Mapas | [Leaflet](https://leafletjs.com/) con mapas de [OpenStreetMap](https://www.openstreetmap.org/) y búsqueda de direcciones con Nominatim |
| Hosting | [Vercel](https://vercel.com/), con despliegue automático en cada push a `main` |

---

## Arquitectura y seguridad

- **Autorización en la base de datos.** Todas las tablas tienen Row Level Security. El rol del usuario (`cliente`, `vendedor`, `admin`, entre otros) se toma del JWT y las operaciones sensibles, como crear un pedido o confirmar un pago, se realizan exclusivamente a través de funciones SQL con validaciones del lado del servidor.
- **Precios en pesos enteros.** Todo el sistema trabaja con pesos argentinos sin centavos.
- **Secretos fuera del cliente.** El frontend solo conoce la URL y la clave pública de Supabase. Las credenciales de Mercado Pago viven únicamente en las Edge Functions.
- **Verificación de pagos.** El webhook de Mercado Pago consulta el pago, valida el monto cobrado y trata devoluciones y contracargos antes de modificar un pedido.
- **Tiempo real.** Notificaciones, pedidos y carrito se actualizan mediante Supabase Realtime, con consulta periódica de respaldo.

El detalle de las decisiones de diseño se encuentra en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Estructura del repositorio

```text
ProyectoPdisc/
├── Assets/              Estilos e imágenes fuente
├── db/schema/           Migraciones SQL numeradas, para aplicar en orden
├── docs/                Documentación del proyecto
├── js/                  Lógica de frontend: un módulo por página y utilidades compartidas
├── pages/               Páginas HTML (una por ruta)
├── public/              Recursos estáticos: íconos, manifest e imágenes optimizadas
├── scripts/             Herramientas de apoyo (optimización de imágenes, tareas de tooling)
├── supabase/
│   ├── functions/       Edge Functions (pagos, OAuth de Mercado Pago, baja de cuenta)
│   └── templates/       Plantillas de correo de autenticación
├── .env.example         Plantilla de variables de entorno
└── vite.config.js       Entradas del build multipágina
```

---

## Puesta en marcha en desarrollo

Requisitos: Node.js y un proyecto de Supabase propio.

```bash
npm install
cp .env.example .env    # completar con la URL y la clave pública (anon) de Supabase
npm run dev
```

El archivo `.env` no se versiona. Antes de ejecutar la aplicación es necesario aplicar en orden las migraciones de `db/schema/`; el procedimiento completo, incluida la configuración de Google OAuth, está descrito en [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md).

---

## Pruebas

```bash
npm test
```

Ejecuta las pruebas unitarias de la lógica de frontend (`js/*.test.mjs`) y de las Edge Functions (`supabase/functions/_tests/`). Para las pruebas manuales por rol y flujo, ver [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md).

---

## Despliegue

La aplicación se publica en Vercel desde la rama `main`. La base de datos y las Edge Functions se gestionan en Supabase. La guía completa de configuración de producción, que incluye Vercel, Supabase y Mercado Pago, está en [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Documentación

| Documento | Contenido |
|---|---|
| [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md) | Entorno de desarrollo local, migraciones en orden e historial técnico por funcionalidad |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Despliegue a producción: Vercel, Supabase y Mercado Pago |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Modelo de datos, seguridad y decisiones de diseño |
| [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) | Guía de uso por rol |
| [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md) | Lista de verificación manual por rol y flujo |
| [docs/ACCESIBILIDAD.md](docs/ACCESIBILIDAD.md) | Accesibilidad con lectores de pantalla: alcance, verificación y pendientes |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Plan del proyecto y estado de avance |
| [docs/brand-guidelines.md](docs/brand-guidelines.md) | Guía de identidad de marca |
| [CLAUDE.md](CLAUDE.md) | Contexto del proyecto para asistentes de IA e historial de decisiones |
