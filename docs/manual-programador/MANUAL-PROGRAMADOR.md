# Baradero Local — Manual del programador

_El código del proyecto, bloque por bloque, explicado para quien no programa_

Versión 1.0 · 27/10/2026

> Archivo generado con `node scripts/manual-programador/generar.mjs`. No editar a mano: el texto vive en `scripts/manual-programador/contenido.mjs` y el código sale de los archivos reales.

## Hoja de control

|   |   |
| --- | --- |
| Nombre del proyecto | Baradero Local |
| Entidad/ institución | Baradero Local |
| Destinatarios | Equipo de desarrollo, docentes y cualquier persona que necesite entender o mantener el código, aunque no programe |

|   |   |
| --- | --- |
| Integrantes del equipo de desarrollo | Algañaras Berenice / Berayra Casanova Bianca / Eichenberger Facundo / Kraus Keila |
| Redactor/a del manual | Borrador generado con Claude Code a pedido del equipo (a revisar y completar por el equipo) |
| Tutor/a, jefe/a de Área o Supervisor/a que aprueba el documento | Kraus Keila (pendiente de aprobación) |

**Historial de cambios / Control de versiones**

| Versión | Fecha | Resumen de modificaciones | Autor del cambio |
| --- | --- | --- | --- |
| 1.0 | 27/10/2026 | Primera versión: misma estructura que el Manual de usuario, con el código de cada módulo y comentarios en lenguaje simple. | Claude Code (borrador) |

## Índice

1. **Introducción**
   - 1. Propósito del manual
   - 2. Descripción ejecutiva del sistema
   - 3. Requerimientos técnicos
   - 4. Glosario de convenciones visuales
2. **Guía de inicio rápido**
   - 1. Acceso al código
   - 2. Puesta en marcha en una computadora
   - 3. Navegación general por el código
3. **Módulos operativos y flujos de trabajo**
   - 1. Autenticación / inicio de sesión / registro
   - 2. Header
   - 3. Header Auxiliar
   - 4. Categorías
   - 5. Panel de perfil
   - 6. Carrito
   - 7. Accesos Rápidos
   - 8. Banner principal
   - 9. Comercios destacados
   - 10. Banner promociones
   - 11. Productos recomendados
   - 12. Comercios cerca tuyo
   - 13. Esenciales para tu casa
   - 14. Ofertas
   - 15. Banners inferiores
   - 16. Footer
   - 17. Paneles
   - 18. Panel de comerciante
   - 19. Panel de profesional
   - 20. Panel del repartidor
   - 21. Panel de administrador
   - 22. Piezas compartidas y seguridad
4. **Resolución de problemas y FAQ**
   - 1. Mensajes de error habituales
   - 2. Dudas frecuentes
   - 3. Pruebas automáticas
5. **Canales de soporte y contacto**
   - 1. Contactos
   - 2. Horarios de atención
6. **Anexo A. Inventario de archivos del proyecto**
   - A.1 Páginas (carpeta pages/ y raíz)
   - A.2 Código JavaScript (carpeta js/)
   - A.3 Pruebas automáticas
   - A.4 Estilos (carpeta Assets/styles/)
   - A.5 Funciones en la nube (carpeta supabase/functions/)
   - A.6 Herramientas (carpeta scripts/)
   - A.7 Cambios de la base de datos (carpeta db/schema/)

## Introducción

### 1. Propósito del manual

Este Manual del programador muestra cómo está hecho Baradero Local por dentro. Sigue la misma estructura que el Manual de usuario: para cada parte de la página que se ve (el header, el carrito, los paneles…) se muestra el pedazo de código que la hace funcionar, con comentarios y una explicación corta en palabras simples.

Está pensado para que lo pueda leer alguien que no programa: no hace falta entender cada línea. Alcanza con leer los comentarios en verde que acompañan al código y el párrafo "En palabras simples" que sigue a cada cuadro.

El código de este manual se copia automáticamente de los archivos reales del proyecto, con la herramienta `scripts/manual-programador/generar.mjs`. Si el código cambia, se vuelve a generar el manual y queda al día. Igual que en el Manual de usuario: si hay diferencias, manda la versión vigente del sistema.

### 2. Descripción ejecutiva del sistema

Baradero Local es una página web (no una aplicación que se instala) que funciona en cualquier navegador, en la computadora y en el celular. Por dentro se divide en piezas, cada una con una tarea:

| Pieza | Qué es | Dónde está |
| --- | --- | --- |
| Páginas | La estructura de cada pantalla: títulos, botones, formularios. Están escritas en HTML. | `pages/` |
| Estilos | Los colores, tamaños y la ubicación de cada cosa en la pantalla, incluido el modo oscuro. Están escritos en CSS. | `Assets/styles/` |
| Comportamiento | Lo que pasa al tocar un botón: buscar, agregar al carrito, pagar. Está escrito en JavaScript. | `js/` |
| Base de datos | Donde se guardan usuarios, comercios, productos, pedidos y reseñas. Es una base PostgreSQL en Supabase, que además maneja el inicio de sesión, las fotos y los avisos al instante. | Supabase (los cambios, en `db/schema/`) |
| Funciones en la nube | Programas chicos que corren en el servidor para lo que el navegador no puede hacer por seguridad: cobrar con Mercado Pago, confirmar pagos, borrar una cuenta. | `supabase/functions/` |
| Pagos | Mercado Pago, transferencia bancaria y efectivo al retirar en el local. | Mercado Pago + `js/carrito.js` |
| Publicación | Vercel toma el código de GitHub y lo publica en internet cada vez que se actualiza la rama principal (`main`). | `vercel.json` |

Un ejemplo del recorrido completo: cuando un vecino toca "Iniciar pago", el JavaScript del carrito le pide a la base de datos que cree el pedido. La base vuelve a calcular precios y stock (así nadie puede cambiarlos desde su computadora). Si eligió Mercado Pago, una función en la nube arma el cobro y, cuando Mercado Pago avisa que el pago se acreditó, otra función marca el pedido como pagado y al comercio le llega el aviso.

### 3. Requerimientos técnicos

|   |   |
| --- | --- |
| Programas para trabajar con el código | Node.js 20 o más nuevo (trae npm), Git y un editor de texto (por ejemplo, Visual Studio Code). |
| Cuentas y servicios | Supabase (proyecto `otzhdwuaffcplrveuadc`), Vercel (equipo `baradero-local`, proyecto `proyectopdisc`), GitHub (`fac7n3/ProyectoPdisc`), la aplicación de Mercado Pago y el acceso de Google para "Iniciar sesión con Google". |
| Navegador para probar | Cualquier navegador basado en Chromium (Chrome, Edge, Brave). Resolución recomendada: 1920 x 1080; probar también en celular (360 píxeles de ancho). |
| Tipo de conectividad requerida | Internet (WiFi o datos). Sin conexión, la página lo avisa con un cartel. |

### 4. Glosario de convenciones visuales

Así se ven los elementos de este manual:

| Elemento | Cómo se ve | Qué significa |
| --- | --- | --- |
| Archivo | "Archivo: js/login.js (líneas 37 a 83)" | En qué archivo del proyecto está el código y en qué líneas, para encontrarlo. |
| Bloque de código | Cuadro gris con letra de máquina de escribir | El código tal cual está en el proyecto, sin los comentarios internos del equipo para que sea más corto. |
| Comentario del manual | Línea verde que empieza con ▶ | Una explicación agregada para este manual, arriba de la línea que explica. No está en el código real. |
| Partes omitidas | Línea gris en cursiva: "… (se omiten líneas: …)" | Se sacaron líneas para que el cuadro sea corto. El archivo real las tiene. |
| Nombre del código | Letra de máquina de escribir, `así` | El nombre exacto de algo dentro del código: una función, una tabla, un archivo. |
| En palabras simples | Párrafo que sigue a cada cuadro | Qué hace el bloque, sin términos técnicos. |

#### 4.1 Glosario de términos

| Término | Qué quiere decir |
| --- | --- |
| Función | Un conjunto de instrucciones con nombre, que se "llama" cuando hace falta. Por ejemplo, `loginLocal` es la función que inicia sesión. |
| Variable / constante (`const`, `let`) | Un nombre que guarda un dato mientras corre el código, como una cajita con etiqueta. |
| `async` / `await` | Marcan que algo tarda (por ejemplo, preguntarle algo a la base de datos) y que hay que esperar la respuesta antes de seguir. |
| Evento (`addEventListener`) | Le dice a la página "cuando la persona toque este botón, hacé tal cosa". |
| Base de datos y tabla | La base es donde se guarda todo; cada tabla es como una planilla (productos, pedidos, reseñas) con una fila por cada dato. |
| Consulta (`select`, `insert`, `update`, `delete`) | Pedidos a la base: leer, agregar, cambiar o borrar filas. |
| RPC | Una función guardada dentro de la base de datos que la página puede llamar por su nombre (por ejemplo, `create_order` crea un pedido). |
| Política de seguridad (RLS) | Reglas de la base que dicen quién puede ver o cambiar cada fila. Son las que protegen los datos de verdad. |
| Trigger | Un aviso automático: "cuando pase tal cosa en esta tabla, hacé esto otro". |
| Migración | Un archivo con un cambio a la base de datos (una tabla nueva, una regla nueva). Se numeran y se aplican en orden. |
| Función en la nube (Edge Function) | Un programa que corre en los servidores de Supabase, no en el navegador. Se usa cuando hay claves secretas de por medio, como las de Mercado Pago. |
| Sesión / JWT | La "credencial" que queda guardada al iniciar sesión. Dice quién es la persona y qué rol tiene (cliente, vendedor, administrador…). |
| localStorage | Un espacio chico del navegador donde la página guarda cosas entre visitas: el carrito, el modo oscuro, las preferencias. |
| Tiempo real (Realtime) | Una conexión abierta con la base para que los cambios (un pedido nuevo, un aviso) aparezcan solos, sin recargar. |
| Webhook | Un aviso que manda otro sistema cuando algo pasa. Mercado Pago manda uno cuando se acredita un pago. |
| Git, rama y commit | Git guarda la historia del código. Un commit es un cambio guardado con su descripción; una rama es una línea de trabajo aparte hasta que se une a la principal (`main`). |
| Deploy (publicar) | Subir una versión nueva del sitio a internet. Lo hace Vercel solo, cada vez que cambia `main`. |
| Prueba automática (test) | Un archivo que controla solo que una función dé el resultado esperado. Se corren todas con `npm test`. |

## Guía de inicio rápido

### 1. Acceso al código

|   |   |
| --- | --- |
| Código fuente | https://github.com/fac7n3/ProyectoPdisc (rama `main`) |
| Página publicada | https://proyectopdisc.vercel.app/pages/home.html |
| Tablero de tareas | Jira, proyecto A113 (baraderolocal.atlassian.net) |
| Base de datos | Supabase, proyecto `otzhdwuaffcplrveuadc` |
| Publicación | Vercel, equipo `baradero-local`, proyecto `proyectopdisc` |

### 2. Puesta en marcha en una computadora

Así como el usuario primero se registra e inicia sesión, quien trabaja con el código primero tiene que bajarlo y conectarlo con la base de datos.

#### 2.1 Obtener el código e instalar lo necesario

```
git clone https://github.com/fac7n3/ProyectoPdisc.git
cd ProyectoPdisc
npm install
```

`git clone` baja una copia del proyecto; `npm install` descarga las librerías que usa (Supabase, Vite y otras) en la carpeta `node_modules/`.

#### 2.2 Configurar las claves (archivo .env)

Hay que crear a mano un archivo llamado `.env` en la carpeta del proyecto, con la dirección de Supabase y su clave pública. No se sube a GitHub a propósito.

```
VITE_SUPABASE_URL="https://otzhdwuaffcplrveuadc.supabase.co"
VITE_SUPABASE_ANON_KEY="<Supabase → Project Settings → API → anon public key>"
```

**Archivo:** `js/supabase-config.js` (líneas 1 a 2)

```javascript
// ▶ Lee del archivo .env la dirección de la base de datos y la clave pública
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

**En palabras simples:** El código nunca tiene la dirección escrita: la lee del `.env`. Esa clave es pública a propósito; lo que protege los datos son las reglas de la base (ver el módulo 22).

#### 2.3 Correr, construir y probar

**Archivo:** `package.json` (líneas 6 a 14)

```json
"scripts": {
  // ▶ Atajos: se usan escribiendo npm run y el nombre (npm run dev, npm run build…)
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "optimize-images": "node scripts/optimize-images.mjs",
  "test": "for f in js/*.test.mjs supabase/functions/_tests/*.test.mjs; do echo \"--- $f\"; node \"$f\" || exit 1; done"
},
```

**En palabras simples:** `npm run dev` abre la página en la computadora (en http://localhost:5173) y se actualiza sola al guardar un cambio; `npm run build` arma la versión final en la carpeta `dist/`; `npm test` corre todas las pruebas automáticas.

#### 2.4 Publicar los cambios

Cada tarea se hace en una rama propia y, cuando está terminada, se une a `main`. Vercel publica solo cada vez que `main` cambia: por eso nunca se sube a `main` algo a medio hacer. El número de la tarea de Jira (A113-…) va en el mensaje del commit para que la tarea se cierre sola.

```
git checkout -b A113-XXX-descripcion-corta
git add .
git commit -m "Qué se cambió (A113-XXX)"
git push -u origin A113-XXX-descripcion-corta
```

### 3. Navegación general por el código

Así está organizada la carpeta del proyecto (solo lo importante):

```
ProyectoPdisc/
├── index.html          Entrada del sitio: manda directo al inicio
├── pages/              Las pantallas (inicio, carrito, Mi perfil, paneles…)
├── js/                 El comportamiento de cada pantalla
├── Assets/
│   ├── styles/         Los estilos: colores, tamaños, modo oscuro
│   └── ...             Logos e imágenes de la marca
├── public/             Fotos de productos, íconos y archivos fijos
├── db/schema/          Los cambios de la base de datos, numerados en orden
├── supabase/
│   ├── functions/      Funciones en la nube (Mercado Pago, baja de cuenta)
│   └── templates/      Emails de "confirmá tu cuenta" y "nueva contraseña"
├── scripts/            Herramientas (Jira, modo oscuro, este manual)
├── docs/               Documentación del proyecto
├── video/              Videos de la marca
├── dist/               La versión construida que se publica
├── package.json        Lista de librerías y atajos (npm run …)
├── vite.config.js      Cómo se construye el sitio
└── vercel.json         Cómo se publica el sitio
```

#### 3.1 pages/ — las pantallas

Cada pantalla del sitio es un archivo `.html`: `home.html` (inicio), `search.html` (búsqueda y categorías), `carrito.html`, `perfil.html` (Mi perfil), `vender.html` (alta y panel de comerciante), `profesional.html`, `repartidor.html`, `admin.html`, etc. La lista completa está en el Anexo A.

**Archivo:** `vite.config.js` (líneas 26 a 28)

```javascript
// ▶ Cada página tiene que estar anotada acá para que entre en la versión publicada
input: {
  main: resolve(__dirname, 'index.html'),
  home: resolve(__dirname, 'pages/home.html'),
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Vite es la herramienta que "construye" el sitio: junta y achica los archivos. Si se crea una página nueva y no se agrega a esta lista, funciona en la computadora pero no aparece en internet.

#### 3.2 js/ — el comportamiento

Hay un archivo por pantalla (por ejemplo `carrito.js` para `carrito.html`) y archivos compartidos que terminan en `-utils.js` (por ejemplo `cart-utils.js`, que usan todas las páginas que tienen el botón "Agregar"). Los que terminan en `.test.mjs` son pruebas automáticas.

#### 3.3 Assets/styles/ — los estilos

`home.css` tiene los estilos que comparten todas las páginas (el header, las tarjetas, los botones). Al principio define los colores de la marca como "tokens": nombres que el resto del CSS reutiliza, así cambiar un color se hace en un solo lugar.

**Archivo:** `Assets/styles/home.css` (líneas 7 a 29)

```css
:root {
  /* ▶ El azul de Baradero Local; todas las páginas lo usan con el nombre --bl-primary */
  --bl-primary: #284175;
  --bl-primary-dark: #1f3460;
  --bl-primary-deeper: #1e3a5f;
  --bl-accent: #f59e0b;
  --bl-accent-hover: #d97706;

  --bl-bg: #f5f7fa;
  --bl-surface: #ffffff;
  --bl-surface-hover: #f8fafc;
  --bl-surface-alt: #f0f4f8;

  --bl-text: #1a202c;
  --bl-text-secondary: #4a5568;
  --bl-text-muted: #94a3b8;
  --bl-text-inverse: #ffffff;

  --bl-border: #e2e8f0;
  --bl-border-light: #f1f5f9;
```

**En palabras simples:** Cada línea es un color con nombre. El modo oscuro (`dark.css`) vuelve a definir estos mismos nombres con colores oscuros, y toda la página cambia de golpe.

#### 3.4 db/schema/ — la base de datos

Cada archivo `.sql` es una migración: un cambio a la base, numerado en el orden en que se aplicó (tablas, reglas de seguridad, funciones como `create_order`). Un archivo ya aplicado no se edita: si hay que corregir algo, se hace uno nuevo con el número siguiente.

#### 3.5 supabase/functions/ — funciones en la nube

Seis funciones que corren en Supabase: cobrar con Mercado Pago (`mp-create-preference`, `mp-create-boost-preference`), recibir el aviso de pago (`mp-webhook`), vincular la cuenta de Mercado Pago de un comercio (`mp-oauth-start`, `mp-oauth-callback`) y borrar una cuenta (`delete-account`).

#### 3.6 public/ — archivos fijos

Fotos de productos y comercios (`public/img/`), íconos, el archivo `sw.js` (permite instalar la página en el celular como una app) y `robots.txt` (indica a Google qué páginas mostrar).

#### 3.7 dist/ — la versión construida

Es lo que arma `npm run build`. Se guarda en Git por decisión del proyecto, aunque Vercel la vuelve a construir por su cuenta al publicar.

#### 3.8 scripts/, docs/ y video/

`scripts/` tiene herramientas para el equipo (mover tareas de Jira, generar el modo oscuro, este manual). `docs/` tiene la documentación (hoja de ruta, guía de marca, cómo publicar). `video/` tiene los videos de la marca, hechos con código (Remotion).

#### 3.9 Cómo empieza cada página

**Archivo:** `pages/home.html` (líneas 3 a 8)

```html
<head>
  <meta charset="UTF-8" />
  <!-- ▶ Si la persona eligió modo oscuro, se activa antes de dibujar la página (así no hay un destello blanco) -->
  <script>try{if(localStorage.getItem('bl_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
  <!-- ▶ Hace que la página se adapte al ancho del celular -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="view-transition" content="same-origin" />
  <!-- ▶ Lista de lugares desde donde la página puede cargar cosas; bloquea todo lo demás (seguridad) -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com; frame-src https://www.google.com;">
```

**En palabras simples:** Todas las páginas empiezan igual. La última línea es larga: dice, por ejemplo, que la página solo puede conectarse con Supabase y con Google. Si algún día se suma otro servicio, hay que agregarlo en esa línea de todas las páginas.

## Módulos operativos y flujos de trabajo

Cada módulo sigue el mismo número y nombre que en el Manual de usuario. Primero se dice qué archivos lo hacen funcionar y después se muestran sus bloques de código principales.

### 1. Autenticación / inicio de sesión / registro

Archivos: `js/login.js`, `js/register.js`, `js/recuperar-password.js`, `js/nueva-contrasena.js` y `js/auth-utils.js`. Las cuentas las maneja Supabase Auth: guarda los usuarios y las contraseñas (cifradas), manda los emails y conecta con Google. El código del proyecto le pasa los datos y muestra los mensajes.

#### 1.1 Conexión con la base de datos

**Archivo:** `js/auth-utils.js` (líneas 1 a 18)

```javascript
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";
import { initErrorLogging } from "./error-logger.js";
import { applyDevicePreferences } from "./settings-utils.js";
import { completePendingLink, consumeLinkNext } from "./linked-accounts.js";

import { friendlyError } from './friendly-error.js';
// ▶ Aplica las preferencias de Ajustes, por ejemplo "Reducir animaciones"
applyDevicePreferences();

// ▶ Crea la conexión con la base de datos; todas las páginas usan esta misma
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
// ▶ Si algo falla en la página, se anota en la tabla error_logs para que el equipo lo vea
initErrorLogging(supabase);
```

**En palabras simples:** Este archivo lo cargan todas las páginas. Es el que abre la conexión con Supabase, a la que después se le piden datos con `supabase.from(...)` o `supabase.rpc(...)`.

#### 1.2 Ingreso por primera vez (registro)

**Archivo:** `js/register.js` (líneas 120 a 201)

```javascript
async function registerWithEmail() {
  // ▶ Si no tildó "Acepto los términos y condiciones", no sigue
  if (!checkTermsAccepted(termsCheckbox, "terms-label")) return;

  const email = registerEmailInput?.value?.trim() ?? "";
  const password = registerPasswordInput?.value ?? "";
  const passwordConfirm = registerPasswordConfirmInput?.value ?? "";
  const name = registerNameInput?.value?.trim() ?? "";

  // … (se omiten líneas: avisos si el nombre o el correo están vacíos o mal escritos)
  // ▶ La contraseña necesita 8 caracteres, una mayúscula y un número
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    showToast("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número", "error");
    registerPasswordInput?.focus();
    return;
  }
  // … (se omiten líneas: chequeo de que repitió bien la contraseña)
  setLoading(registerBtn, true, "Crear cuenta");

  try {
    // ▶ Le pide a Supabase que cree la cuenta
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
        // ▶ A qué página vuelve la persona cuando confirma su correo
        emailRedirectTo: `${window.location.origin}/pages/${paginaPostRegistro()}`,
      }
    });

    if (error) {
      console.error("Register error:", error);
      showToast(mapRegisterError(error), "error");
      setLoading(registerBtn, false, "Crear cuenta");
      return;
    }

    // ▶ Si ese correo ya tenía cuenta, avisa
    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      showToast("Ya existe una cuenta con ese correo. Intentá iniciar sesión.", "error");
      setLoading(registerBtn, false, "Crear cuenta");
      return;
    }
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Cuando se toca "Crear cuenta", primero se revisan los datos en la misma página (para avisar rápido) y recién después se le manda todo a Supabase.

**Archivo:** `js/register.js` (líneas 28 a 33)

```javascript
function paginaPostRegistro() {
  const tipo = document.querySelector('input[name="account_type"]:checked')?.value;
  // ▶ Si marcó "Vendedor", después del registro va directo al alta de comercio
  if (tipo === "vendedor") return "vender.html";
  if (tipo === "profesional") return "vender.html?tipo=servicio";
  return "home.html";
}
```

**En palabras simples:** Elegir "Cliente", "Vendedor" o "Profesional" en el registro solo cambia a qué pantalla se llega después. La cuenta siempre nace como cliente (ver el bloque siguiente).

**Archivo:** `db/schema/23_fix_handle_new_user_role_escalation.sql` (líneas 23 a 46)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ▶ Al crearse un usuario, la base le arma su perfil automáticamente
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    -- ▶ Toda cuenta nueva empieza como cliente, elija lo que elija en el formulario
    'cliente'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
```

**En palabras simples:** Es un trigger de la base de datos: corre solo cada vez que se crea una cuenta. Así nadie puede darse a sí mismo el rol de vendedor o administrador; ese cambio solo lo hace la aprobación de un administrador.

#### 1.3 Inicio de sesión

**Archivo:** `js/login.js` (líneas 37 a 82)

```javascript
async function loginLocal() {
  const email = emailInput?.value?.trim() ?? "";
  const password = passwordInput?.value ?? "";

  // … (se omiten líneas: avisos si falta el correo o la contraseña)
  setLoading(localLoginBtn, true, "Iniciar sesión");

  try {
    // ▶ Le manda el correo y la contraseña a Supabase para que los verifique
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error("Login error:", error);
      // ▶ Traduce el error técnico a un mensaje claro (ver el bloque siguiente)
      showToast(mapLoginError(error), "error");
      setLoading(localLoginBtn, false, "Iniciar sesión");
      return;
    }

    // ▶ Si salió bien, la página cambia sola al inicio o al panel de la persona
    showToast("¡Sesión iniciada correctamente! Redirigiendo...", "success");
  } catch (err) {
    console.error("Unexpected login error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(localLoginBtn, false, "Iniciar sesión");
  }
}
```

**En palabras simples:** Es lo que pasa al tocar "Iniciar sesión". El código nunca ve si la contraseña es correcta: eso lo decide Supabase.

**Archivo:** `js/login.js` (líneas 11 a 22)

```javascript
function mapLoginError(error) {
  const msg = (error.message || "").toLowerCase();
  const status = error.status;

  // ▶ Cada "if" reconoce un error y devuelve el texto que ve la persona
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("email not confirmed")) {
    return "Tu correo aún no fue confirmado. Revisá tu bandeja de entrada.";
  }
  if (msg.includes("invalid email")) {
    return "El correo electrónico no es válido.";
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Los mensajes de la tabla "Mensajes de error habituales" del Manual de usuario salen de funciones como esta.

#### 1.4 Iniciar sesión con Google

**Archivo:** `js/login.js` (líneas 85 a 111)

```javascript
async function loginWithGoogle() {
  setLoading(googleLoginBtn, true, "Iniciar sesión con Google");

  try {
    // ▶ Después de Google vuelve a la página de login, que decide a dónde mandar a cada uno
    const redirectTo = `${window.location.origin}/pages/login.html`;
    // ▶ Abre la ventana de Google para elegir la cuenta
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // ▶ Siempre muestra la lista de cuentas de Google, aunque ya haya una abierta
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });

    if (error) {
      console.error("Google login error:", error);
      showToast("No se pudo conectar con Google. Intentá de nuevo.", "error");
      setLoading(googleLoginBtn, false, "Iniciar sesión con Google");
    }
  } catch (err) {
    console.error("Unexpected Google login error:", err);
    showToast("Error de conexión con Google. Verificá tu internet.", "error");
    setLoading(googleLoginBtn, false, "Iniciar sesión con Google");
  }
}
```

**En palabras simples:** Con Google no hay contraseña de Baradero Local: Google confirma quién es la persona y Supabase abre la sesión.

#### 1.5 Proceso de recuperación de contraseña

**Archivo:** `js/recuperar-password.js` (líneas 9 a 44)

```javascript
async function requestPasswordReset() {
  const email = emailInput?.value?.trim() ?? "";

  // … (se omiten líneas: avisos si el correo está vacío o mal escrito)
  setLoading(recoverBtn, true, "Enviar correo de recuperación");

  try {
    // ▶ Supabase manda el email con el link para elegir una contraseña nueva
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // ▶ El link del email abre la página nueva-contrasena.html
      redirectTo: `${window.location.origin}/pages/nueva-contrasena.html`,
    });

    if (error) {
      console.error("Reset password error:", error);
      showToast("Hubo un error al intentar enviar el correo. Intentá nuevamente.", "error");
      setLoading(recoverBtn, false, "Enviar correo de recuperación");
      return;
    }

    recoverForm.style.display = "none";
    // ▶ Muestra el cartel de "te mandamos un correo"
    successNotice.style.display = "block";
  } catch (err) {
    console.error("Unexpected reset error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(recoverBtn, false, "Enviar correo de recuperación");
  }
}
```

**En palabras simples:** Por seguridad, el cartel de éxito aparece aunque el correo no esté registrado: así nadie puede averiguar qué correos tienen cuenta.

#### 1.6 Páginas que exigen haber iniciado sesión

**Archivo:** `js/auth-utils.js` (líneas 448 a 509)

```javascript
export async function guardPage({
  requireAuth = false,
  redirectIfAuth = false,
  redirectTo = null,
  requireRole = null,
  onReady = null,
} = {}) {
  const mainContent = document.getElementById('main-content');
  const loadingScreen = document.getElementById('loading-screen');

  // ▶ Mientras se verifica, la página queda oculta y se ve la pantalla de carga
  if (mainContent) mainContent.style.visibility = 'hidden';
  if (loadingScreen) loadingScreen.style.display = 'flex';

  try {
    // ▶ Se fija si en este navegador hay una sesión abierta
    const { data: { session: localSession } } = await supabase.auth.getSession();

    // … (se omiten líneas: verificación de la sesión con el servidor)
    // ▶ Página privada sin sesión: la manda a iniciar sesión
    if (!user && requireAuth) {
      window.location.replace(redirectTo || '../pages/login.html');
      return null;
    }

    // ▶ Ya tiene sesión y entró al login: la manda al inicio o a su panel
    if (user && redirectIfAuth) {
      window.location.replace(await resolvePostLoginRedirect(user, redirectTo));
      return null;
    }

    // ▶ Páginas solo para algunos roles, como la de administración
    if (user && requireRole) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Cada página privada (Mi perfil, los paneles) arranca llamando a `guardPage`. Es el "portero": decide si la persona puede ver la página, si tiene que iniciar sesión o si ya está adentro y hay que llevarla a otro lado.

### 2. Header

Archivos: `js/nav-utils.js` (categorías, buscador, campanita y menú de la cuenta), `js/theme.js` (modo claro/oscuro) y `js/cart-utils.js` (número del carrito). El mismo código arma el header de todas las páginas.

#### 2.1 Categorías

**Archivo:** `js/nav-utils.js` (líneas 25 a 30)

```javascript
const CATEGORY_ICONS = {
  // ▶ Cada categoría tiene su dibujito (ícono); para una categoría nueva se agrega una línea acá
  almacen: 'fa-basket-shopping',
  bebidas: 'fa-wine-bottle',
  carniceria: 'fa-drumstick-bite',
  ferreteria: 'fa-screwdriver-wrench',
  forrajeria: 'fa-paw',
// … (el bloque sigue en el archivo)
```

**Archivo:** `js/nav-utils.js` (líneas 52 a 69)

```javascript
export function getCategories() {
  // ▶ La lista se pide una sola vez por pestaña y se reutiliza
  if (!_categoriesPromise) {
    _categoriesPromise = supabase
      // ▶ Pide a la base la lista de categorías, ordenada por nombre
      .from('categories')
      .select('id, name, slug')
      .order('name')
      .then(({ data, error }) => {
        if (error) { _categoriesPromise = null; throw error; }
        return data || [];
      })
      .catch((err) => {
        console.error('Error al cargar categorías:', err);
        _categoriesPromise = null;
        return [];
      });
  }
  return _categoriesPromise;
}
```

**En palabras simples:** Las categorías no están escritas en el código: son filas de la tabla `categories`. Por eso sumar una categoría es agregar una fila (más su ícono en la lista de arriba).

#### 2.2 Barra de búsqueda para encontrar productos o comercios

**Archivo:** `js/nav-utils.js` (líneas 495 a 503)

```javascript
async function renderSuggestions(query) {
  const q = query.trim();
  // ▶ Con menos de 2 letras muestra las búsquedas recientes
  if (q.length < 2) { renderRecent(); return; }

  const token = ++lastToken;
  // ▶ Pide a la base hasta 6 productos que coincidan con lo escrito
  const { data: products, error } = await supabase.rpc('search_products', {
    p_query: q, p_limit: 6, p_offset: 0, p_sort: 'relevancia',
  });
  // ▶ Si la persona siguió escribiendo, descarta la respuesta vieja
  if (token !== lastToken) return;
// … (el bloque sigue en el archivo)
```

**Archivo:** `js/nav-utils.js` (líneas 556 a 560)

```javascript
input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const val = input.value;
  // ▶ Espera un instante sin teclear (220 milisegundos) antes de buscar, para no consultar con cada letra
  debounceTimer = setTimeout(() => renderSuggestions(val), 220);
});
```

**En palabras simples:** Mientras se escribe aparecen sugerencias de categorías y productos. La búsqueda de verdad la hace la base de datos (`search_products`), que entiende errores de tipeo, plurales y sinónimos.

#### 2.3 Notificaciones

**Archivo:** `js/nav-utils.js` (líneas 657 a 663)

```javascript
async function refreshBadge() {
  await sessionReady;
  if (!session) { badge.textContent = ''; badge.dataset.count = '0'; return; }
  // ▶ Cuenta las notificaciones sin leer de la cuenta
  const count = await fetchUnreadCount(session.user.id);
  // ▶ Si hay más de 9, el círculo rojo dice "9+"
  badge.textContent = count > 0 ? (count > 9 ? '9+' : String(count)) : '';
  badge.dataset.count = String(count);
}
```

**Archivo:** `js/notifications-utils.js` (líneas 431 a 436)

```javascript
export function currentPanelScope() {
  const page = (globalThis.location?.pathname || '').split('/').pop();
  // ▶ Dentro de un panel, solo se ven los avisos de ese panel
  if (page === 'profesional.html') return 'profesional';
  if (page === 'vender.html') return 'comercio';
  return undefined;
}
```

**En palabras simples:** Cada notificación es una fila de la tabla `notifications`. Llegan al instante gracias al tiempo real (módulo 22.1) y, dentro de un panel, se filtran: en el panel de profesional no aparecen los pedidos del comercio.

#### 2.4 Mi perfil (menús que no se salen de la pantalla)

**Archivo:** `js/nav-utils.js` (líneas 597 a 604)

```javascript
function keepInsideViewport(panel) {
  panel.style.right = '';
  const margin = 16;
  // ▶ Mide dónde quedó el menú
  const { left, right } = panel.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const shift = left < margin ? margin - left : right > vw - margin ? vw - margin - right : 0;
  // ▶ Si se sale por un costado, lo corre lo justo para que entre con margen
  if (shift) panel.style.right = `${parseFloat(getComputedStyle(panel).right) - shift}px`;
}
```

**En palabras simples:** En celulares angostos, los menús de la campanita y de la cuenta se salían por el borde. Esta función los acomoda cada vez que se abren.

#### 2.5 Mi carrito

**Archivo:** `js/cart-utils.js` (líneas 449 a 460)

```javascript
export function updateCartBadge() {
  const cart = getCart();
  // ▶ Cuenta productos distintos, no unidades: 2 alfajores iguales cuentan como 1
  const total = cart.length;
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = total > 0 ? total : '';
    badge.dataset.count = total;
  }
}
```

**En palabras simples:** Es el número que aparece sobre el ícono del carrito. Se actualiza cada vez que se agrega o se saca algo.

#### 2.6 Logo de Baradero Local

**Archivo:** `js/auth-utils.js` (líneas 339 a 342)

```javascript
function markHomeIntent(e) {
  // ▶ Solo reacciona al toque sobre el logo
  if (!e.target.closest?.(".navbar__logo")) return;
  // ▶ Anota "quiero ver el inicio", así a quien tiene panel no lo mandan de vuelta a su panel
  try { sessionStorage.setItem(HOME_INTENT_KEY, "1"); } catch { /* sessionStorage bloqueado */ }
}
```

**En palabras simples:** El logo es un link al inicio. Además deja esta marca porque el inicio lleva automáticamente a su panel a los comerciantes y profesionales; tocar el logo es la forma de decir "quiero ver el inicio igual".

#### 2.7 Modo claro/oscuro

**Archivo:** `js/theme.js` (líneas 62 a 76)

```javascript
function setTheme(theme, { persist = true, animate = false } = {}) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 350);
  }
  // ▶ Cambia los colores de toda la página
  applyTheme(theme);
  if (persist) {
    try {
      // ▶ Recuerda la elección en este navegador para la próxima visita
      localStorage.setItem(THEME_KEY, theme);
    } catch {
    }
  }
}
```

**En palabras simples:** El botón del sol y la luna llama a `setTheme`. Los colores oscuros están en `dark.css` (ajustes a mano) y `dark-auto.css` (generado solo con `scripts/gen-dark-css.mjs`).

### 3. Header Auxiliar

En las páginas que no son el inicio, el header es más simple: logo, flecha para volver, campanita, perfil, carrito y modo claro/oscuro. Todo es el mismo código del módulo 2, salvo la flecha.

#### 3.1 Volver atrás

**Archivo:** `js/auth-utils.js` (líneas 353 a 361)

```javascript
function hasSiteHistory() {
  // ▶ Dentro de Mi perfil siempre se puede volver a la sección anterior
  if (window.history.state?.blSection) return true;
  if (window.history.length <= 1 || !document.referrer) return false;
  try {
    // ▶ Solo vuelve atrás si la página anterior es de Baradero Local
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
```

**Archivo:** `js/auth-utils.js` (líneas 363 a 374)

```javascript
function handleNavBack(e) {
  const circle = e.target.closest?.(".navbar__action-circle");
  if (!circle || !circle.querySelector(".fa-arrow-left")) return;
  e.preventDefault();
  if (hasSiteHistory()) {
    // ▶ Vuelve a la página anterior
    window.history.back();
    return;
  }
  try { sessionStorage.setItem(HOME_INTENT_KEY, "1"); } catch { /* sessionStorage bloqueado */ }
  // ▶ Si no hay a dónde volver (por ejemplo, entró por un link de WhatsApp), va al inicio
  window.location.href = circle.getAttribute("href") || "./home.html";
}
```

**En palabras simples:** La flecha funciona como el botón "atrás" del navegador, pero sin sacar a la persona del sitio.

### 4. Categorías

Archivos: `js/search.js` (la página de resultados con sus filtros), `js/product-modal.js` (la ventana del producto), `js/reviews-utils.js` (reseñas) y `js/cart-utils.js` (favoritos y carrito).

#### 4.1 Barra de navegación, categorías y filtros

**Archivo:** `js/search.js` (líneas 277 a 286)

```javascript
const { data: products, error } = await supabase.rpc('search_products', {
  // ▶ Lo que se escribió en el buscador
  p_query: filterState.query || null,
  // ▶ La categoría elegida (o todas)
  p_category: filterState.category || 'todas',
  p_zone: null,
  // ▶ Precio mínimo y máximo de los filtros
  p_min_price: filterState.minPrice,
  p_max_price: filterState.maxPrice,
  // ▶ El orden: más relevantes, menor precio, mayor precio, más recientes o A-Z
  p_sort: filterState.sortBy,
  p_limit: PAGE_SIZE,
  // ▶ De a una página por vez: "Ver más" pide la siguiente
  p_offset: filterState.page * PAGE_SIZE,
});
```

**En palabras simples:** Cada vez que se cambia un filtro, la búsqueda se hace de nuevo sola (no hay botón "Aplicar"). Los filtros viajan a la función `search_products` de la base, que devuelve los productos ya filtrados y ordenados. Borrar la categoría (la "x") es volver a buscar con "todas".

#### 4.2 Productos (la ventana del producto)

**Archivo:** `js/product-modal.js` (líneas 36 a 56)

```javascript
async function fetchProductData(productId) {
  const [product, { data: { session } }] = await Promise.all([
    // ▶ Pide todo el producto en una sola consulta: datos, comercio, fotos, opciones y reseñas
    fetchProductDetail(productId),
    supabase.auth.getSession(),
  ]);

  const offerExpired = isOfferExpired(product);
  // ▶ Si tiene precio anterior y la oferta no venció, calcula el porcentaje de descuento
  const hasDiscount = !!(product.compare_at_price && product.compare_at_price > product.price && !offerExpired);
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;

  const store = product.stores || {};
  const extraImages = (product.product_images || [])
    .filter((pi) => pi.url !== product.image_url)
    .sort((a, b) => a.position - b.position);
  const images = [product.image_url || '/img/no-image.svg', ...extraImages.map((pi) => pi.url)];

  // ▶ El texto del costo de envío del comercio
  const shippingText = store.delivery_fee == null
    ? 'El costo de envío se calcula en el carrito, según el comercio.'
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Al tocar un producto se abre una ventana encima de la página. Mientras llegan los datos, ya muestra lo que tenía la tarjeta (foto, nombre, precio) para que no haya que esperar.

##### 4.2.1 Compartir

**Archivo:** `js/product-modal.js` (líneas 961 a 984)

```javascript
const shareBtn = overlay.querySelector('#pm-share-btn');
shareBtn?.addEventListener('click', async () => {
  const shareData = {
    title: data.name,
    text: `Mirá ${data.name} en Baradero Local por ${data.priceText}`,
    url: window.location.href
  };

  try {
    // ▶ En el celular abre el menú de compartir (WhatsApp, Instagram…)
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // ▶ En la computadora copia el link para pegarlo donde se quiera
      await navigator.clipboard.writeText(`${shareData.text} — ${shareData.url}`);
      _showToast('¡Link copiado al portapapeles!', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      try {
        await navigator.clipboard.writeText(window.location.href);
        _showToast('¡Link copiado!', 'success');
      } catch { /* silently fail */ }
    }
  }
});
```

##### 4.2.2 Corazón (favoritos)

**Archivo:** `js/cart-utils.js` (líneas 849 a 869)

```javascript
export async function toggleFavorite(productId, isCurrentlyFavorite) {
  const { data: { session } } = await supabase.auth.getSession();

  // ▶ Sin sesión, el favorito se guarda en el navegador
  if (!session) {
    const list = getLocalWishlist();
    if (isCurrentlyFavorite) {
      const idx = list.indexOf(productId);
      if (idx > -1) list.splice(idx, 1);
    } else if (!list.includes(productId)) {
      list.push(productId);
    }
    saveLocalWishlist(list);
    return;
  }

  if (isCurrentlyFavorite) {
    // ▶ Si ya era favorito, lo saca
    await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('product_id', productId);
  } else {
    // ▶ Si no, lo agrega a la tabla favorites de la cuenta
    await supabase.from('favorites').insert({ user_id: session.user.id, product_id: productId });
  }
}
```

**En palabras simples:** Al iniciar sesión, los favoritos que se marcaron sin cuenta se suben solos a la cuenta.

##### 4.2.3 Cantidad

**Archivo:** `js/product-modal.js` (líneas 822 a 838)

```javascript
const qtyInput = overlay.querySelector('#pm-qty-value');
const qtyMinus = overlay.querySelector('#pm-qty-minus');
const qtyPlus = overlay.querySelector('#pm-qty-plus');

function updateQtyState() {
  const val = parseInt(qtyInput.value, 10) || 1;
  // ▶ El "menos" se apaga en 1 y el "más" al llegar al stock disponible
  qtyMinus.disabled = val <= 1;
  qtyPlus.disabled = val >= data.stock;
}

qtyMinus?.addEventListener('click', () => {
  const val = parseInt(qtyInput.value, 10) || 1;
  // ▶ Resta uno, sin bajar de 1
  if (val > 1) qtyInput.value = val - 1;
  updateQtyState();
});

qtyPlus?.addEventListener('click', () => {
// … (el bloque sigue en el archivo)
```

##### 4.2.4 Añadir al carrito

**Archivo:** `js/product-modal.js` (líneas 853 a 910)

```javascript
addCartBtn?.addEventListener('click', () => {
  const qty = parseInt(qtyInput?.value, 10) || 1;
  const priceOld = _parsePrice(data.priceOldText);

  const selectedIds = [...overlay.querySelectorAll('#pm-options input[type="radio"]:checked')].map((r) => r.value);

  // ▶ Si el producto tiene opciones (color, talle) y falta elegir alguna, avisa y no lo agrega
  const missing = missingOptionNames(data.optionGroups, selectedIds);
  if (missing.length > 0) {
    _showToast(`Elegí ${missing.map((m) => m.toLowerCase()).join(' y ')} antes de agregar al carrito.`, 'error');
    overlay.querySelector('#pm-options')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const snapshot = buildSelectionSnapshot(data.optionGroups, selectedIds);
  const lineKey = cartLineKey(data.id, selectedIds);

  const cart = _getCart();
  // ▶ Si ya estaba en el carrito con las mismas opciones, suma la cantidad
  const existing = cart.find(item => itemLineKey(item) === lineKey);

  if (existing) {
    existing.qty += qty;
    existing.selected = true;
  } else {
    // ▶ Si no, agrega una línea nueva con nombre, comercio, precio, foto y cantidad
    cart.push({
      id: data.id,
      name: data.name,
      shop: data.shop,
      price: data.price,
      priceOld: priceOld || null,
      image: data.imgSrc,
      qty,
      options: selectedIds,
      optionsLabel: snapshot,
      selected: true
    });
  }

  // ▶ Guarda el carrito y actualiza el número del ícono
  _saveCart(cart);
  _updateBadge();

  // … (se omiten líneas: animación del botón "¡Agregado!")
  const chosen = describeSelectedOptions(buildSelectionSnapshot(data.optionGroups, selectedIds));
  _showToast(`${data.name}${chosen ? ` (${chosen})` : ''} agregado al carrito (x${qty})`, 'success');
});
```

**En palabras simples:** La misma remera en rojo y en azul son dos líneas distintas del carrito. "Comprar ahora" hace lo mismo y además lleva directo al carrito.

##### 4.2.5 Reseñas

**Archivo:** `js/reviews-utils.js` (líneas 135 a 151)

```javascript
export async function submitReview(targetType, targetId, rating, comment) {
  const { data: { session } } = await supabase.auth.getSession();
  // ▶ Para opinar hay que haber iniciado sesión
  if (!session) throw new Error('Debés iniciar sesión para dejar una reseña.');

  // ▶ Guarda la reseña; si la persona ya había opinado, la reemplaza (una por persona)
  const { error } = await supabase.from('reviews').upsert(
    {
      target_type: targetType,
      target_id: targetId,
      client_id: session.user.id,
      // ▶ La cantidad de estrellas, de 1 a 5
      rating,
      comment: comment || null,
    },
    { onConflict: 'target_type,target_id,client_id' }
  );

  if (error) throw error;
}
```

**En palabras simples:** Las reseñas de productos, comercios y profesionales están todas en la tabla `reviews`. Un administrador o moderador puede ocultar una reseña reportada.

##### 4.2.6 Productos relacionados

**Archivo:** `js/product-modal.js` (líneas 134 a 161)

```javascript
async function fetchRelatedProducts(productId) {
  try {
    const { data: current, error: currentError } = await supabase
      .from('products')
      // ▶ Primero averigua de qué categoría es el producto
      .select('category_id')
      .eq('id', productId)
      .maybeSingle();
    if (currentError || !current?.category_id) return [];

    const { data, error } = await supabase
      .from('products')
      .select('id, title, price, compare_at_price, offer_expires_at, image_url, stock')
      // ▶ Después busca otros productos activos y con stock de esa misma categoría
      .eq('category_id', current.category_id)
      .eq('is_active', true)
      .gt('stock', 0)
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(RELATED_MAX * 3);
    if (error || !data) return [];

    // ▶ Los mezcla al azar para que no salgan siempre los del mismo comercio
    const mixed = [...data];
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    return mixed.slice(0, RELATED_MAX);
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Si no hay otros productos de la misma categoría, la sección no aparece (no se rellena con cualquier cosa).

### 5. Panel de perfil

Archivos: `pages/perfil.html` y `js/perfil.js`, más `js/profile-fields.js` (datos personales), `js/account-switcher.js` (cambiar de cuenta), `js/support-utils.js` (soporte) y `js/settings-utils.js` (ajustes).

#### 5.1 Moverse entre las secciones de Mi perfil

**Archivo:** `js/perfil.js` (líneas 103 a 109)

```javascript
function openSection(targetId, scrollToId) {
  if (!document.getElementById(targetId)) return;
  if (window.history.state?.blSection !== targetId) {
    // ▶ Anota la sección en el historial: así la flecha "volver" regresa al menú de Mi perfil
    window.history.pushState({ blSection: targetId }, '', window.location.href);
  }
  showSection(targetId, scrollToId);
}
```

**En palabras simples:** Mi perfil es una sola página con secciones (Información, Direcciones, Compras, Favoritos, Soporte, Ajustes). Tocar un acceso muestra esa sección y esconde las otras.

#### 5.2 Información de tu perfil

**Archivo:** `js/profile-fields.js` (líneas 31 a 50)

```javascript
export const PROFILE_FIELDS = [
  {
    // ▶ Cada dato del perfil se describe así: qué muestra, cómo se edita y cómo se revisa
    key: "full_name",
    container: "datos-personales",
    label: "Nombre y apellido",
    hint: "Es el nombre que ve el comercio cuando le entra tu pedido.",
    display: (p) => p.full_name,
    inputs: (p) => [{
      el: "input", name: "full_name", type: "text", value: p.full_name || "",
      placeholder: "Ej: María González", autocomplete: "name", maxLength: 80,
      className: "datos-input datos-input--grow", aria: "Nombre y apellido",
    }],
    collect: (v) => ({ full_name: v.full_name.trim() || null }),
    // ▶ Los chequeos antes de guardar, con el mensaje que ve la persona
    validate: (v) => {
      const n = v.full_name.trim();
      if (!n) return "Escribí tu nombre y apellido.";
      if (n.length < 2) return "Ese nombre es muy corto.";
      return null;
    },
  },
```

**En palabras simples:** Se muestra solo el primer dato (nombre y apellido); los demás (fecha de nacimiento, documento, teléfono) siguen el mismo molde. Sumar un dato nuevo es agregar otro bloque como este.

#### 5.3 Cambiar de cuenta

**Archivo:** `js/account-switcher.js` (líneas 79 a 107)

```javascript
async function switchTo(entry, button) {
  button.disabled = true;
  const etiqueta = button.textContent;
  button.textContent = 'Cambiando…';

  const { data: { session: actual } } = await supabase.auth.getSession();
  // ▶ Guarda la sesión de la cuenta actual para poder volver a ella
  if (actual) rememberAccount(actual);

  // ▶ Abre la sesión de la otra cuenta guardada en este dispositivo
  const { data, error } = await supabase.auth.setSession(entry.session);
  if (error || !data?.session) {
    console.error('No se pudo abrir la otra cuenta:', error);
    // ▶ Si esa sesión ya no sirve, la saca de la lista
    forgetAccount(entry.id);
    showToast('La sesión de esa cuenta se cerró. Agregala de nuevo para volver a usarla.', 'error');
    button.disabled = false;
    button.textContent = etiqueta;
    await render();
    return;
  }

  rememberAccount(data.session);
  // ▶ Cada cuenta tiene su propio carrito: no se mezclan
  resetLocalCartState();
  showToast(`Entraste con ${entry.email}`, 'success');
  window.location.href = afterSwitchUrl;
}
```

**En palabras simples:** Para agregar una cuenta a la lista hay que iniciar sesión en ella (no se puede sumar la de otra persona). Las cuentas se guardan solo en ese dispositivo, y "Cerrar sesión" las borra todas.

#### 5.4 Direcciones (predeterminar dirección)

**Archivo:** `js/perfil.js` (líneas 494 a 505)

```javascript
if (!addr.is_default) {
  const defaultBtn = document.createElement('button');
  defaultBtn.type = 'button';
  defaultBtn.style.cssText = 'font-size: 0.8rem; padding: 0.25rem 0.6rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: 6px; background: var(--bl-surface, white); color: var(--bl-text, inherit); cursor: pointer;';
  defaultBtn.textContent = 'Predeterminar';
  defaultBtn.addEventListener('click', async () => {
    // ▶ Primero le saca la marca de "predeterminada" a todas las direcciones
    await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', userId);
    // ▶ Después se la pone a la elegida
    await supabase.from('user_addresses').update({ is_default: true }).eq('id', addr.id);
    loadAddresses(userId);
  });
  actions.appendChild(defaultBtn);
}
```

**En palabras simples:** Las direcciones son filas de la tabla `user_addresses`. La predeterminada es la que aparece elegida en el carrito.

#### 5.5 Soporte

**Archivo:** `js/support-utils.js` (líneas 343 a 357)

```javascript
export async function submitSupportTicket(subject, message, attachments = []) {
  const { data: { session } } = await supabase.auth.getSession();
  // ▶ Hay que haber iniciado sesión para mandar un reclamo
  if (!session) throw new Error('Debés iniciar sesión para enviar un reclamo.');

  const row = { user_id: session.user.id, subject, message };
  if (attachments.length) row.attachments = attachments;

  // ▶ Guarda el reclamo con asunto, mensaje y capturas
  const { error } = await supabase.from('support_tickets').insert(row);
  if (error) {
    // ▶ Si no se pudo guardar, borra las capturas que ya había subido
    await removeAttachments(attachments);
    throw error;
  }
}
```

**Archivo:** `js/support-utils.js` (líneas 398 a 406)

```javascript
async function cancelTicket(ticketId) {
  const { data, error } = await supabase
    .from('support_tickets')
    // ▶ Cancelar un reclamo es cambiarle el estado
    .update({ status: 'cancelled' })
    .eq('id', ticketId)
    .select('id');
  if (error) throw error;
  // ▶ Si la base no lo cambió, avisa en vez de decir "listo"
  if (!data?.length) throw new Error('No se pudo cancelar el reclamo. Recargá la página y probá de nuevo.');
}
```

**En palabras simples:** Los reclamos quedan en la tabla `support_tickets` y el administrador los responde desde su panel. El estado (Abierto, Pendiente, Cerrado) es una columna de esa tabla.

#### 5.6 Ajustes

**Archivo:** `js/settings-utils.js` (líneas 48 a 57)

```javascript
export function setPref(name, enabled) {
  const pref = PREFS[name];
  if (!pref) return;
  try {
    // ▶ La preferencia se guarda en este navegador
    localStorage.setItem(pref.key, enabled ? '1' : '0');
  } catch {
  }
  // ▶ Y se aplica en el momento, sin recargar
  applyDevicePreferences();
}
```

**En palabras simples:** Las preferencias ("Mostrar ayudas en el carrito", "Avisos emergentes", "Reducir animaciones") son por dispositivo: se pueden tener distintas en el celular y en la computadora.

**Archivo:** `js/perfil.js` (líneas 364 a 391)

```javascript
function initSignOutAll() {
  const btn = document.getElementById("btn-signout-all");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    // ▶ Primero pregunta si está segura
    const ok = await confirmDialog(
      "Vas a cerrar la sesión en todos los dispositivos donde entraste con esta cuenta.\n\n" +
      "No se borra nada: tus compras, tus favoritos y tus direcciones quedan igual. " +
      "Solo vas a tener que ingresar de nuevo.",
      { confirmText: "Sí, cerrar sesión" }
    );
    if (!ok) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Cerrando…";

    try {
      // ▶ Borra las otras cuentas guardadas en el dispositivo
      clearLinkedAccounts();
      // ▶ Cierra la sesión en todos los dispositivos donde se entró con esta cuenta
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      showToast("Listo, cerramos la sesión en todos lados.", "success");
    } catch (err) {
      console.error("Error al cerrar la sesión en todos los dispositivos", err);
      showToast("No pudimos cerrar las otras sesiones. Probá de nuevo en un rato.", "error");
      btn.disabled = false;
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Es el botón "Cerrar en todos" de Sesión y seguridad.

##### 5.6.1 Tus datos son tuyos (eliminar mi cuenta)

**Archivo:** `supabase/functions/delete-account/index.ts` (líneas 123 a 163)

```javascript
const { data: stores, error: storesError } = await admin
  .from("stores")
  .select("id, name")
  .eq("owner_id", user.id);
if (storesError) throw storesError;

// ▶ Si la persona es dueña de un comercio, no se borra (se llevaría el comercio entero)
if (stores && stores.length > 0) {
  return jsonResponse({
    error: "tiene_tienda",
    message:
      `Tenés un comercio activo (${stores.map((s) => s.name).join(", ")}). ` +
      "Si borramos tu cuenta ahora se irían también sus productos y cupones. " +
      "Escribinos desde Soporte y lo cerramos o lo transferimos primero.",
  }, 409);
}

const { count: openOrders, error: ordersError } = await admin
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("client_id", user.id)
  // ▶ Tampoco si tiene pedidos en curso
  .in("status", ORDERS_IN_FLIGHT);
if (ordersError) throw ordersError;

if (openOrders && openOrders > 0) {
  return jsonResponse({
    error: "pedidos_abiertos",
    message:
      `Tenés ${openOrders} pedido${openOrders === 1 ? "" : "s"} en curso. ` +
      "Esperá a recibirlo" + (openOrders === 1 ? "" : "s") +
      " o cancelalo con el comercio, y después volvé a pedir la baja.",
  }, 409);
}

// ▶ Si pasó los dos chequeos, borra la cuenta
const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
if (deleteError) throw deleteError;
```

**En palabras simples:** Borrar una cuenta necesita una clave secreta que no puede estar en el navegador, por eso lo hace una función en la nube. La cuenta a borrar sale siempre de la sesión de quien lo pide: nadie puede borrar la cuenta de otro. Los pedidos ya entregados quedan en el historial del comercio, sin los datos de la persona.

### 6. Carrito

Archivos: `js/carrito.js` (la página), `js/cart-utils.js` (guardar el carrito), `js/cart-totals.js` (la cuenta del total), `js/payment-providers.js` (los medios de pago) y, en la base, la función `create_order`.

#### 6.1 Dónde se guarda el carrito

**Archivo:** `js/cart-utils.js` (líneas 11 a 20)

```javascript
export function getCart() {
  try {
    // ▶ El carrito se guarda en el navegador, para que no se pierda al cambiar de página
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    localStorage.removeItem(CART_KEY);
    return [];
  }
}
```

**Archivo:** `js/cart-utils.js` (líneas 28 a 31)

```javascript
export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  // ▶ Si hay sesión, también se copia a la nube: el carrito es el mismo en el celular y en la computadora
  pushCartToCloud(cart).catch((err) => console.error('Error al sincronizar el carrito:', err));
}
```

#### 6.2 Checkbox del comercio y del producto

**Archivo:** `js/cart-utils.js` (líneas 261 a 268)

```javascript
export function isItemSelected(item) {
  // ▶ Un producto entra en la compra salvo que se le haya sacado el tilde
  return item?.selected !== false;
}

export function getSelectedItems(cart) {
  // ▶ Al pagar, solo viajan los productos tildados; los demás quedan para después
  return (cart || []).filter(isItemSelected);
}
```

#### 6.3 Vaciar mi carrito

**Archivo:** `js/cart-utils.js` (líneas 246 a 249)

```javascript
export function clearCart() {
  localStorage.removeItem(CART_KEY);
  // ▶ También vacía la copia de la nube
  pushCartToCloud([]).catch((err) => console.error('Error al sincronizar el carrito:', err));
}
```

#### 6.4 Resumen del pedido (la cuenta del total)

**Archivo:** `js/cart-totals.js` (líneas 57 a 98)

```javascript
export function computeCartTotals({
  items,
  storeIdOf,
  shippingOf = () => undefined,
  deliveryMethod = 'pickup',
  couponPercent = 0,
  couponStoreId = null,
}) {
  const subtotalByStore = new Map();
  for (const item of items || []) {
    const storeId = storeIdOf(item);
    // ▶ Precio por cantidad de cada producto, sumado por comercio
    const line = Number(item.price) * Number(item.qty);
    subtotalByStore.set(storeId, (subtotalByStore.get(storeId) || 0) + line);
  }

  const byStore = [];
  for (const [storeId, subtotal] of subtotalByStore) {
    // ▶ El cupón se aplica solo en el comercio que lo creó (o en todos, si es general)
    const discountPct = discountPctForStore(couponPercent, couponStoreId, storeId);
    const discounted = subtotal * (1 - discountPct / 100);

    const fee = shippingOf(storeId)?.deliveryFee ?? DEFAULT_DELIVERY_FEE;
    // ▶ Con envío a domicilio se suma el costo de envío de cada comercio
    const shipping = deliveryMethod === 'delivery' ? fee : 0;

    byStore.push({
      storeId,
      subtotal,
      discountPct,
      discounted: Math.round(discounted),
      shipping,
      total: Math.round(discounted) + shipping,
    });
  }

  const subtotal = byStore.reduce((acc, s) => acc + s.subtotal, 0);
  const shipping = byStore.reduce((acc, s) => acc + s.shipping, 0);
  // ▶ El total es la suma de lo que se le paga a cada comercio
  const total = byStore.reduce((acc, s) => acc + s.total, 0);
  const discountAmount = subtotal - byStore.reduce((acc, s) => acc + s.discounted, 0);

  return { subtotal, discountAmount, shipping, total, byStore };
}
```

**En palabras simples:** Esta cuenta es la misma que hace la base de datos al crear el pedido, así el total que ve la persona es el que se cobra. Tiene pruebas automáticas en `js/cart-totals.test.mjs`. Los precios son siempre pesos enteros, sin centavos.

**Archivo:** `js/carrito.js` (líneas 732 a 746)

```javascript
function applyCashRule() {
  // ▶ ¿Eligió envío a domicilio?
  const delivery = deliveryMethod === 'delivery';
  const label = document.getElementById('payment-efectivo-label');
  const radio = document.getElementById('payment-efectivo');
  const note = document.getElementById('payment-cash-note');
  // ▶ Con envío, la opción "Efectivo" se esconde
  if (label) label.style.display = delivery ? 'none' : '';
  if (radio) radio.disabled = delivery;
  if (note) note.hidden = !delivery;
  // ▶ Si ya tenía efectivo elegido, pasa sola a Mercado Pago o transferencia
  if (delivery && radio?.checked) {
    const mp = document.getElementById('payment-mercadopago');
    const fallback = mp && !mp.disabled ? mp : document.getElementById('payment-transferencia');
    if (fallback) fallback.checked = true;
    syncPaymentMethod();
  }
}
```

**En palabras simples:** El efectivo es solo para retirar en el local. La base de datos también lo controla, por si alguien intenta saltearse la pantalla.

#### 6.5 Iniciar pago

**Archivo:** `js/carrito.js` (líneas 1299 a 1328)

```javascript
// ▶ Arma la lista de lo que se compra: solo el producto, la cantidad y las opciones (nunca el precio)
const payload = selectedItems.map(item => ({
  id: item.id,
  qty: item.qty,
  ...(item.options?.length ? { options: item.options } : {}),
}));

// ▶ Le pide a la base que cree el pedido (uno por cada comercio)
const { data, error } = await supabase.rpc('create_order', {
  cart_payload: payload,
  coupon_code: appliedCouponCode,
  p_delivery_method: deliveryMethod,
  p_payment_method: paymentMethod,
  p_shipping_address: deliveryMethod === 'delivery' ? shippingAddress : null,
});

// ▶ Si algo no está bien (sin stock, cupón vencido), muestra el motivo
if (error) {
  console.error('Error al crear la orden:', error);
  showCartToast(friendlyError(error, 'No se pudo procesar tu pedido.'), 'error');
  return;
}

const orders = data?.orders || [];
const orderIds = orders.map((o) => o.order_id);
const total = orders.reduce((acc, o) => acc + o.total_price, 0);

// ▶ Según el medio de pago elegido, sigue el paso que corresponde
const provider = getPaymentProvider(paymentMethod);
const paymentResult = await provider.pay(paymentMethod === 'mercadopago' ? orderIds.slice(0, 1) : orderIds);
```

**En palabras simples:** Con transferencia se muestran los datos del comercio para copiar; con efectivo, el código de retiro; con Mercado Pago, se pasa a la página de pago de Mercado Pago (si hay varios comercios, se paga de a uno).

##### 6.5.1 El pedido dentro de la base de datos

**Archivo:** `db/schema/145_create_order_sin_envio_gratis.sql` (líneas 31 a 37)

```sql
-- ▶ Hay que haber iniciado sesión
if v_client is null then raise exception 'Debés iniciar sesión para comprar.'; end if;
if p_delivery_method not in ('pickup', 'delivery') then raise exception 'Método de envío inválido.'; end if;
if p_payment_method not in ('simulado', 'mercadopago', 'transferencia', 'efectivo') then raise exception 'Método de pago inválido.'; end if;
if p_payment_method = 'simulado' and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then raise exception 'El pago simulado es solo para pruebas internas.'; end if;
-- ▶ Con envío, la dirección es obligatoria
if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address), '') = '' then raise exception 'Ingresá una dirección de envío.'; end if;
-- ▶ Efectivo solo con retiro en el local
if p_delivery_method = 'delivery' and p_payment_method = 'efectivo' then raise exception 'El pago en efectivo es solo para retiro en el local. Con envío a domicilio elegí Mercado Pago o transferencia.'; end if;
if cart_payload is null or jsonb_typeof(cart_payload) != 'array' or jsonb_array_length(cart_payload) = 0 then raise exception 'El carrito está vacío.'; end if;
```

**Archivo:** `db/schema/145_create_order_sin_envio_gratis.sql` (líneas 66 a 83)

```sql
-- ▶ Si no alcanza el stock de algún producto, se cancela toda la compra
if exists (select 1 from (select product_id, sum(qty) as total_qty from _order_cart_items group by product_id) agg
           join public.products p on p.id = agg.product_id where p.stock < agg.total_qty) then
  raise exception 'No hay stock suficiente para uno o más productos del carrito.';
end if;
-- ▶ Arma un pedido por cada comercio del carrito
for v_store_id in select distinct store_id from _order_cart_items loop
  select sum(price * qty) into v_subtotal from _order_cart_items where store_id = v_store_id;
  select delivery_fee into v_store_delivery_fee from public.stores where id = v_store_id;
  v_store_discount_pct := case when v_coupon_discount_pct is not null and (v_coupon_store_id is null or v_coupon_store_id = v_store_id) then v_coupon_discount_pct else 0 end;
  if p_delivery_method = 'delivery' then v_delivery_fee := v_store_delivery_fee; else v_delivery_fee := 0; end if;
  -- ▶ Total: subtotal con el descuento del cupón, más el envío
  v_total := round(v_subtotal * (1 - v_store_discount_pct / 100.0))::integer + v_delivery_fee;
  -- ▶ Guarda el pedido
  insert into public.orders (client_id, store_id, status, shipping_address, total_price, delivery_method, payment_method, payment_status, delivery_fee, payment_due_at)
  values (v_client, v_store_id, 'pending', p_shipping_address, v_total, p_delivery_method, p_payment_method, 'pending', v_delivery_fee, v_due_at)
  returning id, order_number into v_order_id, v_order_number;
  insert into public.order_items (order_id, product_id, quantity, price, title, selected_options)
  select v_order_id, product_id, qty, price, title, selected_options from _order_cart_items where store_id = v_store_id;
  -- ▶ Descuenta el stock
  update public.products p set stock = p.stock - agg.qty
  from (select product_id, sum(qty) as qty from _order_cart_items where store_id = v_store_id group by product_id) agg
  where p.id = agg.product_id;
```

**En palabras simples:** `create_order` es la parte más importante del sistema: vuelve a leer los precios reales de la base, controla stock, opciones y cupón, y recién ahí crea los pedidos. Si algo falla en el medio, no se guarda nada.

##### 6.5.2 Confirmación del pago de Mercado Pago

**Archivo:** `supabase/functions/mp-webhook/index.ts` (líneas 329 a 368)

```javascript
// ▶ Suma lo que deberían haber pagado los pedidos
const expectedTotal = pendingOrders.reduce(
  (sum: number, o: { total_price: number }) => sum + Number(o.total_price),
  0,
);
// ▶ Lo que Mercado Pago dice que se cobró
const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));

// ▶ Si se cobró menos, NO se da por pagado: queda "a revisar"
if (paidAmount < expectedTotal) {
  // … (se omiten líneas: marca el pedido "a revisar" y avisa al comercio)
  return new Response("ok", { status: 200 });
}

const { data: updated, error } = await supabase
  .from("orders")
  .update({
    // ▶ Si está todo bien, el pedido queda pagado
    payment_status: "paid",
    status: "paid",
    payment_id: String(payment.id),
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Cuando alguien paga, Mercado Pago avisa a esta función en la nube (un "webhook"). La función no se cree el aviso: vuelve a consultar el pago en Mercado Pago y compara el monto antes de marcar el pedido como pagado. Si después hay una devolución, el pedido vuelve a "a revisar".

### 7. Accesos Rápidos

#### 7.1 Los tres botones del inicio

**Archivo:** `pages/home.html` (líneas 119 a 123)

```html
<div class="category-bar__inner category-bar__inner--home-actions">
  <!-- ▶ Este botón dice "Vender" o "Panel" según la cuenta (ver el módulo 17) -->
  <a href="./vender.html" class="home-action" id="home-panel-action">Vender</a>
  <a href="./contratar.html" class="home-action">Contratar</a>
  <a href="./servicios.html" class="home-action">Emergencias</a>
</div>
```

#### 7.2 Vender (pedir el alta de un comercio)

**Archivo:** `js/vender.js` (líneas 522 a 543)

```javascript
// ▶ Si tenía una solicitud rechazada, la borra para poder mandar una nueva
await supabase.from('seller_requests').delete().eq('user_id', user.id).eq('status', 'rejected');

const { error } = await supabase
  .from('seller_requests')
  // ▶ Guarda la solicitud (nombre, CUIT, rubros, dirección, teléfono); queda "pendiente" hasta que un administrador la apruebe
  .insert({
    user_id: user.id, 
    shop_name: nameInput,
    cuit: cuitInput,
    category_slugs: categoriesInput,
    address: addressInput,
    phone: phoneInput
  });

if (error) {
  console.error("Error al solicitar ser vendedor:", error);
  showToast("Hubo un error al procesar tu solicitud.", "error");
} else {
  showToast("¡Solicitud enviada exitosamente! Revisaremos tus datos.", "success");
  // ▶ Vuelve a mirar el estado: la persona ve el cartel de "solicitud en revisión"
  await checkSellerState();
}

if (submitBtn) setLoading(submitBtn, false, "Registrarme");
```

**En palabras simples:** La aprobación del administrador está en el módulo 21. Una cuenta puede ser comercio o profesional, no las dos cosas.

#### 7.3 Contratar

**Archivo:** `js/contratar.js` (líneas 492 a 519)

```javascript
async function loadProfessionals() {
  const container = document.getElementById('ct-content');
  container.textContent = '';
  // ▶ Mientras carga, muestra "Cargando el directorio"
  container.appendChild(buildLoadingBlock('Cargando el directorio'));

  const [{ data: { session } }, { data, error }] = await Promise.all([
    supabase.auth.getSession(),
    // ▶ Una sola consulta trae a todos los profesionales con reseñas, servicios, horarios, zonas y fotos
    supabase.rpc('get_professionals_directory'),
  ]);
  currentUserId = session?.user?.id || null;

  if (error) {
    console.error('Error al cargar los profesionales:', error);
    container.appendChild(buildEmpty('No pudimos cargar el directorio. Probá de nuevo en un rato.'));
    return;
  }

  const professionals = data || [];

  if (professionals.length === 0) {
// … (el bloque sigue en el archivo)
```

**Archivo:** `js/contratar.js` (líneas 99 a 108)

```javascript
function registrarMetrica(professionalId, evento) {
  supabase
    // ▶ Suma una visita, un llamado o un WhatsApp a las estadísticas del profesional
    .rpc('increment_professional_metric', {
      p_professional_id: professionalId,
      p_event_type: evento,
    })
    .then(({ error }) => {
      if (error) console.warn('No se pudo registrar la métrica:', error.message);
    });
}
```

**En palabras simples:** Las estadísticas del panel de profesional (módulo 19) salen de estos registros.

#### 7.4 Emergencias

**Archivo:** `js/servicios.js` (líneas 102 a 134)

```javascript
async function loadServicios() {
  const container = document.getElementById('sv-content');
  container.textContent = '';
  container.appendChild(buildLoadingBlock('Cargando los números'));

  const { data, error } = await supabase
    // ▶ Los números están en la tabla emergency_contacts; el administrador los carga desde su panel
    .from('emergency_contacts')
    .select('id, category, name, phone, notes, display_order')
    // ▶ Solo los que están activos
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  container.textContent = '';

  if (error) {
    console.error('Error al cargar los servicios:', error);
    container.appendChild(buildEmpty('No pudimos cargar los números. Probá de nuevo en un rato.'));
    return;
  }

  const contacts = data || [];

  if (contacts.length === 0) {
    container.appendChild(buildEmpty('Todavía no cargamos números de servicios. Vas a encontrarlos acá pronto.'));
    return;
  }

  // ▶ Los agrupa en tarjetas: Emergencias y Veterinarias
  CATEGORIES.forEach((category) => {
// … (el bloque sigue en el archivo)
```

### 8. Banner principal

Archivo: `js/home.js` (todo el inicio). El banner es una tira de imágenes que se desliza con el dedo en el celular; las flechas y los puntitos mueven esa misma tira.

#### 8.1 Flechas

**Archivo:** `js/home.js` (líneas 563 a 596)

```javascript
function initHeroCarousel() {
  const track = document.getElementById('hero-track');
  const dotsWrap = document.getElementById('hero-dots');
  const prevBtn = document.getElementById('hero-prev');
  const nextBtn = document.getElementById('hero-next');
  if (!track) return;

  const slides = Array.from(track.querySelectorAll('.hero__slide'));
  // ▶ Con una sola imagen no muestra flechas ni puntitos
  if (slides.length <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (dotsWrap) dotsWrap.style.display = 'none';
    return;
  }

  const currentIndex = () => Math.round(track.scrollLeft / track.clientWidth);

  // ▶ Ir a una imagen: después de la última vuelve a la primera
  const goTo = (index) => {
    const target = (index + slides.length) % slides.length;
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero__dot';
    dot.setAttribute('aria-label', `Ir a la promoción ${i + 1}`);
    // ▶ Cada puntito lleva a su imagen
    dot.addEventListener('click', () => goTo(i));
    dotsWrap?.appendChild(dot);
    return dot;
  });
// … (el bloque sigue en el archivo)
```

#### 8.2 Farmacias de turno

**Archivo:** `js/farmacias.js` (líneas 62 a 73)

```javascript
function shiftWindow(shift) {
  const start = combine(shift.shift_date, shift.opens_at);
  let end = combine(shift.shift_date, shift.closes_at);
  // ▶ Si el turno "cierra antes de abrir" (de 8:00 a 8:00), cierra al día siguiente
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

function isActiveNow(shift, now = new Date()) {
  const { start, end } = shiftWindow(shift);
  // ▶ ¿La hora actual está dentro del turno?
  return now >= start && now < end;
}
```

**En palabras simples:** Los turnos se cargan en la tabla `pharmacy_shifts` desde el panel de administrador. Como cada turno dura de 8:00 a 8:00, a las 3 de la mañana del domingo la farmacia de turno es la del sábado: por eso hace falta esta cuenta.

### 9. Comercios destacados

**Archivo:** `js/home.js` (líneas 747 a 772)

```javascript
async function loadStores() {
  const carousel = document.getElementById('stores-carousel');
  if (!carousel) return;

  try {
    const [storesRes, boosts] = await Promise.all([
      // ▶ Solo comercios aprobados
      supabase.from('stores').select('id, name, logo_url').eq('status', 'approved').limit(15),
      // ▶ Y cuáles contrataron un combo de "Impulsá tus ventas"
      loadActiveBoosts(),
    ]);
    if (storesRes.error) throw storesRes.error;

    const boostedIds = new Set(boosts.map((b) => b.store_id));
    let stores = storesRes.data || [];
    const missing = [...boostedIds].filter((id) => !stores.some((s) => s.id === id));
    if (missing.length) {
      const extra = await supabase.from('stores').select('id, name, logo_url').eq('status', 'approved').in('id', missing);
      if (!extra.error && extra.data) stores = [...stores, ...extra.data];
    }
    // ▶ Los que pagaron el combo van primero
    stores = [...stores].sort((a, b) => Number(boostedIds.has(b.id)) - Number(boostedIds.has(a.id)));

    carousel.innerHTML = '';

// … (el bloque sigue en el archivo)
```

**En palabras simples:** Cada logo es un link a la página del comercio (`comercio.html?id=…`). Las flechas mueven la fila de logos.

### 10. Banner promociones

Archivos: `js/home-promos-utils.js` (las reglas) y `js/home.js` (el dibujo). Cada espacio de banner es una fila de la tabla `home_promos`: el administrador elige qué comercio lo usa y el comercio carga la imagen.

**Archivo:** `js/home-promos-utils.js` (líneas 59 a 67)

```javascript
export function isPromoLive(promo) {
  return Boolean(
    promo
    // ▶ El administrador la tiene encendida
    && promo.is_active
    && promo.store_id
    // ▶ El comercio ya cargó la imagen
    && promo.image_url
    // ▶ Y el comercio está aprobado
    && promo.stores?.status === 'approved'
  );
}
```

**Archivo:** `js/home-promos-utils.js` (líneas 37 a 46)

```javascript
export function groupLivePromosBySlot(rows) {
  const bySlot = new Map();
  // ▶ Se quedan solo las promos listas para mostrarse
  (rows || []).filter(isPromoLive)
    // ▶ Cada espacio puede tener hasta 3 publicidades, que pasan solas
    .sort((a, b) => promoPosition(a) - promoPosition(b))
    .forEach((promo) => {
      if (!bySlot.has(promo.slot)) bySlot.set(promo.slot, []);
      bySlot.get(promo.slot).push(promo);
    });
  return bySlot;
}
```

**Archivo:** `js/home-promos-utils.js` (líneas 74 a 77)

```javascript
export function promoHref(promo) {
  if (!promo?.store_id) return null;
  // ▶ Tocar la imagen ampliada lleva a la página del comercio
  return `./comercio.html?id=${encodeURIComponent(promo.store_id)}`;
}
```

**En palabras simples:** Si un espacio no tiene una promo lista, se muestra el banner fijo de siempre.

### 11. Productos recomendados

**Archivo:** `js/interests.js` (líneas 16 a 23)

```javascript
export function rememberViewedProduct(productId) {
  if (!productId) return;
  try {
    // ▶ Anota qué producto se miró y cuándo (en este navegador)
    localStorage.setItem(VIEWED_KEY, JSON.stringify(addView(loadViewedProducts(), productId, Date.now())));
  } catch {
  }
}
```

**Archivo:** `js/interests-utils.js` (líneas 48 a 60)

```javascript
export function weightCategories(views, categoryByProduct, now) {
  const weights = new Map();
  for (const v of normalizeViews(views)) {
    const cat = categoryByProduct[v.id];
    if (!cat) continue;
    const days = Math.max(0, (now - v.at) / DAY_MS);
    // ▶ Lo que se miró hace 14 días vale la mitad que lo de hoy
    weights.set(cat, (weights.get(cat) || 0) + Math.pow(0.5, days / HALF_LIFE_DAYS));
  }
  return [...weights.entries()]
    .map(([categoryId, weight]) => ({ categoryId, weight }))
    .sort((a, b) => b.weight - a.weight)
    // ▶ Se quedan las categorías más miradas (hasta 5)
    .slice(0, MAX_CATEGORIES);
}
```

**Archivo:** `js/home.js` (líneas 348 a 369)

```javascript
async function loadInterestProducts(limit) {
  try {
    const views = loadViewedProducts();
    if (!views.length) return [];
    const ids = views.map((v) => v.id);

    const { data: viewedRows, error } = await supabase.from('products').select('id, category_id').in('id', ids);
    if (error || !viewedRows?.length) return [];
    const categoryByProduct = Object.fromEntries(viewedRows.filter((r) => r.category_id).map((r) => [r.id, r.category_id]));

    // ▶ Calcula cuánto interesa cada categoría
    const weighted = weightCategories(views, categoryByProduct, Date.now());
    if (!weighted.length) return [];

    const results = await Promise.all(weighted.map((w) =>
      supabase.from('products').select(PRODUCT_SELECT)
        .eq('is_active', true).gt('stock', 0)
        .eq('category_id', w.categoryId)
        // ▶ Sin repetir lo que ya miró
        .not('id', 'in', `(${ids.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(limit * 2)
    ));
    const byCategory = {};
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Si alguien mira varios productos de ropa, en el inicio le aparecen más productos de ropa. Se guarda solo en ese navegador: sin historial, el inicio muestra la lista general.

### 12. Comercios cerca tuyo

**Archivo:** `js/home.js` (líneas 717 a 737)

```javascript
navigator.geolocation.getCurrentPosition(
  (position) => {
    // ▶ Guarda la ubicación para no volver a pedirla en esta visita
    saveNearbyLocation(position.coords.latitude, position.coords.longitude);
    // ▶ Muestra el mapa centrado en esa ubicación
    renderMap(position.coords.latitude, position.coords.longitude);
  },
  (error) => {
    console.error('[nearby-map] geolocation error', { code: error.code, message: error.message });
    // ▶ Si la persona no dio permiso, se le explica cómo habilitarlo
    if (error.code === error.PERMISSION_DENIED) {
      renderError('No nos diste permiso para usar tu ubicación. Podés habilitarlo desde la configuración del navegador.');
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      renderError('No pudimos determinar tu ubicación (falla del sistema, no del sitio). Probá de nuevo en un rato.');
    } else if (error.code === error.TIMEOUT) {
      renderError('Tardó demasiado en responder. Probá de nuevo.');
    } else {
      renderError('No pudimos obtener tu ubicación. Probá de nuevo.');
    }
  },
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
);
```

**Archivo:** `js/home.js` (líneas 680 a 701)

```javascript
const renderMap = (lat, lng) => {
  panel.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.className = 'nearby-map__iframe';
  // ▶ Un mapa de Google Maps metido en la página
  iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
  iframe.loading = 'lazy';
  iframe.setAttribute('title', 'Mapa centrado en tu ubicación');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  panel.appendChild(iframe);

  const openLink = document.createElement('a');
  openLink.className = 'nearby-map__open-link';
  // ▶ El link "Ver mi ubicación en Google Maps"
  openLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  openLink.target = '_blank';
  openLink.rel = 'noopener noreferrer';
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Al tocar "Usar mi ubicación", el navegador pide permiso. La ubicación no se manda a la base de datos: solo se usa para centrar el mapa.

### 13. Esenciales para tu casa

**Archivo:** `js/home.js` (líneas 532 a 557)

```javascript
async function loadEssentials() {
  const grid = document.getElementById('essentials-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`${PRODUCT_SELECT}, categories!inner(slug)`)
      .eq('is_active', true)
      // ▶ Son los productos de Almacén, Limpieza y Lácteos
      .in('categories.slug', ['almacen', 'limpieza', 'lacteos'])
      .limit(24);

    if (error) throw error;

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Aún no hay esenciales cargados.', 'fa-house');
      return;
    }

    // ▶ Se muestran de a 4, con flechitas para pasar
    essentialsPager.setItems(products);

  } catch (err) {
    console.error('Error fetching essentials:', err);
    renderErrorState(grid, 'No se pudieron cargar los esenciales.', loadEssentials);
  }
}
```

### 14. Ofertas

**Archivo:** `js/home.js` (líneas 498 a 527)

```javascript
async function loadOffers() {
  const grid = document.getElementById('offers-grid');
  if (!grid) return;

  try {
    const nowIso = new Date().toISOString();
    const { data: products, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      // ▶ Productos con "precio anterior" cargado
      .not('compare_at_price', 'is', null)
      // ▶ Y cuya oferta no venció
      .or(`offer_expires_at.is.null,offer_expires_at.gt.${nowIso}`)
      .limit(24);

    if (error) throw error;

    // ▶ Solo si el precio anterior es mayor al actual
    const offers = (products || []).filter((p) => p.compare_at_price > p.price);

    if (offers.length === 0) {
      renderEmptyState(grid, 'No hay ofertas activas por ahora.', 'fa-tags');
      return;
    }

    offersPager.setItems(offers);

  } catch (err) {
    console.error('Error fetching offers:', err);
    renderErrorState(grid, 'No se pudieron cargar las ofertas.', loadOffers);
  }
}
```

**En palabras simples:** Una oferta es un producto con "precio anterior" (tachado) más alto que el actual. Cuando pasa la fecha de vencimiento que cargó el comercio, deja de aparecer acá sola.

### 15. Banners inferiores

**Archivo:** `js/home-promos-utils.js` (líneas 11 a 18)

```javascript
export const HOME_PROMO_SLOTS = [
  // ▶ Los tres espacios de arriba (a, b y c)
  { slot: 'mosaic_a', label: 'Mosaico de arriba · grande (izquierda)', ratio: '16:9 (ej. 1600x900)' },
  { slot: 'mosaic_b', label: 'Mosaico de arriba · chico (arriba a la derecha)', ratio: '16:9 (ej. 900x507)' },
  { slot: 'mosaic_c', label: 'Mosaico de arriba · chico (abajo a la derecha)', ratio: '16:9 (ej. 900x507)' },
  // ▶ Los tres de abajo (d, e y f), con las medidas recomendadas de la imagen
  { slot: 'mosaic_d', label: 'Mosaico de abajo · franja ancha', ratio: '5:1 (ej. 1600x320)' },
  { slot: 'mosaic_e', label: 'Mosaico de abajo · izquierda', ratio: '4:1 (ej. 1200x300)' },
  { slot: 'mosaic_f', label: 'Mosaico de abajo · derecha', ratio: '4:1 (ej. 1200x300)' },
];
```

**En palabras simples:** Funcionan igual que los banners de promociones (módulo 10): cada espacio es de un comercio y tocarlo lleva a su página.

### 16. Footer

#### 16.1 Botón de subir

**Archivo:** `js/scroll-top-btn.js` (líneas 13 a 20)

```javascript
if (btn) {
  // ▶ Aparece cuando se bajó más de 400 píxeles
  const toggle = () => btn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
  btn.addEventListener('click', () => {
    // ▶ Al tocarlo sube hasta arriba (sin animación si se pidió "Reducir animaciones")
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}
```

#### 16.2 Términos y condiciones, Comprá, Vendé, Ayuda y Redes sociales

Son links comunes (etiquetas `<a href="…">` en el HTML del footer) a `terminos.html`, `privacidad.html`, `info.html`, la búsqueda por categoría y las redes. No tienen código JavaScript.

#### 16.3 Preguntas frecuentes (FAQ)

**Archivo:** `pages/info.html` (líneas 219 a 230)

```html
<details class="faq-item">
  <!-- ▶ La pregunta; al tocarla se despliega la respuesta (el "+"), sin necesidad de JavaScript -->
  <summary>¿Cómo compro en Baradero Local?</summary>
  <div class="faq-answer">
    <ol>
      <li>Buscá el producto que necesitás y, si tiene opciones (color, sabor, talle), elegí la tuya.</li>
      <li>Agregalo al carrito. Podés sumar productos de varios comercios.</li>
      <li>En el carrito elegí si lo <strong>retirás en el local</strong> o lo querés <strong>con envío a domicilio</strong>, y cómo vas a pagar.</li>
      <li>Tocá <strong>Iniciar pago</strong> y seguí los pasos.</li>
    </ol>
    <p>Si tu carrito tiene productos de más de un comercio, la compra se divide en un pedido por comercio: cada uno prepara y entrega lo suyo.</p>
  </div>
</details>
```

**En palabras simples:** Cada pregunta es un bloque `<details>`. Los 5 botones de arriba son links a cada grupo; `js/info-faq.js` hace que la página baje suave y marque el grupo en azul por 3 segundos.

### 17. Paneles

El botón "Vender" del inicio pasa a decir "Panel" para quien ya tiene uno. Saber qué panel tiene cada cuenta lo resuelve `getPanelAccess` en `js/auth-utils.js`.

**Archivo:** `js/auth-utils.js` (líneas 270 a 301)

```javascript
async function computePanelAccess(user) {

  const role = user.app_metadata?.role;
  // ▶ Administrador o moderador: tiene el panel de administración
  const isAdmin = role === "admin" || role === "moderador";

  // ▶ El rol viene en la sesión: vendedor y repartidor se saben al instante
  if (role === "vendedor") return { isAdmin: false, seller: "vendedor" };
  if (role === "repartidor") return { isAdmin: false, seller: "repartidor" };

  // ▶ Si no, se fija si es dueño de un comercio, empleado de uno o profesional publicado
  const [storeRes, staffRes, profRes] = await Promise.all([
    supabase.from("stores").select("id").eq("owner_id", user.id).limit(1),
    supabase.from("store_staff").select("store_id").eq("user_id", user.id).limit(1),
    supabase.from("professionals").select("id").eq("owner_id", user.id).limit(1),
  ]);

  let seller = null;
  // ▶ Con comercio (propio o como empleado): panel de comerciante; si no, de profesional
  if (storeRes.data?.length || staffRes.data?.length) seller = "vendedor";
  else if (profRes.data?.length) seller = "profesional";

  const failed = !!(storeRes.error || staffRes.error || profRes.error);
  return { isAdmin, seller, failed };
}
```

**Archivo:** `js/home.js` (líneas 137 a 160)

```javascript
function renderPanelAction({ isAdmin, seller, role }) {
  const link = document.getElementById('home-panel-action');
  if (!link) return;
  link.setAttribute('data-ready', '1');

  const adminLabel = role === 'moderador' ? 'Panel de moderación' : 'Panel de administrador';

  if (!isAdmin || !seller) {
    // ▶ Con un solo panel, "Vender" pasa a decir "Panel" y lleva directo
    link.textContent = 'Panel';
    link.href = isAdmin ? './admin.html' : `./${SELLER_PANEL_PAGES[seller]}`;
    link.classList.remove('home-action--menu');
    link.querySelector('i')?.remove();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'home-action-menu';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'home-action home-action--menu';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  // ▶ Con dos paneles (por ejemplo, comerciante y administrador) se arma un menú para elegir
  btn.append('Panel');
// … (el bloque sigue en el archivo)
```

**En palabras simples:** La respuesta se guarda en el navegador para que la próxima vez el botón aparezca con el texto correcto desde el primer momento.

### 18. Panel de comerciante

Archivos: `pages/vender.html` y `js/vender.js` (el archivo más grande del proyecto), con `js/vender-shell.js` (el menú lateral) y `js/comercio.js` (la página pública del comercio).

#### 18.1 Vista previa de tu local (colores del encabezado)

**Archivo:** `js/comercio.js` (líneas 318 a 334)

```javascript
bgInput.addEventListener('change', async () => {
  // ▶ Guarda el color de fondo elegido en la ficha del comercio
  const ok = await persist({ header_bg_color: bgInput.value });
  if (ok) showToast('Color guardado', 'success');
});
fgInput.addEventListener('change', async () => {
  // ▶ Guarda el color de las letras
  const ok = await persist({ header_text_color: fgInput.value });
  if (ok) showToast('Color guardado', 'success');
});
resetBtn.addEventListener('click', async () => {
  // ▶ "Restaurar" vuelve a los colores de siempre
  const ok = await persist({ header_bg_color: null, header_text_color: null });
  if (ok) {
    applyHeaderColors(header, null, null);
    bgInput.value = '#f5f7fa';
    fgInput.value = '#1a202c';
    showToast('Color por defecto restaurado', 'success');
  }
});
```

**En palabras simples:** El lápiz de color solo aparece para el dueño. Los colores se guardan en la tabla `stores` y los ven todos. En modo oscuro, si el color elegido no se lee bien, la página lo ajusta sola.

#### 18.2 Perfil de mi comercio (transferencia bancaria obligatoria)

**Archivo:** `db/schema/133_transfer_obligatoria_y_sin_efectivo_en_envio.sql` (líneas 49 a 76)

```sql
create or replace function public.require_store_transfer_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text;
  v_cbu text;
begin
  -- ▶ El administrador no tiene esta restricción
  if (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.store_id is not distinct from old.store_id then
    return new;
  end if;

  -- ▶ Lee el alias y el CBU/CVU del comercio
  select transfer_alias, transfer_cbu into v_alias, v_cbu from public.stores where id = new.store_id;

  -- ▶ Si no tiene ninguno de los dos, no deja publicar el producto y explica por qué
  if coalesce(btrim(v_alias), '') = '' and coalesce(btrim(v_cbu), '') = '' then
    raise exception 'Para publicar productos, el comercio tiene que cargar un medio de transferencia: alias o CBU/CVU (Perfil de mi comercio → Transferencia bancaria).'
      using errcode = 'P0001', hint = 'missing_transfer_alias';
  end if;

  return new;
end;
$$;
```

**En palabras simples:** Es un trigger que corre cada vez que se publica un producto. Así nadie le compra por transferencia a un comercio que no tiene dónde recibirla. Mientras falte, el panel muestra un cartel rojo y llega un recordatorio cada 6 horas.

#### 18.3 Publicaciones (publicar un producto)

**Archivo:** `js/vender.js` (líneas 5806 a 5837)

```javascript
const productData = {
  // ▶ Junta los datos del formulario: nombre, precio, stock, oferta y descripción
  title: titleValue,
  price: priceValue,
  stock: parseInt(stockValue),
  compare_at_price: comparePriceValue || null,
  offer_expires_at: comparePriceValue && offerExpiresValue ? offerExpiresValue : null,
  category_id: null,
  description: document.getElementById('prod-desc').value.trim(),
};

const slug = getProductCategorySlug();
// ▶ Busca el código de la categoría elegida
const { data: catData } = await supabase.from('categories').select('id').eq('slug', slug).single();
if (catData) productData.category_id = catData.id;

let error;
let savedProductId = editingProductId;
// ▶ Si se está editando, actualiza el producto
if (isEditing) {
  ({ error } = await supabase.from('products').update(productData).eq('id', editingProductId));
} else {
  productData.seller_id = user.id;
  productData.store_id = currentStoreId;
  // ▶ Si es nuevo, lo crea a nombre del comercio
  const { data: inserted, error: insertError } = await supabase.from('products').insert([productData]).select('id').single();
  error = insertError;
  savedProductId = inserted?.id;
}

// ▶ Si falta el alias o CBU, la base lo rechaza (ver 18.2) y el panel lo explica
if (error && error.hint === 'missing_transfer_alias') {
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Las fotos se suben después, a la carpeta del producto en el almacenamiento de Supabase. Las opciones (colores, talles, sabores) se guardan en las tablas `product_options` y `product_option_values`.

#### 18.4 Ventas: pedidos en vivo

**Archivo:** `js/vender.js` (líneas 1260 a 1281)

```javascript
async function loadOrders(ids = null) {
  if (!currentStoreId) return false;

  if (!ordRpcMissing) {
    // ▶ Una sola consulta trae los pedidos con sus productos, comprobantes, entrega y comprador
    const { data, error } = await supabase.rpc('get_store_orders', {
      p_store_id: currentStoreId,
      // ▶ Si se le pasan números de pedido, trae solo esos (los que cambiaron)
      p_order_ids: ids,
      p_limit: ORDERS_LIMIT,
    });
    if (!error) {
      const fresh = (data || []).map(absorbOrderRow);
      if (!ids) {
        ordCache = fresh;
      } else {
        const byId = new Map(fresh.map((o) => [o.id, o]));
        const kept = ordCache.filter((o) => byId.has(o.id) || !ids.includes(o.id)).map((o) => byId.get(o.id) || o);
        const added = fresh.filter((o) => !ordCache.some((c) => c.id === o.id));
        // ▶ Mezcla lo nuevo con lo que ya estaba en pantalla, sin redibujar todo
        ordCache = [...kept, ...added].sort(byNewest).slice(0, ORDERS_LIMIT);
      }
      return true;
    }
    if (error.code === 'PGRST202' || error.code === '42883' || /get_store_orders/.test(error.message || '')) {
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Con el tiempo real (módulo 22.1), cuando entra un pedido nuevo aparece solo en la lista, resaltado, y suena un aviso. Junto al título se ve "En vivo" mientras la conexión está activa.

**Archivo:** `js/vender.js` (líneas 2012 a 2024)

```javascript
async function advanceOrder(order, next, btn) {
  if (next.status === 'completed') {
    await deliverOrder(order);
    return;
  }
  const question = next.status === 'ready_for_pickup'
    ? `¿El pedido ${orderLabel(order)} ya está listo para retirar? Le avisamos al comprador.`
    : `¿Ya salió el pedido ${orderLabel(order)}? Le avisamos al comprador que está en camino.`;
  // ▶ Pregunta antes de avisarle al comprador
  const ok = await confirmDialog(question, { confirmText: next.label });
  if (!ok) return;
  // ▶ La base cambia el estado ("listo para retirar" o "en camino") y le manda el aviso al comprador
  await runOrderRpc('advance_order_status', { p_order_id: order.id, p_status: next.status },
    next.status === 'ready_for_pickup' ? 'Listo. Le avisamos al comprador que puede pasar a retirarlo.' : 'Listo. Le avisamos al comprador que va en camino.', btn);
}
```

**En palabras simples:** El estado de un pedido no se puede cambiar a mano desde la página: solo con estas funciones de la base, que controlan que el paso tenga sentido.

#### 18.5 Mis cupones

**Archivo:** `js/vender.js` (líneas 3391 a 3424)

```javascript
function setupMyCouponForm() {
  const form = document.getElementById('my-coupon-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // ▶ El código se guarda en mayúsculas
    const code = document.getElementById('my-coupon-code').value.trim().toUpperCase();
    const discountNum = parseInt(document.getElementById('my-coupon-discount').value, 10);
    const expiresAt = document.getElementById('my-coupon-expires').value;

    // ▶ El descuento tiene que ser entre 1% y 100%
    if (!code || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
      showToast('Código y descuento (1-100) son obligatorios.', 'error');
      return;
    }

    // ▶ Crea el cupón para este comercio
    const { error } = await supabase.from('coupons').insert({
      code,
      discount_percentage: discountNum,
      expires_at: expiresAt || null,
      is_active: true,
      store_id: currentStoreId,
    });

    if (error) {
      showToast('No se pudo crear el cupón (¿el código ya está en uso?).', 'error');
      console.error(error);
      return;
    }

    showToast('Cupón creado — ya se puede usar en el checkout.', 'success');
    form.reset();
    renderMyCoupons();
  });
}
```

#### 18.6 Empleados

**Archivo:** `js/vender.js` (líneas 3552 a 3577)

```javascript
function setupStoreStaffForm() {
  const form = document.getElementById('store-staff-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('store-staff-email');
    const email = emailInput.value.trim();
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    setLoading(submitBtn, true, 'Agregar');

    // ▶ La base busca la cuenta con ese email y la suma como empleada (solo si quien lo pide es el dueño)
    const { error } = await supabase.rpc('add_store_staff', { p_store_id: currentStoreId, p_email: email });

    if (error) {
      showToast(friendlyError(error, 'No se pudo agregar al empleado.'), 'error');
      console.error(error);
    } else {
      showToast('Empleado agregado — ya puede entrar a este panel.', 'success');
      form.reset();
      renderStoreStaff();
    }
    setLoading(submitBtn, false, 'Agregar');
  });
}
```

**En palabras simples:** El empleado entra al mismo panel, pero solo ve las secciones que el dueño le habilite (permisos).

#### 18.7 Impulsá tus ventas

**Archivo:** `js/vender.js` (líneas 5563 a 5588)

```javascript
async function chooseBoostPlan(plan) {
  if (boostBusy) return;
  if (!currentStoreId) return;
  const renewing = describeBoostState(boostPurchases).active?.planId === plan.id;
  // ▶ Muestra el precio y la duración antes de pagar
  const ok = await confirmDialog(
    `Vas a pagar ${formatPrice(plan.price)} con Mercado Pago por el ${plan.name}. ` +
    (renewing
      ? `Se suman ${plan.duration_days} días a continuación de los que ya tenés.`
      : `Empieza cuando se acredite el pago y dura ${plan.duration_days} días.`),
    { title: renewing ? `Renovar el ${plan.name}` : `Contratar el ${plan.name}`, confirmText: 'Ir a pagar' },
  );
  if (!ok) return;

  boostBusy = true;
  document.querySelectorAll('#boost-plans .bp-card__btn').forEach((b) => { b.disabled = true; });
  try {
    // ▶ Una función en la nube arma el cobro en Mercado Pago
    const { data, error } = await supabase.functions.invoke('mp-create-boost-preference', {
      body: { store_id: currentStoreId, plan_id: plan.id },
    });
    const url = data?.init_point || data?.sandbox_init_point;
    if (error || !url) {
      showToast(await friendlyFunctionError(error, data, 'No se pudo iniciar el pago. Probá de nuevo.'), 'error');
      return;
    }
    // ▶ Lleva a la página de pago de Mercado Pago
    window.location.href = url;
  } catch (err) {
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Los precios de los combos están en la tabla `boost_plans`. Cuando Mercado Pago confirma el pago, el combo se activa solo y el comercio aparece primero en "Comercios destacados".

### 19. Panel de profesional

Archivos: `pages/profesional.html` y `js/profesional.js`, con un archivo por sección: `profesional-servicios.js`, `profesional-disponibilidad.js` (horarios y zonas), `profesional-galeria.js` (fotos), `profesional-consultas.js`, `profesional-resenas.js` y `profesional-metricas.js` (estadísticas).

#### 19.1 Activar/Pausar publicación

**Archivo:** `js/profesional.js` (líneas 531 a 554)

```javascript
async function alternarPausa(btn) {
  const nuevoEstado = !estado.prof.is_active;
  // ▶ Antes de pausar, avisa que deja de aparecer en Contratar
  if (!nuevoEstado && !(await confirmDialog('Si pausás tu publicación dejás de aparecer en Contratar hasta que la reactives.', { confirmText: 'Sí, pausar', danger: true }))) {
    return;
  }

  btn.disabled = true;
  const { error } = await supabase
    .from('professionals')
    // ▶ Cambia el estado de la publicación en la tabla professionals
    .update({ is_active: nuevoEstado })
    .eq('id', estado.prof.id);
  btn.disabled = false;

  if (error) {
    console.error('Error al pausar/reactivar:', error);
    showToast('No pudimos cambiar el estado de tu publicación.');
    return;
  }

  estado.prof.is_active = nuevoEstado;
  renderBotonPausa();
  renderResumen();
  showToast(nuevoEstado ? 'Tu publicación está activa de nuevo.' : 'Tu publicación quedó pausada.', 'success');
}
```

#### 19.2 Horarios de atención

**Archivo:** `js/professional-hours-utils.js` (líneas 105 a 122)

```javascript
export function agruparDiasIguales(porDia) {
  const grupos = [];
  // ▶ Recorre la semana de lunes a domingo
  for (const dia of ORDEN_SEMANA) {
    const texto = formatearFranjas(porDia?.[dia]);
    if (!texto) continue;
    const ultimo = grupos[grupos.length - 1];
    const previo = ORDEN_SEMANA[ORDEN_SEMANA.indexOf(dia) - 1];
    // ▶ Si el día tiene el mismo horario que el anterior, lo suma al grupo ("Lun a Vie")
    if (ultimo && ultimo.texto === texto && ultimo.dias[ultimo.dias.length - 1] === previo) {
      ultimo.dias.push(dia);
    } else {
      grupos.push({ dias: [dia], etiqueta: '', texto });
    }
  }
  for (const g of grupos) g.etiqueta = etiquetaDias(g.dias);
  return grupos;
}
```

**En palabras simples:** Así la tarjeta de Contratar muestra "Lun a Vie 08:00 a 13:00" en vez de cinco líneas iguales. La base guarda una fila por día.

#### 19.3 Consultas

**Archivo:** `js/profesional-consultas.js` (líneas 187 a 205)

```javascript
async function cambiarEstado(consulta, nuevoEstado, btn) {
  btn.disabled = true;
  const { error } = await supabase
    // ▶ Las consultas que mandan los vecinos están en la tabla professional_inquiries
    .from('professional_inquiries')
    .update({ status: nuevoEstado })
    .eq('id', consulta.id);
  btn.disabled = false;

  if (error) {
    console.error('Error cambiando el estado de la consulta:', error);
    showToast('No pudimos actualizar la consulta.');
    return;
  }

  consulta.status = nuevoEstado;
  renderFiltros();
  render();
  ctx.refrescarResumen?.();
}
```

**En palabras simples:** Cada consulta tiene un estado (nueva, respondida, cerrada) que el profesional cambia con los botones de la tarjeta.

### 20. Panel del repartidor

Archivos: `pages/repartidor.html` y `js/repartidor.js`. El repartidor ve dos listas: "Mis entregas en curso" y "Pedidos disponibles". Cada entrega pasa por tres etapas: Tomado, En camino y Entregado.

#### 20.1 Actualizar el panel

**Archivo:** `js/repartidor.js` (líneas 445 a 464)

```javascript
async function loadPanel() {
  // ▶ Si ya se estaba cargando, no lo pide dos veces
  if (loading) { reloadAgain = true; return; }
  loading = true;
  try {
    // ▶ Una sola consulta trae "Mis entregas" y los pedidos disponibles
    const { data, error } = await supabase.rpc('get_courier_panel');
    if (error) {
      console.error('Error cargando el panel de repartidor:', error);
      showToast(friendlyError(error, 'No se pudo cargar el panel.'), 'error');
      return;
    }
    estado.mine = data?.mine || [];
    estado.queue = data?.queue || [];
    estado.activeCount = data?.active_count ?? 0;
    estado.loaded = true;
    renderAll();
  } finally {
    loading = false;
    if (reloadAgain) { reloadAgain = false; loadPanel(); }
  }
}
```

#### 20.2 Pedido tomado

**Archivo:** `js/repartidor.js` (líneas 147 a 162)

```javascript
async function takeOrder(order, card, btn) {
  btn.disabled = true;
  // ▶ Pide tomar el pedido; la base controla que nadie más lo haya tomado
  const { error } = await supabase.rpc('claim_delivery', { p_order_id: order.order_id });
  if (error) {
    showToast(friendlyError(error, 'No se pudo tomar el pedido.'), 'error');
    // ▶ Si otro repartidor lo tomó antes, la tarjeta desaparece
    card.remove();
    estado.queue = estado.queue.filter((q) => q.order_id !== order.order_id);
    renderQueue();
    loadPanel();
    return;
  }
  showToast('Pedido tomado. Ya está en "Mis entregas en curso".', 'success');
  loadPanel();
}
```

**Archivo:** `db/schema/139_courier_flow.sql` (líneas 333 a 376)

```sql
create or replace function public.claim_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_delivery_id uuid;
  v_active integer;
begin
  -- ▶ Solo un repartidor puede tomar pedidos
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'repartidor' then
    raise exception 'Solo un repartidor puede tomar un pedido.';
  end if;

  -- ▶ Una cuenta suspendida no puede
  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  -- ▶ Pone en fila los pedidos del mismo repartidor para que no se pase del tope
  perform pg_advisory_xact_lock(hashtextextended('courier:' || v_uid::text, 0));

  select count(*) into v_active
  from public.deliveries
  where repartidor_id = v_uid and status in ('assigned', 'picked_up');

  -- ▶ Máximo 3 pedidos en curso a la vez
  if v_active >= 3 then
    raise exception 'Ya tenés 3 pedidos en curso. Entregá uno para tomar otro.';
  end if;

  select id, delivery_method, payment_status, status into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  -- ▶ Solo pedidos con envío, ya pagados y que el comercio no despachó
  if v_order.delivery_method != 'delivery' or v_order.payment_status != 'paid' or v_order.status != 'paid' then
    raise exception 'Este pedido no está disponible para repartir.';
-- … (el bloque sigue en el archivo)
```

**En palabras simples:** Si dos repartidores tocan "Tomar" al mismo tiempo, la base deja que lo tome uno solo. El mensaje "Ya tenés 3 pedidos en curso" no es un error: es el tope.

#### 20.3 En camino (retirar con foto)

**Archivo:** `js/repartidor.js` (líneas 196 a 211)

```javascript
async function markPickedUp(d, btn) {
  // ▶ Pide sacar una foto de los productos
  const file = await pickPhoto();
  if (!file) return;
  btn.disabled = true;
  btn.textContent = 'Subiendo foto…';
  try {
    // ▶ La sube a un lugar privado (la ven solo el comercio y el administrador)
    const path = await uploadEvidence(d.order_id, 'pickup', file);
    // ▶ Marca el pedido "En camino"
    const { ok } = await runRpc('courier_mark_picked_up',
      { p_delivery_id: d.delivery_id, p_photo_path: path },
      'No se pudo marcar el pedido en camino.');
    if (ok) showToast('Pedido en camino. ¡Buen viaje!', 'success');
  } catch (err) {
    showToast(friendlyError(err, 'No se pudo subir la foto. Probá de nuevo.'), 'error');
  }
  loadPanel();
}
```

**En palabras simples:** Antes, el comercio confirma en su panel que el repartidor retiró el pedido, escribiendo los últimos 4 números del pedido.

#### 20.4 Entregado al cliente (cargar código)

**Archivo:** `js/repartidor.js` (líneas 213 a 228)

```javascript
async function markDelivered(d, btn) {
  // ▶ Pide el código de 4 números que el comprador ve en "Mis compras"
  const res = await formDialog('Pedile al comprador el código de 4 números que tiene en "Mis compras".', {
    title: `Entregar el pedido ${orderLabel(d)}`,
    confirmText: 'Entregar',
    input: { label: 'Código de retiro', placeholder: '0000', inputMode: 'numeric', maxLength: 4, pattern: /^\d{4}$/ },
  });
  if (!res) return;
  btn.disabled = true;
  const { ok } = await runRpc('update_delivery_status',
    // ▶ Si el código es correcto, el pedido queda entregado
    { p_delivery_id: d.delivery_id, p_new_status: 'delivered', p_code: res.value },
    'No se pudo marcar el pedido como entregado.');
  if (ok) showToast('Pedido marcado como entregado.', 'success');
  else btn.disabled = false;
  loadPanel();
}
```

**En palabras simples:** Sin el código del comprador no se puede marcar como entregado: es la prueba de que el pedido llegó a la persona correcta.

### 21. Panel de administrador

No aparece en el Manual de usuario porque lo usa solo el equipo. Archivos: `pages/admin.html` y `js/admin.js`. Desde ahí se aprueban comercios y profesionales, se moderan reseñas y productos, se cargan farmacias y números de emergencia, se dan de alta repartidores y se responden los reclamos.

#### 21.1 Quién puede entrar

**Archivo:** `js/admin.js` (líneas 2373 a 2381)

```javascript
guardPage({
  requireAuth: true,
  // ▶ Solo cuentas con rol administrador o moderador
  requireRole: ['admin', 'moderador'],
  onReady: (user) => {
    applyRoleVisibility(user?.app_metadata?.role);
    upgradeDateInputs();
// … (el bloque sigue en el archivo)
```

**En palabras simples:** El rol de administrador se asigna a mano en Supabase (Authentication → Users). El moderador ve menos secciones: nada de dinero ni configuración.

#### 21.2 Aprobar un comercio

**Archivo:** `js/admin.js` (líneas 151 a 163)

```javascript
async function approveRequest(id) {
  try {
    // ▶ La base aprueba la solicitud: crea el comercio y le da a la cuenta el rol de vendedor
    const { error } = await supabase.rpc('approve_seller_request', { req_id: id });
    if (error) throw error;
    
    showToast('Comercio aprobado exitosamente', 'success');
    fetchRequests();
  } catch (err) {
    console.error('Error al aprobar:', err);
    showToast('Error al aprobar el comercio. Verifica que corriste los scripts SQL.', 'error');
  }
}
```

**En palabras simples:** La función de la base vuelve a comprobar que quien aprueba sea administrador. Ocultar el botón no alcanza: la seguridad tiene que estar en la base.

### 22. Piezas compartidas y seguridad

No son una pantalla, pero las usan todas. Tampoco están en el Manual de usuario.

#### 22.1 Tiempo real

**Archivo:** `js/realtime-utils.js` (líneas 89 a 110)

```javascript
export function subscribeToChanges(name, sources, onChange, { onResync, onStatus } = {}) {
  setupGlobals();

  // ▶ Abre un "canal" con la base de datos
  const channel = supabase.channel(`bl-${name}-${++channelSeq}-${Date.now().toString(36)}`);

  sources.forEach(({ table, event = '*', filter }) => {
    const spec = { event, schema: 'public', table };
    if (filter) spec.filter = filter;
    // ▶ Escucha los cambios de las tablas pedidas (por ejemplo, pedidos nuevos)
    channel.on('postgres_changes', spec, (payload) => {
      try {
        // ▶ Cada cambio se le pasa a la página para que se actualice sola
        onChange({
          table: payload.table,
          eventType: payload.eventType,
          new: payload.new || {},
          old: payload.old || {},
        });
      } catch (err) {
        console.error(`[tiempo real: ${name}]`, err);
      }
    });
// … (el bloque sigue en el archivo)
```

**En palabras simples:** Gracias a esto, un pedido nuevo, un aviso o una reseña aparecen sin recargar la página. Si la conexión se corta, la página vuelve a pedir los datos al reconectarse.

#### 22.2 Mensajes de error claros

**Archivo:** `js/friendly-error.js` (líneas 75 a 88)

```javascript
export function friendlyError(error, fallback = DEFAULT_MESSAGE) {
  const text = typeof error === 'string'
    ? error
    : String(error?.message ?? error?.error_description ?? (typeof error?.error === 'string' ? error.error : '') ?? '');
  const code = typeof error === 'object' && error ? String(error.code ?? error.status ?? '') : '';

  // ▶ Si el error ya es un mensaje en español escrito por el equipo, se muestra tal cual
  if (isHumanMessage(text)) return text.trim();
  // ▶ Si se cortó internet, avisa eso
  if (isFetchFailure(error, text)) return OFFLINE_MESSAGE;
  if (code === '429' || /too many requests|rate limit/i.test(text)) {
    return 'Demasiados intentos. Esperá unos minutos antes de intentar de nuevo.';
  }
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  // ▶ Si no, un mensaje general ("No se pudo…")
  return fallback;
}
```

#### 22.3 Carteles de confirmación

**Archivo:** `js/confirm-dialog.js` (líneas 103 a 122)

```javascript
export function confirmDialog(message, options = {}) {
  const {
    title = '',
    // ▶ Textos de los botones; cada uso puede cambiarlos ("Eliminar", "Sí, pausar"…)
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    danger = false,
  } = options;

  // ▶ Espera a que la persona toque un botón y devuelve sí o no
  return new Promise((resolve) => {
    const { overlay, card } = buildShell(message, title, resolve, false);
    const { actions, confirmBtn } = buildActions(
      { cancelText, confirmText, danger },
      () => closeDialog(resolve, false),
      () => closeDialog(resolve, true),
    );
    card.appendChild(actions);
    mountOverlay(overlay);
    confirmBtn.focus();
  });
}
```

**En palabras simples:** Es el cartel propio del sitio que aparece antes de borrar, vaciar o cancelar algo (reemplaza al cartel gris del navegador).

#### 22.4 Reglas de seguridad de la base de datos

**Archivo:** `db/schema/97_lock_down_request_status_on_insert.sql` (líneas 28 a 30)

```sql
create policy seller_requests_insert_own
  -- ▶ Regla para crear solicitudes de comercio, solo con sesión iniciada
  on public.seller_requests for insert to authenticated
  -- ▶ Solo se puede crear la propia, y siempre como "pendiente"
  with check (auth.uid() = user_id and status = 'pending');
```

**En palabras simples:** La clave que usa la página es pública: cualquiera podría usarla. Lo que protege los datos son estas reglas, que la base revisa en cada consulta. Por ejemplo, esta impide que alguien se mande su propia solicitud ya "aprobada".

#### 22.5 Protecciones del sitio publicado

**Archivo:** `vercel.json` (líneas 7 a 10)

```json
{ "key": "X-Content-Type-Options", "value": "nosniff" },
// ▶ Impide que otra página muestre Baradero Local adentro de un recuadro (protege contra engaños)
{ "key": "X-Frame-Options", "value": "DENY" },
{ "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
// ▶ Bloquea cámara y micrófono; la ubicación queda solo para el mapa del inicio
{ "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self)" }
```

## Resolución de problemas y FAQ

### 1. Mensajes de error habituales

Errores que pueden aparecer al trabajar con el código (los que ve el usuario están en el Manual de usuario).

| Mensaje | Causa | Solución |
| --- | --- | --- |
| "supabaseUrl is required" o la página no carga datos | Falta el archivo `.env` o está mal escrito. | Crear el `.env` como dice la Guía de inicio rápido, punto 2.2, y volver a correr `npm run dev`. |
| "new row violates row-level security policy" o "permission denied" | Una regla de seguridad de la base no deja hacer eso con esa cuenta. | Revisar que la cuenta tenga el rol correcto y la política de esa tabla (módulo 22.4). No se arregla desde la página. |
| "Refused to connect to …" en la consola del navegador | La línea de seguridad (CSP) de la página no permite conectarse a ese sitio. | Agregar el sitio en el `Content-Security-Policy` de todas las páginas. La prueba `js/csp.test.mjs` lo controla. |
| "Para publicar productos, el comercio tiene que cargar un medio de transferencia…" | El comercio no tiene alias ni CBU/CVU (módulo 18.2). | Cargar uno en Perfil de mi comercio → Transferencia bancaria. |
| "Ya tenés 3 pedidos en curso…" | Es el tope del repartidor, no un error. | Entregar un pedido para poder tomar otro. |
| "Edge Function returned a non-2xx status code" | Una función en la nube respondió con un error. | La página muestra el motivo con `friendlyFunctionError`; el detalle está en Supabase → Edge Functions → Logs. |
| `npm test` falla en Windows con un error de "for" o "sh" | El atajo de pruebas usa comandos de Linux/Mac. | Correr las pruebas desde Git Bash, o de a una: `node js/cart-totals.test.mjs`. |
| Falla la prueba `dark-css.test.mjs` | Se cambió un color en el CSS y no se regeneró el modo oscuro. | Correr `node scripts/gen-dark-css.mjs` y volver a probar. |
| El cambio no aparece en la página publicada | No se unió a `main`, el deploy de Vercel falló o el navegador tiene la versión vieja. | Revisar el deploy en Vercel y recargar la página (Ctrl + F5). |
| Conflictos en archivos de `dist/` al unir ramas | `dist/` se guarda en Git y sus nombres cambian en cada construcción. | Quedarse con cualquiera de las dos versiones y volver a correr `npm run build`. |
| El generador del manual dice "no se encontró …" | El código de ese bloque cambió y el texto de inicio ya no está. | Actualizar ese bloque en `scripts/manual-programador/contenido.mjs` y volver a generar. |

### 2. Dudas frecuentes

#### ¿Cómo agrego una categoría nueva?

Con una migración nueva en `db/schema/` que agregue la fila a la tabla `categories` (como `121_categoria_supermercado.sql`) y su ícono en `CATEGORY_ICONS` de `js/nav-utils.js` (módulo 2.1).

#### ¿Cómo agrego una página nueva?

Copiar el encabezado de una página parecida (con su línea de seguridad, el script del modo oscuro, `dark.css` y `theme.js`), anotarla en `vite.config.js` (Guía 3.1) y correr `npm test`, que controla que no falte nada.

#### ¿Dónde se cambia el precio de los combos de "Impulsá tus ventas"?

En la tabla `boost_plans` de la base. La pantalla y el cobro leen la misma fila, así que alcanza con cambiar el precio ahí.

#### ¿Dónde se cambia el costo de envío?

Cada comercio tiene el suyo en la tabla `stores` (columna `delivery_fee`, que arranca en $350). Hoy no hay un campo para cambiarlo en el panel: se cambia en la base de datos. El carrito usa el mismo $350 de respaldo (`DEFAULT_DELIVERY_FEE` en `js/cart-totals.js`) si todavía no lo leyó.

#### ¿Cómo se hace administrador a una cuenta?

En Supabase → Authentication → Users → la cuenta → `raw_app_meta_data`, poniendo `{"role": "admin"}`. No hay forma de hacerlo desde la página, a propósito.

#### ¿Cómo se aplica un cambio a la base de datos?

Se escribe un archivo nuevo en `db/schema/` con el número siguiente y se corre en Supabase (SQL Editor). Nunca se edita un archivo ya aplicado.

#### ¿Los precios tienen centavos?

No. Todo el sistema trabaja con pesos enteros.

#### ¿Cómo vuelvo a generar este manual?

```
node scripts/manual-programador/generar.mjs
```

Deja el manual actualizado en `docs/manual-programador/` (en Markdown para GitHub y en HTML para importar a Google Docs).

### 3. Pruebas automáticas

Las pruebas controlan solas que las funciones más delicadas den el resultado correcto (la cuenta del carrito, los horarios, los medios de pago…). Se corren todas juntas antes de publicar:

```
npm test
```

**Archivo:** `js/cart-totals.test.mjs` (líneas 28 a 31)

```javascript
check("un cupón de vendedor va solo a su tienda", () => {
  // ▶ Un cupón del 20% del comercio A vale 20% en A…
  assert.equal(discountPctForStore(20, "A", "A"), 20);
  // ▶ …y 0% en el comercio B
  assert.equal(discountPctForStore(20, "A", "B"), 0);
});
```

**En palabras simples:** Cada prueba dice qué debería pasar y lo comprueba. Si alguien cambia el código y rompe esa regla, la prueba avisa con "FALLA" antes de que llegue a la página publicada. La lista completa de pruebas está en el Anexo A.3.

## Canales de soporte y contacto

### 1. Contactos

| Para qué | Dónde |
| --- | --- |
| Consultas de usuarios y comercios | soporte@baraderolocal.com.ar (el correo que figura en el pie de la página → Ayuda) |
| Reclamos dentro de la página | Mi perfil → Soporte. Quedan en la tabla `support_tickets` y se responden desde el panel de administrador. |
| Tareas y errores del equipo de desarrollo | Jira, proyecto A113 (baraderolocal.atlassian.net) |
| Código y cambios | GitHub, repositorio `fac7n3/ProyectoPdisc` |

### 2. Horarios de atención

Responderemos a sus consultas entre las 08:00 y 14:00 hrs, hora Argentina, en un tiempo estimado de 1 hora luego de que nos haya mandado su email.

## Anexo A. Inventario de archivos del proyecto

Todos los archivos con código del proyecto y qué hace cada uno, para encontrar rápido dónde está cada cosa. Esta lista se arma sola al generar el manual. Junto con los bloques de los módulos, cubre el proyecto entero: cada archivo aparece acá aunque no tenga un bloque propio arriba.

### A.1 Páginas (carpeta pages/ y raíz)

| Archivo | Qué es |
| --- | --- |
| index.html | Entrada del sitio: manda directo al inicio. |
| pages/admin.html | Panel de administrador y de moderación. |
| pages/carrito.html | Mi carrito y el pago. |
| pages/comercio.html | Página pública de un comercio (con la vista previa para el dueño). |
| pages/comercios.html | Lista de todos los comercios. |
| pages/contratar.html | Directorio de profesionales y técnicos ("Contratar"). |
| pages/farmacias.html | Farmacias de turno. |
| pages/home.html | Inicio. |
| pages/info.html | Ayuda y preguntas frecuentes. |
| pages/login.html | Iniciar sesión. |
| pages/nueva-contrasena.html | Elegir una contraseña nueva (link del email de recuperación). |
| pages/perfil.html | Mi perfil: datos, direcciones, compras, favoritos, soporte y ajustes. |
| pages/privacidad.html | Política de privacidad. |
| pages/producto.html | Página propia de un producto (la que se abre desde un link compartido). |
| pages/profesional.html | Panel de profesional/técnico. |
| pages/recuperar-password.html | Pedir el email para recuperar la contraseña. |
| pages/register.html | Registrarse. |
| pages/repartidor.html | Panel del repartidor. |
| pages/search.html | Búsqueda, categorías y filtros. |
| pages/servicios.html | Números de emergencia y veterinarias. |
| pages/terminos.html | Términos y condiciones. |
| pages/vender.html | Alta de comercio o profesional y panel de comerciante. |

### A.2 Código JavaScript (carpeta js/)

| Archivo | Qué hace |
| --- | --- |
| js/account-switcher.js | Botón "Cambiar de cuenta" de Mi perfil. |
| js/address-suggest-utils.js | Ayudas del autocompletado de direcciones (OpenStreetMap). |
| js/admin.js | Todo el panel de administrador. |
| js/auth-utils.js | Conexión con Supabase, sesión, portero de páginas (guardPage), avisos cortos y qué panel tiene cada cuenta. |
| js/boost-plans.js | Pantalla de los combos de "Impulsá tus ventas". |
| js/boost-utils.js | Reglas de los combos de "Impulsá tus ventas" (si está vigente, cuándo vence). |
| js/carrito.js | La página del carrito: lista agrupada por comercio, cupón, envío, medio de pago e iniciar pago. |
| js/cart-totals.js | La cuenta del total del carrito (igual a la de la base). |
| js/cart-utils.js | Guardar el carrito, botones "Agregar", favoritos, precios y tarjetas. |
| js/comercio.js | Página de un comercio: encabezado, productos, reseñas y edición para el dueño. |
| js/comercios.js | Lista de comercios con su rubro. |
| js/confirm-dialog.js | Carteles propios de confirmación y de formulario corto. |
| js/contratar.js | Directorio "Contratar" y el formulario de pedir presupuesto. |
| js/courier-utils.js | Reglas del panel de repartidor (etapas, tiempos, colores de demora). |
| js/datepicker.js | Selector de fecha propio. |
| js/delivery-evidence.js | Fotos de la entrega (retiro y recepción). |
| js/dropdown.js | Desplegable propio, en lugar del del navegador. |
| js/error-logger.js | Anota los errores de la página en la base, sin datos sensibles. |
| js/farmacias.js | Farmacias de turno: cuál está de turno ahora y la semana. |
| js/friendly-error.js | Convierte errores técnicos en mensajes claros. |
| js/hints-utils.js | Ayudas cortas del carrito. |
| js/home-promos-editor.js | Editor del banner del inicio (para el comercio y el administrador). |
| js/home-promos-utils.js | Reglas de los banners del inicio. |
| js/home.js | Todo el inicio: banners, comercios, recomendados, ofertas, esenciales y mapa. |
| js/image-crop-utils.js | Cuentas del recorte de fotos. |
| js/image-cropper.js | Ventana para recortar y encuadrar fotos. |
| js/info-faq.js | Atajos de las preguntas frecuentes. |
| js/interests-utils.js | Cálculo de los intereses para "Productos recomendados". |
| js/interests.js | Recuerda qué productos se miraron (en el navegador). |
| js/linked-accounts-utils.js | Reglas de la lista de cuentas guardadas. |
| js/linked-accounts.js | Guarda las cuentas para "Cambiar de cuenta". |
| js/login.js | Iniciar sesión (correo y Google). |
| js/mp-chain-utils.js | Pago con Mercado Pago de a un comercio por vez. |
| js/nav-utils.js | El header: categorías, buscador, campanita y menú de la cuenta. |
| js/notifications-live.js | Notificaciones en tiempo real. |
| js/notifications-utils.js | Centro de notificaciones: textos, filtros, marcar como leídas. |
| js/nueva-contrasena.js | Guardar la contraseña nueva. |
| js/order-utils.js | Pedidos: número, estados, próximo paso y línea de tiempo. |
| js/panel-onboarding-utils.js | Cartel de bienvenida de cada panel. |
| js/panel-redirect-utils.js | Preferencia "entrar directo a mi panel". |
| js/payment-providers.js | Los medios de pago: qué hace cada uno al pagar. |
| js/perfil.js | Todo Mi perfil. |
| js/phone-countries.js | Lista de códigos de país para los teléfonos. |
| js/product-detail-api.js | Pide a la base el detalle de un producto. |
| js/product-detail-utils.js | Reglas del pedido del detalle (adelantarlo al pasar el mouse). |
| js/product-draft.js | Borrador del producto que se está cargando (sobrevive a recargar). |
| js/product-modal.js | La ventana del producto: fotos, opciones, cantidad, carrito, reseñas y relacionados. |
| js/product-options-utils.js | Opciones de producto (color, sabor, talle). |
| js/producto.js | La página propia de un producto. |
| js/profesional-consultas.js | Panel de profesional: Consultas. |
| js/profesional-disponibilidad.js | Panel de profesional: Horarios y zona. |
| js/profesional-galeria.js | Panel de profesional: Fotos de trabajos. |
| js/profesional-metricas.js | Panel de profesional: Estadísticas. |
| js/profesional-resenas.js | Panel de profesional: Reseñas y respuestas. |
| js/profesional-servicios.js | Panel de profesional: Servicios y precios. |
| js/profesional.js | Panel de profesional: resumen, mis datos, pausa y foto. |
| js/professional-categories.js | Categorías fijas de Contratar. |
| js/professional-hours-utils.js | Horarios de los profesionales (agrupar días, "abierto ahora"). |
| js/professional-service-utils.js | Servicios y precios de los profesionales. |
| js/professional-zones.js | Zonas de trabajo que puede elegir un profesional. |
| js/profile-fields.js | Los datos de "Información de tu perfil". |
| js/realtime-utils.js | Tiempo real: escuchar cambios de la base. |
| js/recuperar-password.js | Pedir el email de recuperación. |
| js/register.js | Registrarse (correo y Google). |
| js/repartidor.js | Panel del repartidor. |
| js/reviews-utils.js | Reseñas: estrellas, lista y formulario. |
| js/scroll-top-btn.js | Botón de volver arriba. |
| js/search-analytics.js | Anota búsquedas y productos vistos (para el informe del administrador). |
| js/search.js | Página de búsqueda y filtros. |
| js/servicios.js | Números de emergencia. |
| js/settings-utils.js | Preferencias de Ajustes. |
| js/speed-insights.js | Medición de velocidad de Vercel. |
| js/storage-utils.js | Borrar fotos guardadas en Supabase. |
| js/store-contact-utils.js | Contacto por WhatsApp y redes del comercio, con links seguros. |
| js/store-products-order.js | Orden de los productos de un comercio (ofertas primero). |
| js/supabase-config.js | Dirección y clave pública de Supabase (leídas del .env). |
| js/support-utils.js | Soporte: reclamos, adjuntos y respuestas. |
| js/theme-utils.js | Reglas del modo claro/oscuro. |
| js/theme.js | Botón y aplicación del modo claro/oscuro. |
| js/toast-utils.js | Avisos emergentes de notificaciones (abajo a la derecha). |
| js/transfer-details-utils.js | Qué datos de transferencia se muestran al pagar. |
| js/transfer-details.js | Tarjeta "Cómo transferirle a este comercio". |
| js/validation-utils.js | Validaciones de formularios compartidas. |
| js/vender-shell.js | Menú lateral y secciones de los paneles. |
| js/vender.js | Alta de comercio/profesional y todo el panel de comerciante. |

### A.3 Pruebas automáticas

Hay 27 archivos de prueba en `js/` y 5 en `supabase/functions/_tests/`. Cada uno se llama igual que el archivo que prueba, terminado en `.test.mjs` (por ejemplo, `cart-totals.test.mjs` prueba `cart-totals.js`). Se corren todos juntos con `npm test`.

- js/address-suggest-utils.test.mjs
- js/boost-utils.test.mjs
- js/cart-totals.test.mjs
- js/courier-utils.test.mjs
- js/csp.test.mjs
- js/dark-css.test.mjs
- js/datepicker.test.mjs
- js/error-logger.test.mjs
- js/friendly-error.test.mjs
- js/home-promos-utils.test.mjs
- js/image-crop-utils.test.mjs
- js/interests-utils.test.mjs
- js/linked-accounts-utils.test.mjs
- js/linked-accounts.test.mjs
- js/mp-chain-utils.test.mjs
- js/order-utils.test.mjs
- js/product-detail-utils.test.mjs
- js/product-options-utils.test.mjs
- js/professional-hours-utils.test.mjs
- js/professional-service-utils.test.mjs
- js/profile-fields.test.mjs
- js/settings-utils.test.mjs
- js/storage-utils.test.mjs
- js/store-contact-utils.test.mjs
- js/store-products-order.test.mjs
- js/theme-utils.test.mjs
- js/transfer-details-utils.test.mjs
- supabase/functions/_tests/delete-account.test.mjs
- supabase/functions/_tests/mp-create-boost-preference.test.mjs
- supabase/functions/_tests/mp-create-preference.test.mjs
- supabase/functions/_tests/mp-oauth.test.mjs
- supabase/functions/_tests/mp-webhook.test.mjs

### A.4 Estilos (carpeta Assets/styles/)

| Archivo | Qué define |
| --- | --- |
| Assets/styles/a11y.css | Accesibilidad: foco visible y "Reducir animaciones". |
| Assets/styles/account-switcher-page.css | Aviso de "necesitás otra cuenta" en el alta de profesional. |
| Assets/styles/admin.css | Panel de administrador. |
| Assets/styles/auth.css | Iniciar sesión, registro y contraseñas. |
| Assets/styles/carrito.css | Carrito. |
| Assets/styles/dark-auto.css | Modo oscuro generado solo (no se edita a mano). |
| Assets/styles/dark.css | Ajustes a mano del modo oscuro. |
| Assets/styles/home.css | Estilos compartidos: colores de marca, header, tarjetas, botones, inicio. |
| Assets/styles/perfil-custom.css | Mi perfil. |
| Assets/styles/product-modal.css | Ventana del producto. |
| Assets/styles/profesional.css | Panel de profesional. |
| Assets/styles/repartidor.css | Panel del repartidor. |
| Assets/styles/styles.css | Estilos viejos, hoy sin uso (no lo carga ninguna página). |

### A.5 Funciones en la nube (carpeta supabase/functions/)

| Función | Qué hace |
| --- | --- |
| supabase/functions/delete-account | Borra la cuenta de quien lo pide (con sus chequeos). |
| supabase/functions/mp-create-boost-preference | Arma el cobro de un combo de "Impulsá tus ventas". |
| supabase/functions/mp-create-preference | Arma el cobro de un pedido en Mercado Pago, a nombre del comercio. |
| supabase/functions/mp-oauth-callback | Termina de vincular la cuenta de Mercado Pago de un comercio. |
| supabase/functions/mp-oauth-start | Empieza la vinculación de la cuenta de Mercado Pago de un comercio. |
| supabase/functions/mp-webhook | Recibe los avisos de Mercado Pago y confirma los pagos. |

### A.6 Herramientas (carpeta scripts/)

| Archivo | Para qué sirve |
| --- | --- |
| scripts/gen-dark-css.mjs | Genera `dark-auto.css` (el modo oscuro de los colores escritos a mano). |
| scripts/jira-backfill-commits.mjs | Crea tareas de Jira a partir de commits viejos. |
| scripts/jira-commit-log.mjs | Cierra en Jira las tareas nombradas en cada commit. |
| scripts/jira-create-subtasks-m2-m11.mjs | Creó el tablero de Jira de las fases 2 a 11. |
| scripts/jira-create-subtasks.mjs | Creó el tablero de Jira de las fases 0 y 1. |
| scripts/jira-move.mjs | Mueve una tarea de Jira de estado (por hacer, en curso, finalizada). |
| scripts/optimize-images.mjs | Convierte imágenes pesadas a WebP. |

### A.7 Cambios de la base de datos (carpeta db/schema/)

Cada archivo es una "migración": un cambio a la base de datos, numerado en el orden en que se aplicó. Hoy hay 143. El nombre del archivo ya dice qué cambia (está en una mezcla de español e inglés técnico, se respeta tal cual).

| Nº | Qué cambia |
| --- | --- |
| 01 | auth profiles |
| 02 | shop and cart |
| 03 | ecommerce schema |
| 04 | seed mock data |
| 05 | admin seller |
| 06 | seed 10 stores and products |
| 07 | update mock images |
| 08 | coupons schema |
| 09 | user carts |
| 10 | fix auth triggers |
| 11 | add repartidor role |
| 12 | price cents to price |
| 13 | target data model |
| 14 | error logs |
| 15 | security advisors fixes |
| 16 | input validation constraints |
| 17 | fase2 order payment columns |
| 18 | create order rpc |
| 19 | confirm simulated payment rpc |
| 20 | create order delivery fee |
| 21 | order items title snapshot |
| 22 | transfer payment proofs |
| 23 | fix handle new user role escalation |
| 24 | fix role approval trigger block |
| 25 | delivery requests |
| 26 | deliveries and claim |
| 27 | deliveries visibility fix |
| 28 | delivery status flow |
| 29 | favorites |
| 30 | compare at price |
| 31 | store profile columns |
| 32 | product images |
| 33 | product variants |
| 34 | admin moderation |
| 35 | products select admin |
| 36 | reviews |
| 37 | conversations messages |
| 38 | notifications |
| 39 | fix broken image paths |
| 40 | order revocation |
| 41 | notify request status |
| 42 | vendor coupons and per store shipping |
| 43 | client contact and addresses |
| 44 | repartidor reviews |
| 45 | stock alerts |
| 46 | support tickets |
| 47 | admin audit log |
| 48 | offer expiration |
| 49 | store staff |
| 50 | moderador role |
| 51 | search products rpc |
| 52 | favorite price drop |
| 53 | dont downgrade elevated role |
| 54 | support ticket messages |
| 55 | user addresses |
| 56 | mp marketplace split |
| 57 | coupon visibility scope |
| 58 | store accepts contact |
| 59 | favorite stores |
| 60 | seller request multi category |
| 61 | profile personal data |
| 62 | orders nullable on delete |
| 66 | cart hints preference |
| 67 | pharmacies |
| 68 | products select purchased |
| 69 | store transfer info |
| 70 | store header colors |
| 71 | store category slug |
| 72 | notifications delete |
| 73 | support ticket attachments |
| 74 | store logo |
| 75 | fix approve seller request admin check |
| 76 | emergency contacts |
| 77 | professionals |
| 78 | professionals extras |
| 79 | categorias forrajeria libreria papeleria |
| 80 | papeleria icono bolsa |
| 81 | remove in app messaging |
| 82 | store contact and social |
| 83 | store staff permissions |
| 84 | notify professional request status |
| 85 | professional promos |
| 86 | professionals update own |
| 87 | professionals social |
| 88 | professionals select own |
| 89 | professional services |
| 90 | professional inquiries |
| 91 | professional metrics |
| 92 | professional availability |
| 93 | professional promos gallery |
| 94 | reviews owner reply |
| 95 | panel home preferences |
| 96 | lock down direct order inserts |
| 97 | lock down request status on insert |
| 98 | reviews moderador only hides |
| 99 | protect is suspended on profile |
| 100 | products bucket folder ownership |
| 101 | restrict simulated payment to admin |
| 102 | product options |
| 103 | add missing fk indexes |
| 104 | optimize rls auth calls |
| 105 | consolidate permissive policies |
| 106 | store transfer structured |
| 107 | require transfer alias for products |
| 108 | home promos |
| 109 | professional inquiries photos and date |
| 110 | professionals directory rpc |
| 111 | admin repartidor by email |
| 112 | repartidor by email guard store owners |
| 113 | store banner |
| 114 | seller confirm transfer without proof |
| 115 | order flow |
| 116 | order flow lockdown |
| 117 | realtime publication |
| 118 | get product detail rpc |
| 119 | new review notification comment |
| 120 | fotos productos sin imagen |
| 121 | categoria supermercado |
| 122 | categoria zapateria |
| 123 | icono zapatilla zapateria |
| 124 | categoria perfumeria |
| 124 | icono pata forrajeria |
| 125 | productos fotos drive |
| 126 | perfumeria a limpieza y supermercado |
| 127 | todo a perfumeria |
| 128 | search mejorada y eventos |
| 129 | productos ropa drive |
| 130 | quitar portada repetida |
| 131 | boost combos |
| 132 | mp oauth state |
| 133 | transfer obligatoria y sin efectivo en envio |
| 134 | productos kiosco bebidas drive |
| 135 | seller requests delete own rejected |
| 136 | professional requests delete own rejected |
| 137 | home promos hasta 3 por espacio |
| 138 | banners inicio posiciones 2 y 3 |
| 139 | courier flow |
| 140 | courier flow cierre |
| 141 | productos forrajeria drive |
| 142 | productos libreria drive |
| 143 | productos limpieza drive |
| 144 | get store orders rpc |
| 145 | create order sin envio gratis |

