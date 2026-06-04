# 🏪 Baradero Local

> *"Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."*

**Baradero Local** es una plataforma digital y catálogo interactivo diseñado para potenciar el comercio de proximidad en la ciudad de Baradero. Permite a los vecinos explorar y comprar productos de tiendas locales directamente desde sus hogares, y a los comerciantes registrar sus negocios y gestionar sus ventas a través de un panel especializado.

---

## ✨ Características Principales

*   🔐 **Autenticación Completa con Supabase**: Inicio de sesión y registro de usuarios (como clientes o vendedores) mediante correo electrónico o de forma rápida a través de **Google OAuth**.
*   🛒 **Catálogo Interactivo**: Visualización dinámica de productos locales con funcionalidades de agregar al carrito, marcar favoritos y filtros instantáneos por categorías (Lácteos, Carnes, Verduras, Farmacia, Limpieza, etc.).
*   🏪 **Panel del Vendedor**: Área exclusiva para comerciantes locales donde pueden registrar su negocio y visualizar estadísticas clave (ventas del día, productos activos e ingresos mensuales).
*   📱 **Diseño Moderno y Responsivo**: Interfaz fluida, pulida y adaptada tanto para dispositivos móviles como pantallas de escritorio, con transiciones y micro-animaciones premium.
*   🏥 **Servicio de Utilidad Pública**: Sección integrada que informa las farmacias de turno activas en la ciudad.

---

## 🛠️ Tecnologías Utilizadas

*   **Frontend**: HTML5 semántico, CSS3 moderno (utilizando variables nativas, layouts Flexbox/Grid y efectos de diseño premium) y JavaScript modular (ES6+).
*   **Backend as a Service (BaaS)**: [Supabase](https://supabase.com/) para la gestión de usuarios, base de datos relacional (PostgreSQL) y autenticación segura.
*   **Herramienta de Construcción**: [Vite](https://vitejs.dev/) para el desarrollo ágil y bundling de assets.

---

## 📁 Estructura del Proyecto

El código está organizado de la siguiente manera:

```text
Proyecto-Pdisc/
├── Assets/                # Recursos de diseño y estilos
│   ├── images/            # Imágenes estáticas (Logos, banners, productos)
│   └── styles/            # Hojas de estilo CSS (home.css, auth.css, styles.css)
├── db/
│   └── schema/            # Scripts SQL para configurar la base de datos en Supabase
├── docs/                  # Guías de desarrollo y análisis técnico
├── js/                    # Lógica de negocio e integraciones en JavaScript
│   ├── auth-utils.js      # Helpers de autenticación, notificaciones y redirecciones
│   ├── home.js            # Control del catálogo, filtros y carrito en la Home
│   ├── login.js           # Lógica del formulario de inicio de sesión
│   ├── register.js        # Lógica del formulario de registro y roles
│   ├── vender.js          # Control de panel y flujo de comercios locales
│   └── supabase-config.js # Configuración de variables de entorno de Supabase
├── pages/                 # Páginas HTML de la aplicación
│   ├── home.html          # Portal principal y catálogo
│   ├── login.html         # Pantalla de inicio de sesión
│   ├── register.html      # Pantalla de creación de cuenta
│   ├── perfil.html        # Panel de perfil de usuario autenticado
│   └── vender.html        # Portal de vendedores y registro de comercios
├── .env.example           # Plantilla de variables de entorno requeridas
├── package.json           # Dependencias y scripts del proyecto
└── README.md              # Documentación principal del proyecto
```

---

## 🚀 Inicio Rápido (Desarrollo Local)

### Requisitos Previos

*   [Node.js](https://nodejs.org/) (Versión 20 o superior recomendada)
*   Una cuenta activa de [Supabase](https://supabase.com/) para conectar la autenticación y base de datos.

### Pasos para Configurar y Ejecutar

1.  **Clonar el repositorio y entrar al directorio:**
    ```bash
    cd Proyecto-Pdisc
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
    ```bash
    VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
    VITE_SUPABASE_ANON_KEY="tu-anon-key-de-supabase"
    ```

4.  **Configurar la Base de Datos:**
    Copia y ejecuta el contenido del script SQL ubicado en [db/schema/01_auth_profiles.sql](file:///c:/Proyecto/Proyecto-Pdisc/db/schema/01_auth_profiles.sql) en el SQL Editor de tu panel de Supabase para configurar la tabla de perfiles y triggers de usuario.

5.  **Iniciar Servidor Local:**
    ```bash
    npm run dev
    ```
    Abre en tu navegador la URL dev que se muestra en la terminal (usualmente `http://localhost:5173`).

> [!NOTE]
> Para una guía detallada paso a paso sobre cómo configurar los Callback URLs de Google OAuth y Google Cloud Console, consulta la guía completa de [docs/RUN_LOCAL.md](file:///c:/Proyecto/Proyecto-Pdisc/docs/RUN_LOCAL.md).
