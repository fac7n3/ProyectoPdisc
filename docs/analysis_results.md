# Análisis de Fallas y Puntos de Mejora - Baradero Local

Este documento detalla una auditoría técnica del estado actual del proyecto, clasificando los hallazgos en vulnerabilidades de seguridad, experiencia de usuario (UX/Accessibility), y arquitectura/buenas prácticas.

---

## 1. Vulnerabilidades de Seguridad (Críticas)

### ⚠️ Escalada de Privilegios en la Tabla `public.profiles`
* **Problema:** La política RLS `profiles_update_own` permite a cualquier usuario autenticado actualizar su propio perfil sin restricciones de columnas:
  ```sql
  create policy profiles_update_own
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);
  ```
* **Impacto:** Cualquier usuario registrado (incluso como `cliente`) puede usar la API de Supabase en la consola del navegador para ejecutar un comando de actualización y cambiar su columna `role` a `vendedor` o `admin`.
* **Solución:**
  1. Crear un trigger `before update` en la base de datos que impida la modificación directa de la columna `role` por parte del usuario autenticado:
     ```sql
     create or replace function public.prevent_role_update()
     returns trigger as $$
     begin
       if old.role <> new.role then
         raise exception 'No está permitido modificar el rol del usuario directamente.';
       end if;
       return new;
     end;
     $$ language plpgsql;

     create trigger trigger_prevent_role_update
     before update on public.profiles
     for each row execute procedure public.prevent_role_update();
     ```

### ⚠️ Uso de `getSession()` para Validar la Sesión
* **Problema:** En `perfil.js` (y `login.js`/`register.js`), se usa `supabase.auth.getSession()` para verificar si el usuario tiene sesión activa.
* **Impacto:** `getSession()` recupera la sesión almacenada en el almacenamiento local del navegador (`localStorage`) sin verificar su validez real con el servidor de Supabase. Si el token está revocado o alterado, se podría intentar renderizar la página con información incorrecta hasta que falle la consulta a la base de datos.
* **Solución:** Cambiar el uso de `getSession()` por `supabase.auth.getUser()`. Este método realiza una llamada a la API del servidor para validar el JWT y es la práctica recomendada de seguridad por Supabase.

---

## 2. Experiencia de Usuario (UX) y Accesibilidad (A11y)

### ⚠️ Formularios no Semánticos
* **Problema:** Los inputs de inicio de sesión y registro en `login.html` y `register.html` están agrupados dentro de un `div.auth-inputs` y no dentro de un elemento `<form>` nativo de HTML.
* **Impacto:**
  1. **Autocompletado Deficiente:** Los gestores de contraseñas (1Password, Bitwarden, Google Password Manager) no detectan de forma fiable los formularios para guardar o autocompletar credenciales.
  2. **Teclados Móviles:** En dispositivos móviles, pulsar el botón "Ir" o "Enviar" del teclado del sistema no envía el formulario.
  3. **Eventos manuales redundantes:** Se tuvieron que programar listeners de eventos de teclado (`Enter` -> focus) en JS para simular la navegación básica.
* **Solución:** Envolver los inputs en un elemento `<form id="login-form">` (y `register-form`), quitar los event listeners manuales de la tecla `Enter`, y escuchar el evento `submit` del formulario usando `e.preventDefault()`.

### ⚠️ Falta de Etiquetas `<label>`
* **Problema:** Los campos de texto solo utilizan el atributo `placeholder` para indicar el tipo de dato requerido.
* **Impacto:** Al escribir, el placeholder desaparece. Un usuario con problemas de atención o memoria visual podría olvidar qué campo está editando. Además, los lectores de pantalla para personas con discapacidad visual no pueden enunciar correctamente los nombres de los inputs.
* **Solución:** Añadir un elemento `<label class="sr-only" for="correo">Correo electrónico</label>` a cada input. La clase `sr-only` oculta visualmente la etiqueta para mantener el diseño limpio, pero la hace accesible para tecnologías asistivas.

---

## 3. Manejo de Errores en OAuth (Google)

### ⚠️ Falta de Captura de Errores de Redirección OAuth
* **Problema:** Si el flujo de Google OAuth falla (ej. si el usuario cancela la autorización, o si el trigger de base de datos falla al guardar el nuevo perfil de Google), Supabase redirige de vuelta a la app con los detalles del error en la URL (ej. `#error=server_error&error_description=Database+error...`).
* **Impacto:** En el estado actual, el script de perfil redirecciona al usuario silenciosamente de vuelta al login si no hay sesión, pero el usuario **no sabrá por qué falló** el inicio de sesión con Google.
* **Solución:** En las páginas de login y registro, verificar si la URL contiene parámetros de error de Supabase Auth (como `error` o `error_description`) en el fragmento o query string, y mostrarlos en el panel de mensajes `auth-message`.

---

## 4. Arquitectura y Mantenibilidad del Código

### ⚠️ Dependencias Cargadas Dinámicamente desde CDN sin Versión Fija
* **Problema:** En el código actual, la biblioteca cliente de Supabase se importa mediante:
  ```javascript
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  ```
* **Impacto:** Al no fijar una versión menor o exacta (ej. `@supabase/supabase-js@2.43.1`), cualquier actualización mayor o cambios en el CDN de `esm.sh` podrían romper la funcionalidad de la aplicación sin previo aviso. Además, requiere de conexión a internet constante para desarrollo local.
* **Solución:**
  1. Instalar la librería localmente con `npm install @supabase/supabase-js`.
  2. Si se mantiene el enfoque sin bundler (Vite), usar una URL con versión fija y bloqueada (ej. `https://esm.sh/@supabase/supabase-js@2.43.0`).

### ⚠️ Credenciales en Archivo de Configuración de Control de Versiones
* **Problema:** Las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` están definidas directamente en el archivo `js/supabase-config.js` rastreado por Git.
* **Impacto:** Si bien la clave publishable/anónima es pública por diseño en Supabase, subirla al repositorio de control de versiones dificulta cambiar de entorno (ej. local, staging, producción) y expone la URL del proyecto directamente.
* **Solución:** Crear un proceso de compilación básico con Vite que use variables de entorno `.env` (ej. `import.meta.env.VITE_SUPABASE_URL`) y agregar `supabase-config.js` o los archivos `.env` reales al `.gitignore`.
