// Contenido del "Manual del programador" de Baradero Local. Sigue la misma
// estructura que el Manual de usuario (Google Docs del equipo): Introducción,
// Guía de inicio rápido, Módulos operativos, Resolución de problemas y
// Canales de soporte, más un anexo con todos los archivos.
//
// Cada `bloque` dice de qué archivo sale el código y dónde empieza (`desde`);
// el generador (generar.mjs) lo copia del archivo real. Las `notas` son los
// comentarios para quien no programa: van arriba de la línea que contiene el
// texto indicado. Los textos van en lenguaje simple, sin jerga.

export const meta = {
  titulo: 'Manual del programador — Baradero Local',
  proyecto: 'Baradero Local',
  subtitulo: 'Manual del programador',
  bajada: 'El código del proyecto, bloque por bloque, explicado para quien no programa',
  version: '1.0',
  fecha: '27/10/2026',
  hojaDeControl: [
    {
      filas: [
        ['Nombre del proyecto', 'Baradero Local'],
        ['Entidad/ institución', 'Baradero Local'],
        ['Destinatarios', 'Equipo de desarrollo, docentes y cualquier persona que necesite entender o mantener el código, aunque no programe'],
      ],
    },
    {
      filas: [
        ['Integrantes del equipo de desarrollo', 'Algañaras Berenice / Berayra Casanova Bianca / Eichenberger Facundo / Kraus Keila'],
        ['Redactor/a del manual', 'Borrador generado con Claude Code a pedido del equipo (a revisar y completar por el equipo)'],
        ['Tutor/a, jefe/a de Área o Supervisor/a que aprueba el documento', 'Kraus Keila (pendiente de aprobación)'],
      ],
    },
    {
      titulo: 'Historial de cambios / Control de versiones',
      cabecera: ['Versión', 'Fecha', 'Resumen de modificaciones', 'Autor del cambio'],
      filas: [
        ['1.0', '27/10/2026', 'Primera versión: misma estructura que el Manual de usuario, con el código de cada módulo y comentarios en lenguaje simple.', 'Claude Code (borrador)'],
      ],
    },
  ],
};

const ARBOL = `ProyectoPdisc/
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
└── vercel.json         Cómo se publica el sitio`;

export const secciones = [
  // =========================================================================
  {
    titulo: 'Introducción',
    partes: [
      { h: 2, t: '1. Propósito del manual' },
      { p: 'Este Manual del programador muestra cómo está hecho Baradero Local por dentro. Sigue la misma estructura que el Manual de usuario: para cada parte de la página que se ve (el header, el carrito, los paneles…) se muestra el pedazo de código que la hace funcionar, con comentarios y una explicación corta en palabras simples.' },
      { p: 'Está pensado para que lo pueda leer alguien que no programa: no hace falta entender cada línea. Alcanza con leer los comentarios en verde que acompañan al código y el párrafo "En palabras simples" que sigue a cada cuadro.' },
      { p: 'El código de este manual se copia automáticamente de los archivos reales del proyecto, con la herramienta `scripts/manual-programador/generar.mjs`. Si el código cambia, se vuelve a generar el manual y queda al día. Igual que en el Manual de usuario: si hay diferencias, manda la versión vigente del sistema.' },

      { h: 2, t: '2. Descripción ejecutiva del sistema' },
      { p: 'Baradero Local es una página web (no una aplicación que se instala) que funciona en cualquier navegador, en la computadora y en el celular. Por dentro se divide en piezas, cada una con una tarea:' },
      {
        tabla: {
          cabecera: ['Pieza', 'Qué es', 'Dónde está'],
          filas: [
            ['Páginas', 'La estructura de cada pantalla: títulos, botones, formularios. Están escritas en HTML.', '`pages/`'],
            ['Estilos', 'Los colores, tamaños y la ubicación de cada cosa en la pantalla, incluido el modo oscuro. Están escritos en CSS.', '`Assets/styles/`'],
            ['Comportamiento', 'Lo que pasa al tocar un botón: buscar, agregar al carrito, pagar. Está escrito en JavaScript.', '`js/`'],
            ['Base de datos', 'Donde se guardan usuarios, comercios, productos, pedidos y reseñas. Es una base PostgreSQL en Supabase, que además maneja el inicio de sesión, las fotos y los avisos al instante.', 'Supabase (los cambios, en `db/schema/`)'],
            ['Funciones en la nube', 'Programas chicos que corren en el servidor para lo que el navegador no puede hacer por seguridad: cobrar con Mercado Pago, confirmar pagos, borrar una cuenta.', '`supabase/functions/`'],
            ['Pagos', 'Mercado Pago, transferencia bancaria y efectivo al retirar en el local.', 'Mercado Pago + `js/carrito.js`'],
            ['Publicación', 'Vercel toma el código de GitHub y lo publica en internet cada vez que se actualiza la rama principal (`main`).', '`vercel.json`'],
          ],
        },
      },
      { p: 'Un ejemplo del recorrido completo: cuando un vecino toca "Iniciar pago", el JavaScript del carrito le pide a la base de datos que cree el pedido. La base vuelve a calcular precios y stock (así nadie puede cambiarlos desde su computadora). Si eligió Mercado Pago, una función en la nube arma el cobro y, cuando Mercado Pago avisa que el pago se acreditó, otra función marca el pedido como pagado y al comercio le llega el aviso.' },

      { h: 2, t: '3. Requerimientos técnicos' },
      {
        tabla: {
          filas: [
            ['Programas para trabajar con el código', 'Node.js 20 o más nuevo (trae npm), Git y un editor de texto (por ejemplo, Visual Studio Code).'],
            ['Cuentas y servicios', 'Supabase (proyecto `otzhdwuaffcplrveuadc`), Vercel (equipo `baradero-local`, proyecto `proyectopdisc`), GitHub (`fac7n3/ProyectoPdisc`), la aplicación de Mercado Pago y el acceso de Google para "Iniciar sesión con Google".'],
            ['Navegador para probar', 'Cualquier navegador basado en Chromium (Chrome, Edge, Brave). Resolución recomendada: 1920 x 1080; probar también en celular (360 píxeles de ancho).'],
            ['Tipo de conectividad requerida', 'Internet (WiFi o datos). Sin conexión, la página lo avisa con un cartel.'],
          ],
        },
      },

      { h: 2, t: '4. Glosario de convenciones visuales' },
      { p: 'Así se ven los elementos de este manual:' },
      {
        tabla: {
          cabecera: ['Elemento', 'Cómo se ve', 'Qué significa'],
          filas: [
            ['Archivo', '"Archivo: js/login.js (líneas 37 a 83)"', 'En qué archivo del proyecto está el código y en qué líneas, para encontrarlo.'],
            ['Bloque de código', 'Cuadro gris con letra de máquina de escribir', 'El código tal cual está en el proyecto, sin los comentarios internos del equipo para que sea más corto.'],
            ['Comentario del manual', 'Línea verde que empieza con ▶', 'Una explicación agregada para este manual, arriba de la línea que explica. No está en el código real.'],
            ['Partes omitidas', 'Línea gris en cursiva: "… (se omiten líneas: …)"', 'Se sacaron líneas para que el cuadro sea corto. El archivo real las tiene.'],
            ['Nombre del código', 'Letra de máquina de escribir, `así`', 'El nombre exacto de algo dentro del código: una función, una tabla, un archivo.'],
            ['En palabras simples', 'Párrafo que sigue a cada cuadro', 'Qué hace el bloque, sin términos técnicos.'],
          ],
        },
      },
      { h: 3, t: '4.1 Glosario de términos' },
      {
        tabla: {
          cabecera: ['Término', 'Qué quiere decir'],
          filas: [
            ['Función', 'Un conjunto de instrucciones con nombre, que se "llama" cuando hace falta. Por ejemplo, `loginLocal` es la función que inicia sesión.'],
            ['Variable / constante (`const`, `let`)', 'Un nombre que guarda un dato mientras corre el código, como una cajita con etiqueta.'],
            ['`async` / `await`', 'Marcan que algo tarda (por ejemplo, preguntarle algo a la base de datos) y que hay que esperar la respuesta antes de seguir.'],
            ['Evento (`addEventListener`)', 'Le dice a la página "cuando la persona toque este botón, hacé tal cosa".'],
            ['Base de datos y tabla', 'La base es donde se guarda todo; cada tabla es como una planilla (productos, pedidos, reseñas) con una fila por cada dato.'],
            ['Consulta (`select`, `insert`, `update`, `delete`)', 'Pedidos a la base: leer, agregar, cambiar o borrar filas.'],
            ['RPC', 'Una función guardada dentro de la base de datos que la página puede llamar por su nombre (por ejemplo, `create_order` crea un pedido).'],
            ['Política de seguridad (RLS)', 'Reglas de la base que dicen quién puede ver o cambiar cada fila. Son las que protegen los datos de verdad.'],
            ['Trigger', 'Un aviso automático: "cuando pase tal cosa en esta tabla, hacé esto otro".'],
            ['Migración', 'Un archivo con un cambio a la base de datos (una tabla nueva, una regla nueva). Se numeran y se aplican en orden.'],
            ['Función en la nube (Edge Function)', 'Un programa que corre en los servidores de Supabase, no en el navegador. Se usa cuando hay claves secretas de por medio, como las de Mercado Pago.'],
            ['Sesión / JWT', 'La "credencial" que queda guardada al iniciar sesión. Dice quién es la persona y qué rol tiene (cliente, vendedor, administrador…).'],
            ['localStorage', 'Un espacio chico del navegador donde la página guarda cosas entre visitas: el carrito, el modo oscuro, las preferencias.'],
            ['Tiempo real (Realtime)', 'Una conexión abierta con la base para que los cambios (un pedido nuevo, un aviso) aparezcan solos, sin recargar.'],
            ['Webhook', 'Un aviso que manda otro sistema cuando algo pasa. Mercado Pago manda uno cuando se acredita un pago.'],
            ['Git, rama y commit', 'Git guarda la historia del código. Un commit es un cambio guardado con su descripción; una rama es una línea de trabajo aparte hasta que se une a la principal (`main`).'],
            ['Deploy (publicar)', 'Subir una versión nueva del sitio a internet. Lo hace Vercel solo, cada vez que cambia `main`.'],
            ['Prueba automática (test)', 'Un archivo que controla solo que una función dé el resultado esperado. Se corren todas con `npm test`.'],
          ],
        },
      },
    ],
  },

  // =========================================================================
  {
    titulo: 'Guía de inicio rápido',
    partes: [
      { h: 2, t: '1. Acceso al código' },
      {
        tabla: {
          filas: [
            ['Código fuente', 'https://github.com/fac7n3/ProyectoPdisc (rama `main`)'],
            ['Página publicada', 'https://proyectopdisc.vercel.app/pages/home.html'],
            ['Tablero de tareas', 'Jira, proyecto A113 (baraderolocal.atlassian.net)'],
            ['Base de datos', 'Supabase, proyecto `otzhdwuaffcplrveuadc`'],
            ['Publicación', 'Vercel, equipo `baradero-local`, proyecto `proyectopdisc`'],
          ],
        },
      },

      { h: 2, t: '2. Puesta en marcha en una computadora' },
      { p: 'Así como el usuario primero se registra e inicia sesión, quien trabaja con el código primero tiene que bajarlo y conectarlo con la base de datos.' },
      { h: 3, t: '2.1 Obtener el código e instalar lo necesario' },
      { pre: 'git clone https://github.com/fac7n3/ProyectoPdisc.git\ncd ProyectoPdisc\nnpm install' },
      { p: '`git clone` baja una copia del proyecto; `npm install` descarga las librerías que usa (Supabase, Vite y otras) en la carpeta `node_modules/`.' },
      { h: 3, t: '2.2 Configurar las claves (archivo .env)' },
      { p: 'Hay que crear a mano un archivo llamado `.env` en la carpeta del proyecto, con la dirección de Supabase y su clave pública. No se sube a GitHub a propósito.' },
      { pre: 'VITE_SUPABASE_URL="https://otzhdwuaffcplrveuadc.supabase.co"\nVITE_SUPABASE_ANON_KEY="<Supabase → Project Settings → API → anon public key>"' },
      {
        bloque: {
          archivo: 'js/supabase-config.js', desde: 'export const SUPABASE_URL', lineas: 2,
          notas: [['export const SUPABASE_URL', 'Lee del archivo .env la dirección de la base de datos y la clave pública']],
        },
        explicacion: 'El código nunca tiene la dirección escrita: la lee del `.env`. Esa clave es pública a propósito; lo que protege los datos son las reglas de la base (ver el módulo 22).',
      },
      { h: 3, t: '2.3 Correr, construir y probar' },
      {
        bloque: {
          archivo: 'package.json', desde: '"scripts": {', hasta: /^\s*},$/,
          notas: [['"dev": "vite"', 'Atajos: se usan escribiendo npm run y el nombre (npm run dev, npm run build…)']],
        },
        explicacion: '`npm run dev` abre la página en la computadora (en http://localhost:5173) y se actualiza sola al guardar un cambio; `npm run build` arma la versión final en la carpeta `dist/`; `npm test` corre todas las pruebas automáticas.',
      },
      { h: 3, t: '2.4 Publicar los cambios' },
      { p: 'Cada tarea se hace en una rama propia y, cuando está terminada, se une a `main`. Vercel publica solo cada vez que `main` cambia: por eso nunca se sube a `main` algo a medio hacer. El número de la tarea de Jira (A113-…) va en el mensaje del commit para que la tarea se cierre sola.' },
      { pre: 'git checkout -b A113-XXX-descripcion-corta\ngit add .\ngit commit -m "Qué se cambió (A113-XXX)"\ngit push -u origin A113-XXX-descripcion-corta' },

      { h: 2, t: '3. Navegación general por el código' },
      { p: 'Así está organizada la carpeta del proyecto (solo lo importante):' },
      { pre: ARBOL },
      { h: 3, t: '3.1 pages/ — las pantallas' },
      { p: 'Cada pantalla del sitio es un archivo `.html`: `home.html` (inicio), `search.html` (búsqueda y categorías), `carrito.html`, `perfil.html` (Mi perfil), `vender.html` (alta y panel de comerciante), `profesional.html`, `repartidor.html`, `admin.html`, etc. La lista completa está en el Anexo A.' },
      {
        bloque: {
          archivo: 'vite.config.js', desde: 'input: {', hasta: "home: resolve(__dirname, 'pages/home.html'),", sigue: true,
          notas: [['input: {', 'Cada página tiene que estar anotada acá para que entre en la versión publicada']],
        },
        explicacion: 'Vite es la herramienta que "construye" el sitio: junta y achica los archivos. Si se crea una página nueva y no se agrega a esta lista, funciona en la computadora pero no aparece en internet.',
      },
      { h: 3, t: '3.2 js/ — el comportamiento' },
      { p: 'Hay un archivo por pantalla (por ejemplo `carrito.js` para `carrito.html`) y archivos compartidos que terminan en `-utils.js` (por ejemplo `cart-utils.js`, que usan todas las páginas que tienen el botón "Agregar"). Los que terminan en `.test.mjs` son pruebas automáticas.' },
      { h: 3, t: '3.3 Assets/styles/ — los estilos' },
      { p: '`home.css` tiene los estilos que comparten todas las páginas (el header, las tarjetas, los botones). Al principio define los colores de la marca como "tokens": nombres que el resto del CSS reutiliza, así cambiar un color se hace en un solo lugar.' },
      {
        bloque: {
          archivo: 'Assets/styles/home.css', desde: /^:root \{/, hasta: '--bl-border-light',
          notas: [['--bl-primary: #284175;', 'El azul de Baradero Local; todas las páginas lo usan con el nombre --bl-primary']],
        },
        explicacion: 'Cada línea es un color con nombre. El modo oscuro (`dark.css`) vuelve a definir estos mismos nombres con colores oscuros, y toda la página cambia de golpe.',
      },
      { h: 3, t: '3.4 db/schema/ — la base de datos' },
      { p: 'Cada archivo `.sql` es una migración: un cambio a la base, numerado en el orden en que se aplicó (tablas, reglas de seguridad, funciones como `create_order`). Un archivo ya aplicado no se edita: si hay que corregir algo, se hace uno nuevo con el número siguiente.' },
      { h: 3, t: '3.5 supabase/functions/ — funciones en la nube' },
      { p: 'Seis funciones que corren en Supabase: cobrar con Mercado Pago (`mp-create-preference`, `mp-create-boost-preference`), recibir el aviso de pago (`mp-webhook`), vincular la cuenta de Mercado Pago de un comercio (`mp-oauth-start`, `mp-oauth-callback`) y borrar una cuenta (`delete-account`).' },
      { h: 3, t: '3.6 public/ — archivos fijos' },
      { p: 'Fotos de productos y comercios (`public/img/`), íconos, el archivo `sw.js` (permite instalar la página en el celular como una app) y `robots.txt` (indica a Google qué páginas mostrar).' },
      { h: 3, t: '3.7 dist/ — la versión construida' },
      { p: 'Es lo que arma `npm run build`. Se guarda en Git por decisión del proyecto, aunque Vercel la vuelve a construir por su cuenta al publicar.' },
      { h: 3, t: '3.8 scripts/, docs/ y video/' },
      { p: '`scripts/` tiene herramientas para el equipo (mover tareas de Jira, generar el modo oscuro, este manual). `docs/` tiene la documentación (hoja de ruta, guía de marca, cómo publicar). `video/` tiene los videos de la marca, hechos con código (Remotion).' },
      { h: 3, t: '3.9 Cómo empieza cada página' },
      {
        bloque: {
          archivo: 'pages/home.html', desde: '<head>', hasta: 'Content-Security-Policy',
          notas: [
            ["localStorage.getItem('bl_theme')", 'Si la persona eligió modo oscuro, se activa antes de dibujar la página (así no hay un destello blanco)'],
            ['name="viewport"', 'Hace que la página se adapte al ancho del celular'],
            ['Content-Security-Policy', 'Lista de lugares desde donde la página puede cargar cosas; bloquea todo lo demás (seguridad)'],
          ],
        },
        explicacion: 'Todas las páginas empiezan igual. La última línea es larga: dice, por ejemplo, que la página solo puede conectarse con Supabase y con Google. Si algún día se suma otro servicio, hay que agregarlo en esa línea de todas las páginas.',
      },
    ],
  },

  // =========================================================================
  {
    titulo: 'Módulos operativos y flujos de trabajo',
    partes: [
      { p: 'Cada módulo sigue el mismo número y nombre que en el Manual de usuario. Primero se dice qué archivos lo hacen funcionar y después se muestran sus bloques de código principales.' },

      // ---------------------------------------------------------------------
      { h: 2, t: '1. Autenticación / inicio de sesión / registro' },
      { p: 'Archivos: `js/login.js`, `js/register.js`, `js/recuperar-password.js`, `js/nueva-contrasena.js` y `js/auth-utils.js`. Las cuentas las maneja Supabase Auth: guarda los usuarios y las contraseñas (cifradas), manda los emails y conecta con Google. El código del proyecto le pasa los datos y muestra los mensajes.' },
      { h: 3, t: '1.1 Conexión con la base de datos' },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'import { createClient }', hasta: 'initErrorLogging(supabase);',
          notas: [
            ['applyDevicePreferences();', 'Aplica las preferencias de Ajustes, por ejemplo "Reducir animaciones"'],
            ['export const supabase', 'Crea la conexión con la base de datos; todas las páginas usan esta misma'],
            ['initErrorLogging(supabase)', 'Si algo falla en la página, se anota en la tabla error_logs para que el equipo lo vea'],
          ],
        },
        explicacion: 'Este archivo lo cargan todas las páginas. Es el que abre la conexión con Supabase, a la que después se le piden datos con `supabase.from(...)` o `supabase.rpc(...)`.',
      },
      { h: 3, t: '1.2 Ingreso por primera vez (registro)' },
      {
        bloque: {
          archivo: 'js/register.js', desde: 'async function registerWithEmail()', max: 39,
          saltear: [
            { de: '// Validaciones locales específicas', a: 'if (password.length < 8', motivo: 'avisos si el nombre o el correo están vacíos o mal escritos' },
            { de: 'if (!passwordConfirm)', a: 'setLoading(registerBtn, true', motivo: 'chequeo de que repitió bien la contraseña' },
          ],
          notas: [
            ['checkTermsAccepted(termsCheckbox', 'Si no tildó "Acepto los términos y condiciones", no sigue'],
            ['if (password.length < 8', 'La contraseña necesita 8 caracteres, una mayúscula y un número'],
            ['supabase.auth.signUp', 'Le pide a Supabase que cree la cuenta'],
            ['emailRedirectTo', 'A qué página vuelve la persona cuando confirma su correo'],
            ['identities.length === 0', 'Si ese correo ya tenía cuenta, avisa'],
          ],
        },
        explicacion: 'Cuando se toca "Crear cuenta", primero se revisan los datos en la misma página (para avisar rápido) y recién después se le manda todo a Supabase.',
      },
      {
        bloque: {
          archivo: 'js/register.js', desde: 'function paginaPostRegistro()',
          notas: [['if (tipo === "vendedor")', 'Si marcó "Vendedor", después del registro va directo al alta de comercio']],
        },
        explicacion: 'Elegir "Cliente", "Vendedor" o "Profesional" en el registro solo cambia a qué pantalla se llega después. La cuenta siempre nace como cliente (ver el bloque siguiente).',
      },
      {
        bloque: {
          archivo: 'db/schema/23_fix_handle_new_user_role_escalation.sql', desde: 'create or replace function public.handle_new_user()', hasta: /^end;/,
          notas: [
            ['insert into public.profiles', 'Al crearse un usuario, la base le arma su perfil automáticamente'],
            ["'cliente'", 'Toda cuenta nueva empieza como cliente, elija lo que elija en el formulario'],
          ],
        },
        explicacion: 'Es un trigger de la base de datos: corre solo cada vez que se crea una cuenta. Así nadie puede darse a sí mismo el rol de vendedor o administrador; ese cambio solo lo hace la aprobación de un administrador.',
      },
      { h: 3, t: '1.3 Inicio de sesión' },
      {
        bloque: {
          archivo: 'js/login.js', desde: 'async function loginLocal()',
          saltear: [{ de: '// Validaciones locales', a: 'setLoading(localLoginBtn, true', motivo: 'avisos si falta el correo o la contraseña' }],
          notas: [
            ['signInWithPassword', 'Le manda el correo y la contraseña a Supabase para que los verifique'],
            ['mapLoginError(error)', 'Traduce el error técnico a un mensaje claro (ver el bloque siguiente)'],
            ['¡Sesión iniciada correctamente', 'Si salió bien, la página cambia sola al inicio o al panel de la persona'],
          ],
        },
        explicacion: 'Es lo que pasa al tocar "Iniciar sesión". El código nunca ve si la contraseña es correcta: eso lo decide Supabase.',
      },
      {
        bloque: {
          archivo: 'js/login.js', desde: 'function mapLoginError(error)', max: 12,
          notas: [['invalid login credentials', 'Cada "if" reconoce un error y devuelve el texto que ve la persona']],
        },
        explicacion: 'Los mensajes de la tabla "Mensajes de error habituales" del Manual de usuario salen de funciones como esta.',
      },
      { h: 3, t: '1.4 Iniciar sesión con Google' },
      {
        bloque: {
          archivo: 'js/login.js', desde: 'async function loginWithGoogle()',
          notas: [
            ['const redirectTo', 'Después de Google vuelve a la página de login, que decide a dónde mandar a cada uno'],
            ['signInWithOAuth', 'Abre la ventana de Google para elegir la cuenta'],
            ['prompt: "select_account"', 'Siempre muestra la lista de cuentas de Google, aunque ya haya una abierta'],
          ],
        },
        explicacion: 'Con Google no hay contraseña de Baradero Local: Google confirma quién es la persona y Supabase abre la sesión.',
      },
      { h: 3, t: '1.5 Proceso de recuperación de contraseña' },
      {
        bloque: {
          archivo: 'js/recuperar-password.js', desde: 'async function requestPasswordReset()',
          saltear: [{ de: 'if (!email) {', a: 'setLoading(recoverBtn, true', motivo: 'avisos si el correo está vacío o mal escrito' }],
          notas: [
            ['resetPasswordForEmail', 'Supabase manda el email con el link para elegir una contraseña nueva'],
            ['redirectTo:', 'El link del email abre la página nueva-contrasena.html'],
            ['successNotice.style.display', 'Muestra el cartel de "te mandamos un correo"'],
          ],
        },
        explicacion: 'Por seguridad, el cartel de éxito aparece aunque el correo no esté registrado: así nadie puede averiguar qué correos tienen cuenta.',
      },
      { h: 3, t: '1.6 Páginas que exigen haber iniciado sesión' },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'export async function guardPage({', max: 30,
          saltear: [{ de: 'const fastPath', a: '// 4. Lógica de redirección', motivo: 'verificación de la sesión con el servidor' }],
          notas: [
            ["mainContent.style.visibility = 'hidden'", 'Mientras se verifica, la página queda oculta y se ve la pantalla de carga'],
            ['await supabase.auth.getSession()', 'Se fija si en este navegador hay una sesión abierta'],
            ['if (!user && requireAuth)', 'Página privada sin sesión: la manda a iniciar sesión'],
            ['if (user && redirectIfAuth)', 'Ya tiene sesión y entró al login: la manda al inicio o a su panel'],
            ['if (user && requireRole)', 'Páginas solo para algunos roles, como la de administración'],
          ],
        },
        explicacion: 'Cada página privada (Mi perfil, los paneles) arranca llamando a `guardPage`. Es el "portero": decide si la persona puede ver la página, si tiene que iniciar sesión o si ya está adentro y hay que llevarla a otro lado.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '2. Header' },
      { p: 'Archivos: `js/nav-utils.js` (categorías, buscador, campanita y menú de la cuenta), `js/theme.js` (modo claro/oscuro) y `js/cart-utils.js` (número del carrito). El mismo código arma el header de todas las páginas.' },
      { h: 3, t: '2.1 Categorías' },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: 'const CATEGORY_ICONS = {', hasta: /^};/, max: 6, sigue: true,
          notas: [['almacen:', 'Cada categoría tiene su dibujito (ícono); para una categoría nueva se agrega una línea acá']],
        },
      },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: 'export function getCategories()',
          notas: [
            ['if (!_categoriesPromise)', 'La lista se pide una sola vez por pestaña y se reutiliza'],
            [".from('categories')", 'Pide a la base la lista de categorías, ordenada por nombre'],
          ],
        },
        explicacion: 'Las categorías no están escritas en el código: son filas de la tabla `categories`. Por eso sumar una categoría es agregar una fila (más su ícono en la lista de arriba).',
      },
      { h: 3, t: '2.2 Barra de búsqueda para encontrar productos o comercios' },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: 'async function renderSuggestions(query)', max: 9, sigue: true,
          notas: [
            ['if (q.length < 2)', 'Con menos de 2 letras muestra las búsquedas recientes'],
            ["supabase.rpc('search_products'", 'Pide a la base hasta 6 productos que coincidan con lo escrito'],
            ['if (token !== lastToken) return;', 'Si la persona siguió escribiendo, descarta la respuesta vieja'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: "input.addEventListener('input', () => {",
          notas: [['debounceTimer = setTimeout(() => renderSuggestions(val), 220);', 'Espera un instante sin teclear (220 milisegundos) antes de buscar, para no consultar con cada letra']],
        },
        explicacion: 'Mientras se escribe aparecen sugerencias de categorías y productos. La búsqueda de verdad la hace la base de datos (`search_products`), que entiende errores de tipeo, plurales y sinónimos.',
      },
      { h: 3, t: '2.3 Notificaciones' },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: 'async function refreshBadge()',
          notas: [
            ['await fetchUnreadCount', 'Cuenta las notificaciones sin leer de la cuenta'],
            ["count > 9 ? '9+'", 'Si hay más de 9, el círculo rojo dice "9+"'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/notifications-utils.js', desde: 'export function currentPanelScope()',
          notas: [["if (page === 'profesional.html')", 'Dentro de un panel, solo se ven los avisos de ese panel']],
        },
        explicacion: 'Cada notificación es una fila de la tabla `notifications`. Llegan al instante gracias al tiempo real (módulo 22.1) y, dentro de un panel, se filtran: en el panel de profesional no aparecen los pedidos del comercio.',
      },
      { h: 3, t: '2.4 Mi perfil (menús que no se salen de la pantalla)' },
      {
        bloque: {
          archivo: 'js/nav-utils.js', desde: 'function keepInsideViewport(panel)',
          notas: [
            ['getBoundingClientRect', 'Mide dónde quedó el menú'],
            ['if (shift)', 'Si se sale por un costado, lo corre lo justo para que entre con margen'],
          ],
        },
        explicacion: 'En celulares angostos, los menús de la campanita y de la cuenta se salían por el borde. Esta función los acomoda cada vez que se abren.',
      },
      { h: 3, t: '2.5 Mi carrito' },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export function updateCartBadge()',
          notas: [['const total = cart.length;', 'Cuenta productos distintos, no unidades: 2 alfajores iguales cuentan como 1']],
        },
        explicacion: 'Es el número que aparece sobre el ícono del carrito. Se actualiza cada vez que se agrega o se saca algo.',
      },
      { h: 3, t: '2.6 Logo de Baradero Local' },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'function markHomeIntent(e)',
          notas: [
            ['.navbar__logo', 'Solo reacciona al toque sobre el logo'],
            ['sessionStorage.setItem(HOME_INTENT_KEY', 'Anota "quiero ver el inicio", así a quien tiene panel no lo mandan de vuelta a su panel'],
          ],
        },
        explicacion: 'El logo es un link al inicio. Además deja esta marca porque el inicio lleva automáticamente a su panel a los comerciantes y profesionales; tocar el logo es la forma de decir "quiero ver el inicio igual".',
      },
      { h: 3, t: '2.7 Modo claro/oscuro' },
      {
        bloque: {
          archivo: 'js/theme.js', desde: 'function setTheme(theme',
          notas: [
            ['applyTheme(theme);', 'Cambia los colores de toda la página'],
            ['localStorage.setItem(THEME_KEY, theme);', 'Recuerda la elección en este navegador para la próxima visita'],
          ],
        },
        explicacion: 'El botón del sol y la luna llama a `setTheme`. Los colores oscuros están en `dark.css` (ajustes a mano) y `dark-auto.css` (generado solo con `scripts/gen-dark-css.mjs`).',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '3. Header Auxiliar' },
      { p: 'En las páginas que no son el inicio, el header es más simple: logo, flecha para volver, campanita, perfil, carrito y modo claro/oscuro. Todo es el mismo código del módulo 2, salvo la flecha.' },
      { h: 3, t: '3.1 Volver atrás' },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'function hasSiteHistory()',
          notas: [
            ['window.history.state?.blSection', 'Dentro de Mi perfil siempre se puede volver a la sección anterior'],
            ['new URL(document.referrer).origin', 'Solo vuelve atrás si la página anterior es de Baradero Local'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'function handleNavBack(e)',
          notas: [
            ['window.history.back();', 'Vuelve a la página anterior'],
            ['window.location.href = circle.getAttribute', 'Si no hay a dónde volver (por ejemplo, entró por un link de WhatsApp), va al inicio'],
          ],
        },
        explicacion: 'La flecha funciona como el botón "atrás" del navegador, pero sin sacar a la persona del sitio.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '4. Categorías' },
      { p: 'Archivos: `js/search.js` (la página de resultados con sus filtros), `js/product-modal.js` (la ventana del producto), `js/reviews-utils.js` (reseñas) y `js/cart-utils.js` (favoritos y carrito).' },
      { h: 3, t: '4.1 Barra de navegación, categorías y filtros' },
      {
        bloque: {
          archivo: 'js/search.js', desde: "const { data: products, error } = await supabase.rpc('search_products', {", hasta: '});',
          notas: [
            ['p_query:', 'Lo que se escribió en el buscador'],
            ['p_category:', 'La categoría elegida (o todas)'],
            ['p_min_price:', 'Precio mínimo y máximo de los filtros'],
            ['p_sort:', 'El orden: más relevantes, menor precio, mayor precio, más recientes o A-Z'],
            ['p_offset:', 'De a una página por vez: "Ver más" pide la siguiente'],
          ],
        },
        explicacion: 'Cada vez que se cambia un filtro, la búsqueda se hace de nuevo sola (no hay botón "Aplicar"). Los filtros viajan a la función `search_products` de la base, que devuelve los productos ya filtrados y ordenados. Borrar la categoría (la "x") es volver a buscar con "todas".',
      },
      { h: 3, t: '4.2 Productos (la ventana del producto)' },
      {
        bloque: {
          archivo: 'js/product-modal.js', desde: 'async function fetchProductData(productId)', max: 18, sigue: true,
          notas: [
            ['fetchProductDetail(productId)', 'Pide todo el producto en una sola consulta: datos, comercio, fotos, opciones y reseñas'],
            ['const hasDiscount', 'Si tiene precio anterior y la oferta no venció, calcula el porcentaje de descuento'],
            ['const shippingText', 'El texto del costo de envío del comercio'],
          ],
        },
        explicacion: 'Al tocar un producto se abre una ventana encima de la página. Mientras llegan los datos, ya muestra lo que tenía la tarjeta (foto, nombre, precio) para que no haya que esperar.',
      },
      { h: 4, t: '4.2.1 Compartir' },
      {
        bloque: {
          archivo: 'js/product-modal.js', desde: "const shareBtn = overlay.querySelector('#pm-share-btn');",
          notas: [
            ['if (navigator.share)', 'En el celular abre el menú de compartir (WhatsApp, Instagram…)'],
            ['await navigator.clipboard.writeText(`', 'En la computadora copia el link para pegarlo donde se quiera'],
          ],
        },
      },
      { h: 4, t: '4.2.2 Corazón (favoritos)' },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export async function toggleFavorite(productId, isCurrentlyFavorite)',
          notas: [
            ['if (!session) {', 'Sin sesión, el favorito se guarda en el navegador'],
            [".from('favorites').delete()", 'Si ya era favorito, lo saca'],
            [".from('favorites').insert(", 'Si no, lo agrega a la tabla favorites de la cuenta'],
          ],
        },
        explicacion: 'Al iniciar sesión, los favoritos que se marcaron sin cuenta se suben solos a la cuenta.',
      },
      { h: 4, t: '4.2.3 Cantidad' },
      {
        bloque: {
          archivo: 'js/product-modal.js', desde: "const qtyInput = overlay.querySelector('#pm-qty-value');", hasta: "qtyPlus?.addEventListener('click', () => {", sigue: true,
          notas: [
            ['qtyMinus.disabled = val <= 1;', 'El "menos" se apaga en 1 y el "más" al llegar al stock disponible'],
            ['if (val > 1) qtyInput.value = val - 1;', 'Resta uno, sin bajar de 1'],
          ],
        },
      },
      { h: 4, t: '4.2.4 Añadir al carrito' },
      {
        bloque: {
          archivo: 'js/product-modal.js', desde: "addCartBtn?.addEventListener('click', () => {", max: 44,
          saltear: [{ de: "addCartBtn.classList.add('pm-btn--added');", a: 'const chosen = describeSelectedOptions', motivo: 'animación del botón "¡Agregado!"' }],
          notas: [
            ['const missing = missingOptionNames', 'Si el producto tiene opciones (color, talle) y falta elegir alguna, avisa y no lo agrega'],
            ['const existing = cart.find', 'Si ya estaba en el carrito con las mismas opciones, suma la cantidad'],
            ['cart.push({', 'Si no, agrega una línea nueva con nombre, comercio, precio, foto y cantidad'],
            ['_saveCart(cart);', 'Guarda el carrito y actualiza el número del ícono'],
          ],
        },
        explicacion: 'La misma remera en rojo y en azul son dos líneas distintas del carrito. "Comprar ahora" hace lo mismo y además lleva directo al carrito.',
      },
      { h: 4, t: '4.2.5 Reseñas' },
      {
        bloque: {
          archivo: 'js/reviews-utils.js', desde: 'export async function submitReview(targetType, targetId, rating, comment)',
          notas: [
            ['if (!session) throw', 'Para opinar hay que haber iniciado sesión'],
            [".from('reviews').upsert(", 'Guarda la reseña; si la persona ya había opinado, la reemplaza (una por persona)'],
            [/^\s+rating,$/, 'La cantidad de estrellas, de 1 a 5'],
          ],
        },
        explicacion: 'Las reseñas de productos, comercios y profesionales están todas en la tabla `reviews`. Un administrador o moderador puede ocultar una reseña reportada.',
      },
      { h: 4, t: '4.2.6 Productos relacionados' },
      {
        bloque: {
          archivo: 'js/product-modal.js', desde: 'async function fetchRelatedProducts(productId)', max: 26,
          notas: [
            [".select('category_id')", 'Primero averigua de qué categoría es el producto'],
            [".eq('category_id', current.category_id)", 'Después busca otros productos activos y con stock de esa misma categoría'],
            ['const mixed = [...data];', 'Los mezcla al azar para que no salgan siempre los del mismo comercio'],
          ],
        },
        explicacion: 'Si no hay otros productos de la misma categoría, la sección no aparece (no se rellena con cualquier cosa).',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '5. Panel de perfil' },
      { p: 'Archivos: `pages/perfil.html` y `js/perfil.js`, más `js/profile-fields.js` (datos personales), `js/account-switcher.js` (cambiar de cuenta), `js/support-utils.js` (soporte) y `js/settings-utils.js` (ajustes).' },
      { h: 3, t: '5.1 Moverse entre las secciones de Mi perfil' },
      {
        bloque: {
          archivo: 'js/perfil.js', desde: 'function openSection(targetId, scrollToId)',
          notas: [['window.history.pushState', 'Anota la sección en el historial: así la flecha "volver" regresa al menú de Mi perfil']],
        },
        explicacion: 'Mi perfil es una sola página con secciones (Información, Direcciones, Compras, Favoritos, Soporte, Ajustes). Tocar un acceso muestra esa sección y esconde las otras.',
      },
      { h: 3, t: '5.2 Información de tu perfil' },
      {
        bloque: {
          archivo: 'js/profile-fields.js', desde: 'export const PROFILE_FIELDS = [',
          notas: [
            ['key: "full_name"', 'Cada dato del perfil se describe así: qué muestra, cómo se edita y cómo se revisa'],
            ['validate: (v) =>', 'Los chequeos antes de guardar, con el mensaje que ve la persona'],
          ],
        },
        explicacion: 'Se muestra solo el primer dato (nombre y apellido); los demás (fecha de nacimiento, documento, teléfono) siguen el mismo molde. Sumar un dato nuevo es agregar otro bloque como este.',
      },
      { h: 3, t: '5.3 Cambiar de cuenta' },
      {
        bloque: {
          archivo: 'js/account-switcher.js', desde: 'async function switchTo(entry, button)', max: 26,
          notas: [
            ['if (actual) rememberAccount(actual);', 'Guarda la sesión de la cuenta actual para poder volver a ella'],
            ['await supabase.auth.setSession(entry.session)', 'Abre la sesión de la otra cuenta guardada en este dispositivo'],
            ['forgetAccount(entry.id);', 'Si esa sesión ya no sirve, la saca de la lista'],
            ['resetLocalCartState();', 'Cada cuenta tiene su propio carrito: no se mezclan'],
          ],
        },
        explicacion: 'Para agregar una cuenta a la lista hay que iniciar sesión en ella (no se puede sumar la de otra persona). Las cuentas se guardan solo en ese dispositivo, y "Cerrar sesión" las borra todas.',
      },
      { h: 3, t: '5.4 Direcciones (predeterminar dirección)' },
      {
        bloque: {
          archivo: 'js/perfil.js', desde: 'if (!addr.is_default) {',
          notas: [
            ["update({ is_default: false }).eq('user_id', userId)", 'Primero le saca la marca de "predeterminada" a todas las direcciones'],
            ["update({ is_default: true }).eq('id', addr.id)", 'Después se la pone a la elegida'],
          ],
        },
        explicacion: 'Las direcciones son filas de la tabla `user_addresses`. La predeterminada es la que aparece elegida en el carrito.',
      },
      { h: 3, t: '5.5 Soporte' },
      {
        bloque: {
          archivo: 'js/support-utils.js', desde: 'export async function submitSupportTicket(subject, message, attachments = [])',
          notas: [
            ["if (!session) throw", 'Hay que haber iniciado sesión para mandar un reclamo'],
            [".from('support_tickets').insert(row)", 'Guarda el reclamo con asunto, mensaje y capturas'],
            ['await removeAttachments(attachments);', 'Si no se pudo guardar, borra las capturas que ya había subido'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/support-utils.js', desde: 'async function cancelTicket(ticketId)',
          notas: [
            ["update({ status: 'cancelled' })", 'Cancelar un reclamo es cambiarle el estado'],
            ['if (!data?.length) throw', 'Si la base no lo cambió, avisa en vez de decir "listo"'],
          ],
        },
        explicacion: 'Los reclamos quedan en la tabla `support_tickets` y el administrador los responde desde su panel. El estado (Abierto, Pendiente, Cerrado) es una columna de esa tabla.',
      },
      { h: 3, t: '5.6 Ajustes' },
      {
        bloque: {
          archivo: 'js/settings-utils.js', desde: 'export function setPref(name, enabled)',
          notas: [
            ["localStorage.setItem(pref.key, enabled ? '1' : '0');", 'La preferencia se guarda en este navegador'],
            ['applyDevicePreferences();', 'Y se aplica en el momento, sin recargar'],
          ],
        },
        explicacion: 'Las preferencias ("Mostrar ayudas en el carrito", "Avisos emergentes", "Reducir animaciones") son por dispositivo: se pueden tener distintas en el celular y en la computadora.',
      },
      {
        bloque: {
          archivo: 'js/perfil.js', desde: 'function initSignOutAll()', max: 26,
          notas: [
            ['const ok = await confirmDialog(', 'Primero pregunta si está segura'],
            ['clearLinkedAccounts();', 'Borra las otras cuentas guardadas en el dispositivo'],
            ['signOut({ scope: "global" })', 'Cierra la sesión en todos los dispositivos donde se entró con esta cuenta'],
          ],
        },
        explicacion: 'Es el botón "Cerrar en todos" de Sesión y seguridad.',
      },
      { h: 4, t: '5.6.1 Tus datos son tuyos (eliminar mi cuenta)' },
      {
        bloque: {
          archivo: 'supabase/functions/delete-account/index.ts', desde: 'const { data: stores, error: storesError } = await admin', hasta: 'if (deleteError) throw deleteError;', max: 36,
          notas: [
            ['if (stores && stores.length > 0)', 'Si la persona es dueña de un comercio, no se borra (se llevaría el comercio entero)'],
            ['.in("status", ORDERS_IN_FLIGHT)', 'Tampoco si tiene pedidos en curso'],
            ['admin.auth.admin.deleteUser(user.id)', 'Si pasó los dos chequeos, borra la cuenta'],
          ],
        },
        explicacion: 'Borrar una cuenta necesita una clave secreta que no puede estar en el navegador, por eso lo hace una función en la nube. La cuenta a borrar sale siempre de la sesión de quien lo pide: nadie puede borrar la cuenta de otro. Los pedidos ya entregados quedan en el historial del comercio, sin los datos de la persona.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '6. Carrito' },
      { p: 'Archivos: `js/carrito.js` (la página), `js/cart-utils.js` (guardar el carrito), `js/cart-totals.js` (la cuenta del total), `js/payment-providers.js` (los medios de pago) y, en la base, la función `create_order`.' },
      { h: 3, t: '6.1 Dónde se guarda el carrito' },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export function getCart()',
          notas: [['localStorage.getItem(CART_KEY)', 'El carrito se guarda en el navegador, para que no se pierda al cambiar de página']],
        },
      },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export function saveCart(cart)',
          notas: [['pushCartToCloud(cart)', 'Si hay sesión, también se copia a la nube: el carrito es el mismo en el celular y en la computadora']],
        },
      },
      { h: 3, t: '6.2 Checkbox del comercio y del producto' },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export function isItemSelected(item)', lineas: 8,
          notas: [
            ['return item?.selected !== false;', 'Un producto entra en la compra salvo que se le haya sacado el tilde'],
            ['filter(isItemSelected)', 'Al pagar, solo viajan los productos tildados; los demás quedan para después'],
          ],
        },
      },
      { h: 3, t: '6.3 Vaciar mi carrito' },
      {
        bloque: {
          archivo: 'js/cart-utils.js', desde: 'export function clearCart()',
          notas: [['pushCartToCloud([])', 'También vacía la copia de la nube']],
        },
      },
      { h: 3, t: '6.4 Resumen del pedido (la cuenta del total)' },
      {
        bloque: {
          archivo: 'js/cart-totals.js', desde: 'export function computeCartTotals({', max: 40,
          notas: [
            ['const line = Number(item.price) * Number(item.qty);', 'Precio por cantidad de cada producto, sumado por comercio'],
            ['const discountPct = discountPctForStore(', 'El cupón se aplica solo en el comercio que lo creó (o en todos, si es general)'],
            ["const shipping = deliveryMethod === 'delivery' ? fee : 0;", 'Con envío a domicilio se suma el costo de envío de cada comercio'],
            ['const total = byStore.reduce', 'El total es la suma de lo que se le paga a cada comercio'],
          ],
        },
        explicacion: 'Esta cuenta es la misma que hace la base de datos al crear el pedido, así el total que ve la persona es el que se cobra. Tiene pruebas automáticas en `js/cart-totals.test.mjs`. Los precios son siempre pesos enteros, sin centavos.',
      },
      {
        bloque: {
          archivo: 'js/carrito.js', desde: 'function applyCashRule()',
          notas: [
            ["const delivery = deliveryMethod === 'delivery';", '¿Eligió envío a domicilio?'],
            ["if (label) label.style.display = delivery ? 'none' : '';", 'Con envío, la opción "Efectivo" se esconde'],
            ['if (delivery && radio?.checked)', 'Si ya tenía efectivo elegido, pasa sola a Mercado Pago o transferencia'],
          ],
        },
        explicacion: 'El efectivo es solo para retirar en el local. La base de datos también lo controla, por si alguien intenta saltearse la pantalla.',
      },
      { h: 3, t: '6.5 Iniciar pago' },
      {
        bloque: {
          archivo: 'js/carrito.js', desde: 'const payload = selectedItems.map(item => ({', hasta: 'const paymentResult = await provider.pay(',
          notas: [
            ['const payload', 'Arma la lista de lo que se compra: solo el producto, la cantidad y las opciones (nunca el precio)'],
            ["await supabase.rpc('create_order'", 'Le pide a la base que cree el pedido (uno por cada comercio)'],
            ['if (error) {', 'Si algo no está bien (sin stock, cupón vencido), muestra el motivo'],
            ['const provider = getPaymentProvider(paymentMethod);', 'Según el medio de pago elegido, sigue el paso que corresponde'],
          ],
        },
        explicacion: 'Con transferencia se muestran los datos del comercio para copiar; con efectivo, el código de retiro; con Mercado Pago, se pasa a la página de pago de Mercado Pago (si hay varios comercios, se paga de a uno).',
      },
      { h: 4, t: '6.5.1 El pedido dentro de la base de datos' },
      {
        bloque: {
          archivo: 'db/schema/145_create_order_sin_envio_gratis.sql', desde: 'if v_client is null then raise exception', hasta: 'if cart_payload is null',
          notas: [
            ['if v_client is null', 'Hay que haber iniciado sesión'],
            ["if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address)", 'Con envío, la dirección es obligatoria'],
            ["p_delivery_method = 'delivery' and p_payment_method = 'efectivo'", 'Efectivo solo con retiro en el local'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'db/schema/145_create_order_sin_envio_gratis.sql', desde: 'if exists (select 1 from (select product_id, sum(qty)', hasta: 'where p.id = agg.product_id;',
          notas: [
            ['if exists (select 1', 'Si no alcanza el stock de algún producto, se cancela toda la compra'],
            ['for v_store_id in select distinct store_id', 'Arma un pedido por cada comercio del carrito'],
            ['v_total := round(', 'Total: subtotal con el descuento del cupón, más el envío'],
            ['insert into public.orders', 'Guarda el pedido'],
            ['update public.products p set stock', 'Descuenta el stock'],
          ],
        },
        explicacion: '`create_order` es la parte más importante del sistema: vuelve a leer los precios reales de la base, controla stock, opciones y cupón, y recién ahí crea los pedidos. Si algo falla en el medio, no se guarda nada.',
      },
      { h: 4, t: '6.5.2 Confirmación del pago de Mercado Pago' },
      {
        bloque: {
          archivo: 'supabase/functions/mp-webhook/index.ts', desde: 'const expectedTotal = pendingOrders.reduce(', hasta: 'payment_id: String(payment.id),', sigue: true,
          saltear: [{ de: 'console.warn(', a: 'return new Response("ok", { status: 200 });', motivo: 'marca el pedido "a revisar" y avisa al comercio' }],
          notas: [
            ['const expectedTotal', 'Suma lo que deberían haber pagado los pedidos'],
            ['const paidAmount', 'Lo que Mercado Pago dice que se cobró'],
            ['if (paidAmount < expectedTotal)', 'Si se cobró menos, NO se da por pagado: queda "a revisar"'],
            ['payment_status: "paid",', 'Si está todo bien, el pedido queda pagado'],
          ],
        },
        explicacion: 'Cuando alguien paga, Mercado Pago avisa a esta función en la nube (un "webhook"). La función no se cree el aviso: vuelve a consultar el pago en Mercado Pago y compara el monto antes de marcar el pedido como pagado. Si después hay una devolución, el pedido vuelve a "a revisar".',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '7. Accesos Rápidos' },
      { h: 3, t: '7.1 Los tres botones del inicio' },
      {
        bloque: {
          archivo: 'pages/home.html', desde: 'category-bar__inner--home-actions', lineas: 5,
          notas: [['id="home-panel-action"', 'Este botón dice "Vender" o "Panel" según la cuenta (ver el módulo 17)']],
        },
      },
      { h: 3, t: '7.2 Vender (pedir el alta de un comercio)' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: "await supabase.from('seller_requests').delete()", hasta: 'if (submitBtn) setLoading(submitBtn, false, "Registrarme");',
          notas: [
            ["await supabase.from('seller_requests').delete()", 'Si tenía una solicitud rechazada, la borra para poder mandar una nueva'],
            ['.insert({', 'Guarda la solicitud (nombre, CUIT, rubros, dirección, teléfono); queda "pendiente" hasta que un administrador la apruebe'],
            ['await checkSellerState();', 'Vuelve a mirar el estado: la persona ve el cartel de "solicitud en revisión"'],
          ],
        },
        explicacion: 'La aprobación del administrador está en el módulo 21. Una cuenta puede ser comercio o profesional, no las dos cosas.',
      },
      { h: 3, t: '7.3 Contratar' },
      {
        bloque: {
          archivo: 'js/contratar.js', desde: 'async function loadProfessionals()', max: 20, sigue: true,
          notas: [
            ["container.appendChild(buildLoadingBlock('Cargando el directorio'));", 'Mientras carga, muestra "Cargando el directorio"'],
            ["supabase.rpc('get_professionals_directory')", 'Una sola consulta trae a todos los profesionales con reseñas, servicios, horarios, zonas y fotos'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/contratar.js', desde: 'function registrarMetrica(professionalId, evento)',
          notas: [['increment_professional_metric', 'Suma una visita, un llamado o un WhatsApp a las estadísticas del profesional']],
        },
        explicacion: 'Las estadísticas del panel de profesional (módulo 19) salen de estos registros.',
      },
      { h: 3, t: '7.4 Emergencias' },
      {
        bloque: {
          archivo: 'js/servicios.js', desde: 'async function loadServicios()', max: 28,
          notas: [
            [".from('emergency_contacts')", 'Los números están en la tabla emergency_contacts; el administrador los carga desde su panel'],
            [".eq('is_active', true)", 'Solo los que están activos'],
            ['CATEGORIES.forEach', 'Los agrupa en tarjetas: Emergencias y Veterinarias'],
          ],
        },
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '8. Banner principal' },
      { p: 'Archivo: `js/home.js` (todo el inicio). El banner es una tira de imágenes que se desliza con el dedo en el celular; las flechas y los puntitos mueven esa misma tira.' },
      { h: 3, t: '8.1 Flechas' },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'function initHeroCarousel()', max: 31, sigue: true,
          notas: [
            ['if (slides.length <= 1)', 'Con una sola imagen no muestra flechas ni puntitos'],
            ['const goTo = (index) =>', 'Ir a una imagen: después de la última vuelve a la primera'],
            ["dot.addEventListener('click', () => goTo(i));", 'Cada puntito lleva a su imagen'],
          ],
        },
      },
      { h: 3, t: '8.2 Farmacias de turno' },
      {
        bloque: {
          archivo: 'js/farmacias.js', desde: 'function shiftWindow(shift)', lineas: 12,
          notas: [
            ['if (end <= start) end = addDays(end, 1);', 'Si el turno "cierra antes de abrir" (de 8:00 a 8:00), cierra al día siguiente'],
            ['return now >= start && now < end;', '¿La hora actual está dentro del turno?'],
          ],
        },
        explicacion: 'Los turnos se cargan en la tabla `pharmacy_shifts` desde el panel de administrador. Como cada turno dura de 8:00 a 8:00, a las 3 de la mañana del domingo la farmacia de turno es la del sábado: por eso hace falta esta cuenta.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '9. Comercios destacados' },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'async function loadStores()', max: 22, sigue: true,
          notas: [
            [".eq('status', 'approved')", 'Solo comercios aprobados'],
            ['loadActiveBoosts(),', 'Y cuáles contrataron un combo de "Impulsá tus ventas"'],
            ['stores = [...stores].sort(', 'Los que pagaron el combo van primero'],
          ],
        },
        explicacion: 'Cada logo es un link a la página del comercio (`comercio.html?id=…`). Las flechas mueven la fila de logos.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '10. Banner promociones' },
      { p: 'Archivos: `js/home-promos-utils.js` (las reglas) y `js/home.js` (el dibujo). Cada espacio de banner es una fila de la tabla `home_promos`: el administrador elige qué comercio lo usa y el comercio carga la imagen.' },
      {
        bloque: {
          archivo: 'js/home-promos-utils.js', desde: 'export function isPromoLive(promo)',
          notas: [
            ['&& promo.is_active', 'El administrador la tiene encendida'],
            ['&& promo.image_url', 'El comercio ya cargó la imagen'],
            ["promo.stores?.status === 'approved'", 'Y el comercio está aprobado'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/home-promos-utils.js', desde: 'export function groupLivePromosBySlot(rows)',
          notas: [
            ['.filter(isPromoLive)', 'Se quedan solo las promos listas para mostrarse'],
            ['.sort((a, b) => promoPosition(a) - promoPosition(b))', 'Cada espacio puede tener hasta 3 publicidades, que pasan solas'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/home-promos-utils.js', desde: 'export function promoHref(promo)',
          notas: [['comercio.html?id=', 'Tocar la imagen ampliada lleva a la página del comercio']],
        },
        explicacion: 'Si un espacio no tiene una promo lista, se muestra el banner fijo de siempre.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '11. Productos recomendados' },
      {
        bloque: {
          archivo: 'js/interests.js', desde: 'export function rememberViewedProduct(productId)',
          notas: [['addView(loadViewedProducts(), productId, Date.now())', 'Anota qué producto se miró y cuándo (en este navegador)']],
        },
      },
      {
        bloque: {
          archivo: 'js/interests-utils.js', desde: 'export function weightCategories(views, categoryByProduct, now)',
          notas: [
            ['Math.pow(0.5, days / HALF_LIFE_DAYS)', 'Lo que se miró hace 14 días vale la mitad que lo de hoy'],
            ['.slice(0, MAX_CATEGORIES);', 'Se quedan las categorías más miradas (hasta 5)'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'async function loadInterestProducts(limit)', max: 22,
          notas: [
            ['const weighted = weightCategories(', 'Calcula cuánto interesa cada categoría'],
            [".not('id', 'in'", 'Sin repetir lo que ya miró'],
            ['return interleaveByInterest(', 'Reparte los lugares entre las categorías según cuánto interesan, intercaladas'],
          ],
        },
        explicacion: 'Si alguien mira varios productos de ropa, en el inicio le aparecen más productos de ropa. Se guarda solo en ese navegador: sin historial, el inicio muestra la lista general.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '12. Comercios cerca tuyo' },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'navigator.geolocation.getCurrentPosition(', hasta: /^\s*\);$/,
          notas: [
            ['saveNearbyLocation(', 'Guarda la ubicación para no volver a pedirla en esta visita'],
            ['renderMap(position.coords.latitude', 'Muestra el mapa centrado en esa ubicación'],
            ['if (error.code === error.PERMISSION_DENIED)', 'Si la persona no dio permiso, se le explica cómo habilitarlo'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'const renderMap = (lat, lng) => {', max: 16, sigue: true,
          notas: [
            ['iframe.src = `https://www.google.com/maps?q=', 'Un mapa de Google Maps metido en la página'],
            ['openLink.href', 'El link "Ver mi ubicación en Google Maps"'],
          ],
        },
        explicacion: 'Al tocar "Usar mi ubicación", el navegador pide permiso. La ubicación no se manda a la base de datos: solo se usa para centrar el mapa.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '13. Esenciales para tu casa' },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'async function loadEssentials()',
          notas: [
            [".in('categories.slug', ['almacen', 'limpieza', 'lacteos'])", 'Son los productos de Almacén, Limpieza y Lácteos'],
            ['essentialsPager.setItems(products);', 'Se muestran de a 4, con flechitas para pasar'],
          ],
        },
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '14. Ofertas' },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'async function loadOffers()',
          notas: [
            [".not('compare_at_price', 'is', null)", 'Productos con "precio anterior" cargado'],
            ['offer_expires_at.is.null', 'Y cuya oferta no venció'],
            ['p.compare_at_price > p.price', 'Solo si el precio anterior es mayor al actual'],
          ],
        },
        explicacion: 'Una oferta es un producto con "precio anterior" (tachado) más alto que el actual. Cuando pasa la fecha de vencimiento que cargó el comercio, deja de aparecer acá sola.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '15. Banners inferiores' },
      {
        bloque: {
          archivo: 'js/home-promos-utils.js', desde: 'export const HOME_PROMO_SLOTS = [', hasta: '];',
          notas: [
            ["{ slot: 'mosaic_a'", 'Los tres espacios de arriba (a, b y c)'],
            ["{ slot: 'mosaic_d'", 'Los tres de abajo (d, e y f), con las medidas recomendadas de la imagen'],
          ],
        },
        explicacion: 'Funcionan igual que los banners de promociones (módulo 10): cada espacio es de un comercio y tocarlo lleva a su página.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '16. Footer' },
      { h: 3, t: '16.1 Botón de subir' },
      {
        bloque: {
          archivo: 'js/scroll-top-btn.js', desde: 'if (btn) {',
          notas: [
            ['window.scrollY > 400', 'Aparece cuando se bajó más de 400 píxeles'],
            ['window.scrollTo({ top: 0', 'Al tocarlo sube hasta arriba (sin animación si se pidió "Reducir animaciones")'],
          ],
        },
      },
      { h: 3, t: '16.2 Términos y condiciones, Comprá, Vendé, Ayuda y Redes sociales' },
      { p: 'Son links comunes (etiquetas `<a href="…">` en el HTML del footer) a `terminos.html`, `privacidad.html`, `info.html`, la búsqueda por categoría y las redes. No tienen código JavaScript.' },
      { h: 3, t: '16.3 Preguntas frecuentes (FAQ)' },
      {
        bloque: {
          archivo: 'pages/info.html', desde: '<details class="faq-item">', hasta: '</details>',
          notas: [['<summary>', 'La pregunta; al tocarla se despliega la respuesta (el "+"), sin necesidad de JavaScript']],
        },
        explicacion: 'Cada pregunta es un bloque `<details>`. Los 5 botones de arriba son links a cada grupo; `js/info-faq.js` hace que la página baje suave y marque el grupo en azul por 3 segundos.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '17. Paneles' },
      { p: 'El botón "Vender" del inicio pasa a decir "Panel" para quien ya tiene uno. Saber qué panel tiene cada cuenta lo resuelve `getPanelAccess` en `js/auth-utils.js`.' },
      {
        bloque: {
          archivo: 'js/auth-utils.js', desde: 'async function computePanelAccess(user)', max: 26,
          notas: [
            ['const isAdmin = role === "admin"', 'Administrador o moderador: tiene el panel de administración'],
            ['if (role === "vendedor")', 'El rol viene en la sesión: vendedor y repartidor se saben al instante'],
            ['const [storeRes, staffRes, profRes]', 'Si no, se fija si es dueño de un comercio, empleado de uno o profesional publicado'],
            ['if (storeRes.data?.length || staffRes.data?.length)', 'Con comercio (propio o como empleado): panel de comerciante; si no, de profesional'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'js/home.js', desde: 'function renderPanelAction({ isAdmin, seller, role })', max: 24, sigue: true,
          notas: [
            ["link.textContent = 'Panel';", 'Con un solo panel, "Vender" pasa a decir "Panel" y lleva directo'],
            ["btn.append('Panel');", 'Con dos paneles (por ejemplo, comerciante y administrador) se arma un menú para elegir'],
          ],
        },
        explicacion: 'La respuesta se guarda en el navegador para que la próxima vez el botón aparezca con el texto correcto desde el primer momento.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '18. Panel de comerciante' },
      { p: 'Archivos: `pages/vender.html` y `js/vender.js` (el archivo más grande del proyecto), con `js/vender-shell.js` (el menú lateral) y `js/comercio.js` (la página pública del comercio).' },
      { h: 3, t: '18.1 Vista previa de tu local (colores del encabezado)' },
      {
        bloque: {
          archivo: 'js/comercio.js', desde: "bgInput.addEventListener('change', async () => {", lineas: 17,
          notas: [
            ['persist({ header_bg_color: bgInput.value })', 'Guarda el color de fondo elegido en la ficha del comercio'],
            ['persist({ header_text_color: fgInput.value })', 'Guarda el color de las letras'],
            ['header_bg_color: null, header_text_color: null', '"Restaurar" vuelve a los colores de siempre'],
          ],
        },
        explicacion: 'El lápiz de color solo aparece para el dueño. Los colores se guardan en la tabla `stores` y los ven todos. En modo oscuro, si el color elegido no se lee bien, la página lo ajusta sola.',
      },
      { h: 3, t: '18.2 Perfil de mi comercio (transferencia bancaria obligatoria)' },
      {
        bloque: {
          archivo: 'db/schema/133_transfer_obligatoria_y_sin_efectivo_en_envio.sql', desde: 'create or replace function public.require_store_transfer_alias()', hasta: /^\$\$;/,
          notas: [
            ["-> 'app_metadata' ->> 'role' = 'admin' then", 'El administrador no tiene esta restricción'],
            ['select transfer_alias, transfer_cbu', 'Lee el alias y el CBU/CVU del comercio'],
            ["if coalesce(btrim(v_alias), '') = ''", 'Si no tiene ninguno de los dos, no deja publicar el producto y explica por qué'],
          ],
        },
        explicacion: 'Es un trigger que corre cada vez que se publica un producto. Así nadie le compra por transferencia a un comercio que no tiene dónde recibirla. Mientras falte, el panel muestra un cartel rojo y llega un recordatorio cada 6 horas.',
      },
      { h: 3, t: '18.3 Publicaciones (publicar un producto)' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'const productData = {', hasta: "if (error && error.hint === 'missing_transfer_alias') {", sigue: true,
          notas: [
            ['title: titleValue,', 'Junta los datos del formulario: nombre, precio, stock, oferta y descripción'],
            [".from('categories').select('id').eq('slug', slug)", 'Busca el código de la categoría elegida'],
            ['if (isEditing) {', 'Si se está editando, actualiza el producto'],
            [".from('products').insert([productData])", 'Si es nuevo, lo crea a nombre del comercio'],
            ["error.hint === 'missing_transfer_alias'", 'Si falta el alias o CBU, la base lo rechaza (ver 18.2) y el panel lo explica'],
          ],
        },
        explicacion: 'Las fotos se suben después, a la carpeta del producto en el almacenamiento de Supabase. Las opciones (colores, talles, sabores) se guardan en las tablas `product_options` y `product_option_values`.',
      },
      { h: 3, t: '18.4 Ventas: pedidos en vivo' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'async function loadOrders(ids = null)', max: 22, sigue: true,
          notas: [
            ["await supabase.rpc('get_store_orders'", 'Una sola consulta trae los pedidos con sus productos, comprobantes, entrega y comprador'],
            ['p_order_ids: ids,', 'Si se le pasan números de pedido, trae solo esos (los que cambiaron)'],
            ['ordCache = [...kept, ...added]', 'Mezcla lo nuevo con lo que ya estaba en pantalla, sin redibujar todo'],
          ],
        },
        explicacion: 'Con el tiempo real (módulo 22.1), cuando entra un pedido nuevo aparece solo en la lista, resaltado, y suena un aviso. Junto al título se ve "En vivo" mientras la conexión está activa.',
      },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'async function advanceOrder(order, next, btn)',
          notas: [
            ['const ok = await confirmDialog(question', 'Pregunta antes de avisarle al comprador'],
            ["await runOrderRpc('advance_order_status'", 'La base cambia el estado ("listo para retirar" o "en camino") y le manda el aviso al comprador'],
          ],
        },
        explicacion: 'El estado de un pedido no se puede cambiar a mano desde la página: solo con estas funciones de la base, que controlan que el paso tenga sentido.',
      },
      { h: 3, t: '18.5 Mis cupones' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'function setupMyCouponForm()', max: 34,
          notas: [
            ['.toUpperCase()', 'El código se guarda en mayúsculas'],
            ['discountNum < 1 || discountNum > 100', 'El descuento tiene que ser entre 1% y 100%'],
            [".from('coupons').insert({", 'Crea el cupón para este comercio'],
          ],
        },
      },
      { h: 3, t: '18.6 Empleados' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'function setupStoreStaffForm()',
          notas: [["supabase.rpc('add_store_staff'", 'La base busca la cuenta con ese email y la suma como empleada (solo si quien lo pide es el dueño)']],
        },
        explicacion: 'El empleado entra al mismo panel, pero solo ve las secciones que el dueño le habilite (permisos).',
      },
      { h: 3, t: '18.7 Impulsá tus ventas' },
      {
        bloque: {
          archivo: 'js/vender.js', desde: 'async function chooseBoostPlan(plan)', max: 26,
          notas: [
            ['const ok = await confirmDialog(', 'Muestra el precio y la duración antes de pagar'],
            ["supabase.functions.invoke('mp-create-boost-preference'", 'Una función en la nube arma el cobro en Mercado Pago'],
            ['window.location.href = url;', 'Lleva a la página de pago de Mercado Pago'],
          ],
        },
        explicacion: 'Los precios de los combos están en la tabla `boost_plans`. Cuando Mercado Pago confirma el pago, el combo se activa solo y el comercio aparece primero en "Comercios destacados".',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '19. Panel de profesional' },
      { p: 'Archivos: `pages/profesional.html` y `js/profesional.js`, con un archivo por sección: `profesional-servicios.js`, `profesional-disponibilidad.js` (horarios y zonas), `profesional-galeria.js` (fotos), `profesional-consultas.js`, `profesional-resenas.js` y `profesional-metricas.js` (estadísticas).' },
      { h: 3, t: '19.1 Activar/Pausar publicación' },
      {
        bloque: {
          archivo: 'js/profesional.js', desde: 'async function alternarPausa(btn)',
          notas: [
            ["!(await confirmDialog('Si pausás", 'Antes de pausar, avisa que deja de aparecer en Contratar'],
            [".update({ is_active: nuevoEstado })", 'Cambia el estado de la publicación en la tabla professionals'],
          ],
        },
      },
      { h: 3, t: '19.2 Horarios de atención' },
      {
        bloque: {
          archivo: 'js/professional-hours-utils.js', desde: 'export function agruparDiasIguales(porDia)',
          notas: [
            ['for (const dia of ORDEN_SEMANA)', 'Recorre la semana de lunes a domingo'],
            ['if (ultimo && ultimo.texto === texto', 'Si el día tiene el mismo horario que el anterior, lo suma al grupo ("Lun a Vie")'],
          ],
        },
        explicacion: 'Así la tarjeta de Contratar muestra "Lun a Vie 08:00 a 13:00" en vez de cinco líneas iguales. La base guarda una fila por día.',
      },
      { h: 3, t: '19.3 Consultas' },
      {
        bloque: {
          archivo: 'js/profesional-consultas.js', desde: 'async function cambiarEstado(consulta, nuevoEstado, btn)',
          notas: [[".from('professional_inquiries')", 'Las consultas que mandan los vecinos están en la tabla professional_inquiries']],
        },
        explicacion: 'Cada consulta tiene un estado (nueva, respondida, cerrada) que el profesional cambia con los botones de la tarjeta.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '20. Panel del repartidor' },
      { p: 'Archivos: `pages/repartidor.html` y `js/repartidor.js`. El repartidor ve dos listas: "Mis entregas en curso" y "Pedidos disponibles". Cada entrega pasa por tres etapas: Tomado, En camino y Entregado.' },
      { h: 3, t: '20.1 Actualizar el panel' },
      {
        bloque: {
          archivo: 'js/repartidor.js', desde: 'async function loadPanel()',
          notas: [
            ['if (loading) { reloadAgain = true; return; }', 'Si ya se estaba cargando, no lo pide dos veces'],
            ["await supabase.rpc('get_courier_panel')", 'Una sola consulta trae "Mis entregas" y los pedidos disponibles'],
          ],
        },
      },
      { h: 3, t: '20.2 Pedido tomado' },
      {
        bloque: {
          archivo: 'js/repartidor.js', desde: 'async function takeOrder(order, card, btn)',
          notas: [
            ["await supabase.rpc('claim_delivery'", 'Pide tomar el pedido; la base controla que nadie más lo haya tomado'],
            ['card.remove();', 'Si otro repartidor lo tomó antes, la tarjeta desaparece'],
          ],
        },
      },
      {
        bloque: {
          archivo: 'db/schema/139_courier_flow.sql', desde: 'create or replace function public.claim_delivery(p_order_id uuid)', hasta: "raise exception 'Este pedido no está disponible para repartir.';", max: 44, sigue: true,
          notas: [
            ["!= 'repartidor' then", 'Solo un repartidor puede tomar pedidos'],
            ['if (select is_suspended', 'Una cuenta suspendida no puede'],
            ['perform pg_advisory_xact_lock', 'Pone en fila los pedidos del mismo repartidor para que no se pase del tope'],
            ['if v_active >= 3 then', 'Máximo 3 pedidos en curso a la vez'],
            ["if v_order.delivery_method != 'delivery'", 'Solo pedidos con envío, ya pagados y que el comercio no despachó'],
          ],
        },
        explicacion: 'Si dos repartidores tocan "Tomar" al mismo tiempo, la base deja que lo tome uno solo. El mensaje "Ya tenés 3 pedidos en curso" no es un error: es el tope.',
      },
      { h: 3, t: '20.3 En camino (retirar con foto)' },
      {
        bloque: {
          archivo: 'js/repartidor.js', desde: 'async function markPickedUp(d, btn)',
          notas: [
            ['const file = await pickPhoto();', 'Pide sacar una foto de los productos'],
            ["uploadEvidence(d.order_id, 'pickup', file)", 'La sube a un lugar privado (la ven solo el comercio y el administrador)'],
            ["runRpc('courier_mark_picked_up'", 'Marca el pedido "En camino"'],
          ],
        },
        explicacion: 'Antes, el comercio confirma en su panel que el repartidor retiró el pedido, escribiendo los últimos 4 números del pedido.',
      },
      { h: 3, t: '20.4 Entregado al cliente (cargar código)' },
      {
        bloque: {
          archivo: 'js/repartidor.js', desde: 'async function markDelivered(d, btn)',
          notas: [
            ['const res = await formDialog(', 'Pide el código de 4 números que el comprador ve en "Mis compras"'],
            ["p_new_status: 'delivered'", 'Si el código es correcto, el pedido queda entregado'],
          ],
        },
        explicacion: 'Sin el código del comprador no se puede marcar como entregado: es la prueba de que el pedido llegó a la persona correcta.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '21. Panel de administrador' },
      { p: 'No aparece en el Manual de usuario porque lo usa solo el equipo. Archivos: `pages/admin.html` y `js/admin.js`. Desde ahí se aprueban comercios y profesionales, se moderan reseñas y productos, se cargan farmacias y números de emergencia, se dan de alta repartidores y se responden los reclamos.' },
      { h: 3, t: '21.1 Quién puede entrar' },
      {
        bloque: {
          archivo: 'js/admin.js', desde: 'guardPage({', max: 6, sigue: true,
          notas: [["requireRole: ['admin', 'moderador']", 'Solo cuentas con rol administrador o moderador']],
        },
        explicacion: 'El rol de administrador se asigna a mano en Supabase (Authentication → Users). El moderador ve menos secciones: nada de dinero ni configuración.',
      },
      { h: 3, t: '21.2 Aprobar un comercio' },
      {
        bloque: {
          archivo: 'js/admin.js', desde: 'async function approveRequest(id)',
          notas: [["supabase.rpc('approve_seller_request'", 'La base aprueba la solicitud: crea el comercio y le da a la cuenta el rol de vendedor']],
        },
        explicacion: 'La función de la base vuelve a comprobar que quien aprueba sea administrador. Ocultar el botón no alcanza: la seguridad tiene que estar en la base.',
      },

      // ---------------------------------------------------------------------
      { h: 2, t: '22. Piezas compartidas y seguridad' },
      { p: 'No son una pantalla, pero las usan todas. Tampoco están en el Manual de usuario.' },
      { h: 3, t: '22.1 Tiempo real' },
      {
        bloque: {
          archivo: 'js/realtime-utils.js', desde: 'export function subscribeToChanges(name, sources, onChange, { onResync, onStatus } = {})', max: 20, sigue: true,
          notas: [
            ['const channel = supabase.channel(', 'Abre un "canal" con la base de datos'],
            ["channel.on('postgres_changes', spec", 'Escucha los cambios de las tablas pedidas (por ejemplo, pedidos nuevos)'],
            ['onChange({', 'Cada cambio se le pasa a la página para que se actualice sola'],
          ],
        },
        explicacion: 'Gracias a esto, un pedido nuevo, un aviso o una reseña aparecen sin recargar la página. Si la conexión se corta, la página vuelve a pedir los datos al reconectarse.',
      },
      { h: 3, t: '22.2 Mensajes de error claros' },
      {
        bloque: {
          archivo: 'js/friendly-error.js', desde: 'export function friendlyError(error, fallback = DEFAULT_MESSAGE)',
          notas: [
            ['if (isHumanMessage(text))', 'Si el error ya es un mensaje en español escrito por el equipo, se muestra tal cual'],
            ['if (isFetchFailure(error, text))', 'Si se cortó internet, avisa eso'],
            ['return fallback;', 'Si no, un mensaje general ("No se pudo…")'],
          ],
        },
      },
      { h: 3, t: '22.3 Carteles de confirmación' },
      {
        bloque: {
          archivo: 'js/confirm-dialog.js', desde: 'export function confirmDialog(message, options = {})',
          notas: [
            ["confirmText = 'Aceptar',", 'Textos de los botones; cada uso puede cambiarlos ("Eliminar", "Sí, pausar"…)'],
            ['return new Promise', 'Espera a que la persona toque un botón y devuelve sí o no'],
          ],
        },
        explicacion: 'Es el cartel propio del sitio que aparece antes de borrar, vaciar o cancelar algo (reemplaza al cartel gris del navegador).',
      },
      { h: 3, t: '22.4 Reglas de seguridad de la base de datos' },
      {
        bloque: {
          archivo: 'db/schema/97_lock_down_request_status_on_insert.sql', desde: 'create policy seller_requests_insert_own', hasta: "with check (auth.uid() = user_id and status = 'pending');",
          notas: [
            ['on public.seller_requests for insert to authenticated', 'Regla para crear solicitudes de comercio, solo con sesión iniciada'],
            ["with check (auth.uid() = user_id and status = 'pending');", 'Solo se puede crear la propia, y siempre como "pendiente"'],
          ],
        },
        explicacion: 'La clave que usa la página es pública: cualquiera podría usarla. Lo que protege los datos son estas reglas, que la base revisa en cada consulta. Por ejemplo, esta impide que alguien se mande su propia solicitud ya "aprobada".',
      },
      { h: 3, t: '22.5 Protecciones del sitio publicado' },
      {
        bloque: {
          archivo: 'vercel.json', desde: '{ "key": "X-Content-Type-Options"', hasta: '{ "key": "Permissions-Policy"',
          notas: [
            ['X-Frame-Options', 'Impide que otra página muestre Baradero Local adentro de un recuadro (protege contra engaños)'],
            ['Permissions-Policy', 'Bloquea cámara y micrófono; la ubicación queda solo para el mapa del inicio'],
          ],
        },
      },
    ],
  },

  // =========================================================================
  {
    titulo: 'Resolución de problemas y FAQ',
    partes: [
      { h: 2, t: '1. Mensajes de error habituales' },
      { p: 'Errores que pueden aparecer al trabajar con el código (los que ve el usuario están en el Manual de usuario).' },
      {
        tabla: {
          cabecera: ['Mensaje', 'Causa', 'Solución'],
          filas: [
            ['"supabaseUrl is required" o la página no carga datos', 'Falta el archivo `.env` o está mal escrito.', 'Crear el `.env` como dice la Guía de inicio rápido, punto 2.2, y volver a correr `npm run dev`.'],
            ['"new row violates row-level security policy" o "permission denied"', 'Una regla de seguridad de la base no deja hacer eso con esa cuenta.', 'Revisar que la cuenta tenga el rol correcto y la política de esa tabla (módulo 22.4). No se arregla desde la página.'],
            ['"Refused to connect to …" en la consola del navegador', 'La línea de seguridad (CSP) de la página no permite conectarse a ese sitio.', 'Agregar el sitio en el `Content-Security-Policy` de todas las páginas. La prueba `js/csp.test.mjs` lo controla.'],
            ['"Para publicar productos, el comercio tiene que cargar un medio de transferencia…"', 'El comercio no tiene alias ni CBU/CVU (módulo 18.2).', 'Cargar uno en Perfil de mi comercio → Transferencia bancaria.'],
            ['"Ya tenés 3 pedidos en curso…"', 'Es el tope del repartidor, no un error.', 'Entregar un pedido para poder tomar otro.'],
            ['"Edge Function returned a non-2xx status code"', 'Una función en la nube respondió con un error.', 'La página muestra el motivo con `friendlyFunctionError`; el detalle está en Supabase → Edge Functions → Logs.'],
            ['`npm test` falla en Windows con un error de "for" o "sh"', 'El atajo de pruebas usa comandos de Linux/Mac.', 'Correr las pruebas desde Git Bash, o de a una: `node js/cart-totals.test.mjs`.'],
            ['Falla la prueba `dark-css.test.mjs`', 'Se cambió un color en el CSS y no se regeneró el modo oscuro.', 'Correr `node scripts/gen-dark-css.mjs` y volver a probar.'],
            ['El cambio no aparece en la página publicada', 'No se unió a `main`, el deploy de Vercel falló o el navegador tiene la versión vieja.', 'Revisar el deploy en Vercel y recargar la página (Ctrl + F5).'],
            ['Conflictos en archivos de `dist/` al unir ramas', '`dist/` se guarda en Git y sus nombres cambian en cada construcción.', 'Quedarse con cualquiera de las dos versiones y volver a correr `npm run build`.'],
            ['El generador del manual dice "no se encontró …"', 'El código de ese bloque cambió y el texto de inicio ya no está.', 'Actualizar ese bloque en `scripts/manual-programador/contenido.mjs` y volver a generar.'],
          ],
        },
      },

      { h: 2, t: '2. Dudas frecuentes' },
      { h: 3, t: '¿Cómo agrego una categoría nueva?' },
      { p: 'Con una migración nueva en `db/schema/` que agregue la fila a la tabla `categories` (como `121_categoria_supermercado.sql`) y su ícono en `CATEGORY_ICONS` de `js/nav-utils.js` (módulo 2.1).' },
      { h: 3, t: '¿Cómo agrego una página nueva?' },
      { p: 'Copiar el encabezado de una página parecida (con su línea de seguridad, el script del modo oscuro, `dark.css` y `theme.js`), anotarla en `vite.config.js` (Guía 3.1) y correr `npm test`, que controla que no falte nada.' },
      { h: 3, t: '¿Dónde se cambia el precio de los combos de "Impulsá tus ventas"?' },
      { p: 'En la tabla `boost_plans` de la base. La pantalla y el cobro leen la misma fila, así que alcanza con cambiar el precio ahí.' },
      { h: 3, t: '¿Dónde se cambia el costo de envío?' },
      { p: 'Cada comercio tiene el suyo en la tabla `stores` (columna `delivery_fee`, que arranca en $350). Hoy no hay un campo para cambiarlo en el panel: se cambia en la base de datos. El carrito usa el mismo $350 de respaldo (`DEFAULT_DELIVERY_FEE` en `js/cart-totals.js`) si todavía no lo leyó.' },
      { h: 3, t: '¿Cómo se hace administrador a una cuenta?' },
      { p: 'En Supabase → Authentication → Users → la cuenta → `raw_app_meta_data`, poniendo `{"role": "admin"}`. No hay forma de hacerlo desde la página, a propósito.' },
      { h: 3, t: '¿Cómo se aplica un cambio a la base de datos?' },
      { p: 'Se escribe un archivo nuevo en `db/schema/` con el número siguiente y se corre en Supabase (SQL Editor). Nunca se edita un archivo ya aplicado.' },
      { h: 3, t: '¿Los precios tienen centavos?' },
      { p: 'No. Todo el sistema trabaja con pesos enteros.' },
      { h: 3, t: '¿Cómo vuelvo a generar este manual?' },
      { pre: 'node scripts/manual-programador/generar.mjs' },
      { p: 'Deja el manual actualizado en `docs/manual-programador/` (en Markdown para GitHub y en HTML para importar a Google Docs).' },

      { h: 2, t: '3. Pruebas automáticas' },
      { p: 'Las pruebas controlan solas que las funciones más delicadas den el resultado correcto (la cuenta del carrito, los horarios, los medios de pago…). Se corren todas juntas antes de publicar:' },
      { pre: 'npm test' },
      {
        bloque: {
          archivo: 'js/cart-totals.test.mjs', desde: 'check("un cupón de vendedor va solo a su tienda"', lineas: 4,
          notas: [['assert.equal(discountPctForStore(20, "A", "A"), 20);', 'Un cupón del 20% del comercio A vale 20% en A…'], ['assert.equal(discountPctForStore(20, "A", "B"), 0);', '…y 0% en el comercio B']],
        },
        explicacion: 'Cada prueba dice qué debería pasar y lo comprueba. Si alguien cambia el código y rompe esa regla, la prueba avisa con "FALLA" antes de que llegue a la página publicada. La lista completa de pruebas está en el Anexo A.3.',
      },
    ],
  },

  // =========================================================================
  {
    titulo: 'Canales de soporte y contacto',
    partes: [
      { h: 2, t: '1. Contactos' },
      {
        tabla: {
          cabecera: ['Para qué', 'Dónde'],
          filas: [
            ['Consultas de usuarios y comercios', 'soporte@baraderolocal.com.ar (el correo que figura en el pie de la página → Ayuda)'],
            ['Reclamos dentro de la página', 'Mi perfil → Soporte. Quedan en la tabla `support_tickets` y se responden desde el panel de administrador.'],
            ['Tareas y errores del equipo de desarrollo', 'Jira, proyecto A113 (baraderolocal.atlassian.net)'],
            ['Código y cambios', 'GitHub, repositorio `fac7n3/ProyectoPdisc`'],
          ],
        },
      },
      { h: 2, t: '2. Horarios de atención' },
      { p: 'Responderemos a sus consultas entre las 08:00 y 14:00 hrs, hora Argentina, en un tiempo estimado de 1 hora luego de que nos haya mandado su email.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Anexo A: inventario. Las filas se arman solas recorriendo las carpetas; acá
// va solo la descripción de cada archivo. Un archivo nuevo sin descripción
// sale igual, con un aviso al generar.
// ---------------------------------------------------------------------------

export const inventario = {
  intro: [
    { p: 'Todos los archivos con código del proyecto y qué hace cada uno, para encontrar rápido dónde está cada cosa. Esta lista se arma sola al generar el manual. Junto con los bloques de los módulos, cubre el proyecto entero: cada archivo aparece acá aunque no tenga un bloque propio arriba.' },
  ],
  descripciones: {
    // Páginas
    'index.html': 'Entrada del sitio: manda directo al inicio.',
    'pages/admin.html': 'Panel de administrador y de moderación.',
    'pages/carrito.html': 'Mi carrito y el pago.',
    'pages/comercio.html': 'Página pública de un comercio (con la vista previa para el dueño).',
    'pages/comercios.html': 'Lista de todos los comercios.',
    'pages/contratar.html': 'Directorio de profesionales y técnicos ("Contratar").',
    'pages/farmacias.html': 'Farmacias de turno.',
    'pages/home.html': 'Inicio.',
    'pages/info.html': 'Ayuda y preguntas frecuentes.',
    'pages/login.html': 'Iniciar sesión.',
    'pages/nueva-contrasena.html': 'Elegir una contraseña nueva (link del email de recuperación).',
    'pages/perfil.html': 'Mi perfil: datos, direcciones, compras, favoritos, soporte y ajustes.',
    'pages/privacidad.html': 'Política de privacidad.',
    'pages/producto.html': 'Página propia de un producto (la que se abre desde un link compartido).',
    'pages/profesional.html': 'Panel de profesional/técnico.',
    'pages/recuperar-password.html': 'Pedir el email para recuperar la contraseña.',
    'pages/register.html': 'Registrarse.',
    'pages/repartidor.html': 'Panel del repartidor.',
    'pages/search.html': 'Búsqueda, categorías y filtros.',
    'pages/servicios.html': 'Números de emergencia y veterinarias.',
    'pages/terminos.html': 'Términos y condiciones.',
    'pages/vender.html': 'Alta de comercio o profesional y panel de comerciante.',

    // JavaScript
    'js/account-switcher.js': 'Botón "Cambiar de cuenta" de Mi perfil.',
    'js/address-suggest-utils.js': 'Ayudas del autocompletado de direcciones (OpenStreetMap).',
    'js/admin.js': 'Todo el panel de administrador.',
    'js/auth-utils.js': 'Conexión con Supabase, sesión, portero de páginas (guardPage), avisos cortos y qué panel tiene cada cuenta.',
    'js/boost-plans.js': 'Pantalla de los combos de "Impulsá tus ventas".',
    'js/boost-utils.js': 'Reglas de los combos de "Impulsá tus ventas" (si está vigente, cuándo vence).',
    'js/carrito.js': 'La página del carrito: lista agrupada por comercio, cupón, envío, medio de pago e iniciar pago.',
    'js/cart-totals.js': 'La cuenta del total del carrito (igual a la de la base).',
    'js/cart-utils.js': 'Guardar el carrito, botones "Agregar", favoritos, precios y tarjetas.',
    'js/comercio.js': 'Página de un comercio: encabezado, productos, reseñas y edición para el dueño.',
    'js/comercios.js': 'Lista de comercios con su rubro.',
    'js/confirm-dialog.js': 'Carteles propios de confirmación y de formulario corto.',
    'js/contratar.js': 'Directorio "Contratar" y el formulario de pedir presupuesto.',
    'js/courier-utils.js': 'Reglas del panel de repartidor (etapas, tiempos, colores de demora).',
    'js/datepicker.js': 'Selector de fecha propio.',
    'js/delivery-evidence.js': 'Fotos de la entrega (retiro y recepción).',
    'js/dropdown.js': 'Desplegable propio, en lugar del del navegador.',
    'js/error-logger.js': 'Anota los errores de la página en la base, sin datos sensibles.',
    'js/farmacias.js': 'Farmacias de turno: cuál está de turno ahora y la semana.',
    'js/friendly-error.js': 'Convierte errores técnicos en mensajes claros.',
    'js/hints-utils.js': 'Ayudas cortas del carrito.',
    'js/home-promos-editor.js': 'Editor del banner del inicio (para el comercio y el administrador).',
    'js/home-promos-utils.js': 'Reglas de los banners del inicio.',
    'js/home.js': 'Todo el inicio: banners, comercios, recomendados, ofertas, esenciales y mapa.',
    'js/image-crop-utils.js': 'Cuentas del recorte de fotos.',
    'js/image-cropper.js': 'Ventana para recortar y encuadrar fotos.',
    'js/info-faq.js': 'Atajos de las preguntas frecuentes.',
    'js/interests-utils.js': 'Cálculo de los intereses para "Productos recomendados".',
    'js/interests.js': 'Recuerda qué productos se miraron (en el navegador).',
    'js/linked-accounts-utils.js': 'Reglas de la lista de cuentas guardadas.',
    'js/linked-accounts.js': 'Guarda las cuentas para "Cambiar de cuenta".',
    'js/login.js': 'Iniciar sesión (correo y Google).',
    'js/mp-chain-utils.js': 'Pago con Mercado Pago de a un comercio por vez.',
    'js/nav-utils.js': 'El header: categorías, buscador, campanita y menú de la cuenta.',
    'js/notifications-live.js': 'Notificaciones en tiempo real.',
    'js/notifications-utils.js': 'Centro de notificaciones: textos, filtros, marcar como leídas.',
    'js/nueva-contrasena.js': 'Guardar la contraseña nueva.',
    'js/order-utils.js': 'Pedidos: número, estados, próximo paso y línea de tiempo.',
    'js/panel-onboarding-utils.js': 'Cartel de bienvenida de cada panel.',
    'js/panel-redirect-utils.js': 'Preferencia "entrar directo a mi panel".',
    'js/payment-providers.js': 'Los medios de pago: qué hace cada uno al pagar.',
    'js/perfil.js': 'Todo Mi perfil.',
    'js/phone-countries.js': 'Lista de códigos de país para los teléfonos.',
    'js/product-detail-api.js': 'Pide a la base el detalle de un producto.',
    'js/product-detail-utils.js': 'Reglas del pedido del detalle (adelantarlo al pasar el mouse).',
    'js/product-draft.js': 'Borrador del producto que se está cargando (sobrevive a recargar).',
    'js/product-modal.js': 'La ventana del producto: fotos, opciones, cantidad, carrito, reseñas y relacionados.',
    'js/product-options-utils.js': 'Opciones de producto (color, sabor, talle).',
    'js/producto.js': 'La página propia de un producto.',
    'js/profesional-consultas.js': 'Panel de profesional: Consultas.',
    'js/profesional-disponibilidad.js': 'Panel de profesional: Horarios y zona.',
    'js/profesional-galeria.js': 'Panel de profesional: Fotos de trabajos.',
    'js/profesional-metricas.js': 'Panel de profesional: Estadísticas.',
    'js/profesional-resenas.js': 'Panel de profesional: Reseñas y respuestas.',
    'js/profesional-servicios.js': 'Panel de profesional: Servicios y precios.',
    'js/profesional.js': 'Panel de profesional: resumen, mis datos, pausa y foto.',
    'js/professional-categories.js': 'Categorías fijas de Contratar.',
    'js/professional-hours-utils.js': 'Horarios de los profesionales (agrupar días, "abierto ahora").',
    'js/professional-service-utils.js': 'Servicios y precios de los profesionales.',
    'js/professional-zones.js': 'Zonas de trabajo que puede elegir un profesional.',
    'js/profile-fields.js': 'Los datos de "Información de tu perfil".',
    'js/realtime-utils.js': 'Tiempo real: escuchar cambios de la base.',
    'js/recuperar-password.js': 'Pedir el email de recuperación.',
    'js/register.js': 'Registrarse (correo y Google).',
    'js/repartidor.js': 'Panel del repartidor.',
    'js/reviews-utils.js': 'Reseñas: estrellas, lista y formulario.',
    'js/scroll-top-btn.js': 'Botón de volver arriba.',
    'js/search-analytics.js': 'Anota búsquedas y productos vistos (para el informe del administrador).',
    'js/search.js': 'Página de búsqueda y filtros.',
    'js/servicios.js': 'Números de emergencia.',
    'js/settings-utils.js': 'Preferencias de Ajustes.',
    'js/speed-insights.js': 'Medición de velocidad de Vercel.',
    'js/storage-utils.js': 'Borrar fotos guardadas en Supabase.',
    'js/store-contact-utils.js': 'Contacto por WhatsApp y redes del comercio, con links seguros.',
    'js/store-products-order.js': 'Orden de los productos de un comercio (ofertas primero).',
    'js/supabase-config.js': 'Dirección y clave pública de Supabase (leídas del .env).',
    'js/support-utils.js': 'Soporte: reclamos, adjuntos y respuestas.',
    'js/theme-utils.js': 'Reglas del modo claro/oscuro.',
    'js/theme.js': 'Botón y aplicación del modo claro/oscuro.',
    'js/toast-utils.js': 'Avisos emergentes de notificaciones (abajo a la derecha).',
    'js/transfer-details-utils.js': 'Qué datos de transferencia se muestran al pagar.',
    'js/transfer-details.js': 'Tarjeta "Cómo transferirle a este comercio".',
    'js/validation-utils.js': 'Validaciones de formularios compartidas.',
    'js/vender-shell.js': 'Menú lateral y secciones de los paneles.',
    'js/vender.js': 'Alta de comercio/profesional y todo el panel de comerciante.',

    // Estilos
    'Assets/styles/a11y.css': 'Accesibilidad: foco visible y "Reducir animaciones".',
    'Assets/styles/account-switcher-page.css': 'Aviso de "necesitás otra cuenta" en el alta de profesional.',
    'Assets/styles/admin.css': 'Panel de administrador.',
    'Assets/styles/auth.css': 'Iniciar sesión, registro y contraseñas.',
    'Assets/styles/carrito.css': 'Carrito.',
    'Assets/styles/dark-auto.css': 'Modo oscuro generado solo (no se edita a mano).',
    'Assets/styles/dark.css': 'Ajustes a mano del modo oscuro.',
    'Assets/styles/home.css': 'Estilos compartidos: colores de marca, header, tarjetas, botones, inicio.',
    'Assets/styles/perfil-custom.css': 'Mi perfil.',
    'Assets/styles/product-modal.css': 'Ventana del producto.',
    'Assets/styles/profesional.css': 'Panel de profesional.',
    'Assets/styles/repartidor.css': 'Panel del repartidor.',
    'Assets/styles/styles.css': 'Estilos viejos, hoy sin uso (no lo carga ninguna página).',

    // Funciones en la nube
    'supabase/functions/delete-account': 'Borra la cuenta de quien lo pide (con sus chequeos).',
    'supabase/functions/mp-create-boost-preference': 'Arma el cobro de un combo de "Impulsá tus ventas".',
    'supabase/functions/mp-create-preference': 'Arma el cobro de un pedido en Mercado Pago, a nombre del comercio.',
    'supabase/functions/mp-oauth-callback': 'Termina de vincular la cuenta de Mercado Pago de un comercio.',
    'supabase/functions/mp-oauth-start': 'Empieza la vinculación de la cuenta de Mercado Pago de un comercio.',
    'supabase/functions/mp-webhook': 'Recibe los avisos de Mercado Pago y confirma los pagos.',

    // Herramientas
    'scripts/gen-dark-css.mjs': 'Genera `dark-auto.css` (el modo oscuro de los colores escritos a mano).',
    'scripts/jira-backfill-commits.mjs': 'Crea tareas de Jira a partir de commits viejos.',
    'scripts/jira-commit-log.mjs': 'Cierra en Jira las tareas nombradas en cada commit.',
    'scripts/jira-create-subtasks-m2-m11.mjs': 'Creó el tablero de Jira de las fases 2 a 11.',
    'scripts/jira-create-subtasks.mjs': 'Creó el tablero de Jira de las fases 0 y 1.',
    'scripts/jira-move.mjs': 'Mueve una tarea de Jira de estado (por hacer, en curso, finalizada).',
    'scripts/optimize-images.mjs': 'Convierte imágenes pesadas a WebP.',
  },
};
