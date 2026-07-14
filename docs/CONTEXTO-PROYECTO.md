# 🧭 Contexto del Proyecto — Baradero Local (Proyecto-Pdisc)

> Documento de contexto generado como referencia rápida del estado del proyecto.
> Última actualización: **2026-07-07**.

---

## 1. Resumen general

**Baradero Local** es una plataforma digital y catálogo interactivo de **comercio de proximidad** para la ciudad de Baradero (Argentina). Permite a los vecinos explorar y comprar productos de tiendas locales, y a los comerciantes registrar sus negocios y gestionar ventas.

> *"Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."*

- **Tipo:** aplicación web multi-página (MPA), aparentemente proyecto académico.
- **Repositorio:** `github.com/fac7n3/Proyecto-Pdisc` (rama principal: `main`).
- **Idioma del proyecto:** español (código, comentarios y documentación).

### Roles de usuario
| Rol | Descripción |
|-----|-------------|
| `cliente` | Rol por defecto. Explora catálogo, agrega al carrito, compra, favoritos. |
| `vendedor` | Registra un comercio (`stores`) y publica productos. |
| `admin` | Panel de administración; gestiona categorías, cupones, comercios. |

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | HTML5 semántico, CSS3 (variables nativas, Flexbox/Grid), JavaScript vanilla ES6+ modular |
| **Build** | [Vite 8](https://vitejs.dev/) — multi-página, 12 entradas HTML |
| **Backend (BaaS)** | [Supabase](https://supabase.com/) — PostgreSQL, Auth, Storage, RLS |
| **Auth** | Email/contraseña + Google OAuth (vía Supabase Auth) |
| **Iconos** | FontAwesome |
| **Dependencia npm** | `@supabase/supabase-js` ^2.106.2 |

### Scripts (`package.json`)
- `npm run dev` — servidor de desarrollo Vite (`http://localhost:5173`)
- `npm run build` — build de producción a `dist/`
- `npm run preview` — previsualizar el build

> ⚠️ **Convención no obvia:** la carpeta compilada **`dist/` se versiona en git** (se commitea el build, no solo el código fuente).

---

## 3. Estructura del proyecto

```text
Proyecto-Pdisc/
├── index.html              # Landing / punto de entrada raíz
├── vite.config.js          # Config Vite (12 entradas) + plugin de security headers en dev
├── .env / .env.example     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│
├── pages/                  # 13 páginas HTML
│   ├── home.html           # Portal principal y catálogo
│   ├── login.html          # Inicio de sesión (email + Google)
│   ├── register.html       # Registro (email + Google)
│   ├── perfil.html         # Perfil de usuario autenticado
│   ├── carrito.html        # Carrito de compras
│   ├── search.html         # Resultados de búsqueda / filtros
│   ├── producto.html       # Detalle de producto
│   ├── comercio.html       # Página de una tienda
│   ├── vender.html         # Portal de vendedores / registro de comercio
│   ├── admin.html          # Panel de administración
│   ├── terminos.html       # Términos y condiciones
│   └── info.html           # Info / farmacias de turno
│
├── js/                     # Lógica de negocio (ES modules)
│   ├── supabase-config.js  # Lee variables de entorno (URL + anon key)
│   ├── auth-utils.js       # Cliente supabase, guardPage(), toasts, navbar
│   ├── cart-utils.js       # Carrito localStorage + wishlist + badge
│   ├── home.js  search.js  producto.js  comercio.js
│   ├── login.js register.js perfil.js  vender.js  admin.js
│   ├── carrito.js  product-modal.js
│
├── Assets/
│   ├── images/             # Logos, banners, mockups, productos
│   └── styles/             # styles.css, home.css, auth.css, carrito.css, etc.
│
├── db/schema/              # 10 scripts SQL (ejecutar en orden en Supabase)
├── docs/                   # Documentación y auditorías
└── dist/                   # Build compilado (versionado en git)
```

---

## 4. Modelo de datos (PostgreSQL / Supabase)

Todas las tablas tienen **RLS habilitado**. El rol se lee del JWT: `auth.jwt() -> 'app_metadata' ->> 'role'`.

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| **`profiles`** | `id`→auth.users, `email`, `full_name`, `avatar_url`, `role` | Se crea automáticamente al registrarse (trigger `handle_new_user`). Todos empiezan como `cliente`. |
| **`products`** | `seller_id`, `title`, `description`, `price_cents`, `stock`, `is_active`, `store_id`, `image_url`, `category_id` | Precios en **centavos** (`price_cents`). |
| **`categories`** | `name`, `slug`, `icon` | Solo admin puede crear/editar. |
| **`stores`** | `owner_id`, `cuit`, `name`, `logo_url`, `address`, `phone`, `status` | `status`: pending/approved/rejected/suspended. |
| **`orders`** | `client_id`, `store_id`, `status`, `shipping_address`, `total_price_cents`, `payment_id` | `status`: pending/paid/shipped/ready_for_pickup/completed/cancelled. |
| **`order_items`** | `order_id`, `product_id`, `quantity`, `price_cents` | |
| **`seller_requests`** | `user_id`, `shop_name`, `status` | Solicitudes para ser vendedor. |
| **`coupons`** | `code`, `discount_percentage`, `is_active`, `expires_at` | Seeds: `BIENVENIDO10` (10%), `VERANO20` (20%). |
| **`user_carts`** | `user_id` (único), `items` jsonb | Sincronización del carrito en la nube. |

### Enum y funciones
- **`app_role`**: `cliente` \| `vendedor` \| `admin`.
- **Triggers:** `handle_new_user` (crea perfil), `set_updated_at` (timestamps), `prevent_role_update_on_profile` (impide que un usuario cambie su propio `role`).
- **RPC `validate_cart_prices(jsonb)`** (`SECURITY DEFINER`): valida precios/stock del carrito en el servidor al hacer checkout.
- **Storage buckets:** `products` y `stores` (públicos).

---

## 5. Lógica frontend clave

- **`js/auth-utils.js`** es el núcleo:
  - Exporta el cliente `supabase` (usado por casi todos los módulos).
  - `guardPage({ requireAuth, redirectIfAuth, requireRole, onReady })` — protege páginas, muestra loading screen y evita el "flash of unauthorized content". Usa `getSession()` (local) y luego `getUser()` (verifica con el servidor).
  - `showToast()`, `setLoading()`, `isValidEmail()`, `checkUrlErrors()` (errores OAuth en la URL), `updateNavbarProfile()`.
- **`js/cart-utils.js`**: carrito en `localStorage` (clave `bl_cart`), wishlist (`bl_wishlist`), badge del navbar, `parsePrice()`, botones "agregar al carrito" y favoritos.
- **Flujo OAuth Google:** Supabase redirige de vuelta con tokens en la URL; el SDK los procesa al importar `supabase` en la página.

---

## 6. Configuración local (dev)

1. `npm install`
2. Crear `.env` (según `.env.example`):
   ```
   VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
   VITE_SUPABASE_ANON_KEY="tu-anon-key"
   ```
3. Ejecutar los scripts `db/schema/*.sql` **en orden** en el SQL Editor de Supabase.
4. Configurar Google OAuth (ver `docs/RUN_LOCAL.md`): habilitar provider en Supabase + callback en Google Cloud Console.
5. `npm run dev` → `http://localhost:5173`.

---

## 7. Estado, pendientes y hallazgos

### 🟡 Decisiones de producto abiertas (histórico, ya resueltas — el archivo `Problematiccas proyecto.txt` se eliminó el 2026-07-14 por estar 100% superado)
- Interfaz diferenciada para el vendedor (tema naranja).
- Cómo validar que un comercio es **real** al registrarse (¿pedir CUIL/CUIT?).
- Definir **envíos** y **medios de pago** (sin resolver).
- Feedback de diseño: *"le falta esencia/dopamina, parece inmobiliaria o de viajes"*.

### 🟠 Bugs / tareas de UI conocidas
- En la página **carrito**, el icono de perfil se convierte en una "u".
- Botones **"ver tienda"** por conectar.
- "Inicio de sesión defectuoso"; optimizar el **product modal**.

### 🔴 Bugs SQL detectados en este análisis (no documentados antes)
1. **`db/schema/09_user_carts.sql`** → `validate_cart_prices()` referencia `products.price` y `products.name`, pero la tabla `products` tiene `price_cents` y `title`. Esas columnas no existen → **la RPC fallaría** en tiempo de ejecución.
2. **`db/schema/10_fix_auth_triggers.sql`** → `handle_new_user` intenta castear `'repartidor'` a `app_role`, pero el enum solo tiene `cliente`/`vendedor`/`admin` → **excepción** si `account_type='repartidor'`.

### 🔐 Auditorías de seguridad existentes (no rehacer, consultar primero)
- **`docs/analysis_results.md`** (2026-06-09): auditoría de ciberseguridad completa. Destacado: **XSS en el carrito vía `innerHTML`** (SEC-01, crítica). IDs tipo SEC-01, AUTH-05, CODE-08 — la nota de "no rehacer" acá arriba tenía el nombre de archivo cruzado con `oportunidades.md` (eliminado el 2026-07-14, esas eran notas informales de brainstorm, no la auditoría). Ojo: describe en parte el estado **pre-fix** — casi todos los hallazgos ya están resueltos, ver `CLAUDE.md` (F1-01/F1-02, A113-238, F2-01, etc.), no verificado ítem por ítem contra el código actual.
- `vite.config.js` ya inyecta headers de seguridad en el dev server (X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).

---

## 8. Herramientas de agentes ya presentes

El repo trae skills locales en `.agents/skills/` (mecanismo `.agents`, con `skills-lock.json`), entre ellas: `supabase`, `supabase-postgres-best-practices`, `web-design-guidelines`, `react-best-practices`, `frontend-ui-engineering`, `performance-optimization`, `debugging-and-error-recovery`, `ux-ui-mastery`, `impeccable`. También hay carpeta `.codex/`.

> Nota: estas son skills del ecosistema `.agents`/Codex, **distintas** de los plugins de Claude Code. Para Claude Code se recomendó instalar el plugin oficial **`frontend-design`** (`/plugin marketplace add anthropics/claude-code` → `/plugin install frontend-design@claude-code-plugins`).
