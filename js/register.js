import { supabase, showToast, setLoading, isValidEmail, checkUrlErrors, guardPage } from "./auth-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");
const registerNameInput = document.getElementById("register-name");
const registerBtn = document.getElementById("register-btn");
const googleRegisterBtn = document.getElementById("google-register-btn");
const termsCheckbox = document.getElementById("terms-checkbox");
// Un solo checkbox para ambas acciones (email y Google)

// --- Valida y resalta el checkbox de términos ---
function checkTermsAccepted(checkboxEl, labelId) {
  const label = document.getElementById(labelId);
  if (!checkboxEl?.checked) {
    label?.classList.add("auth-terms--error");
    setTimeout(() => label?.classList.remove("auth-terms--error"), 500);
    showToast("Debés aceptar los Términos y Condiciones para continuar.", "error");
    return false;
  }
  return true;
}

function disableAllInputs() {
  if (registerEmailInput) registerEmailInput.disabled = true;
  if (registerPasswordInput) registerPasswordInput.disabled = true;
  if (registerNameInput) registerNameInput.disabled = true;
  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.style.opacity = "0.6";
    registerBtn.style.cursor = "not-allowed";
  }
  if (googleRegisterBtn) {
    googleRegisterBtn.disabled = true;
    googleRegisterBtn.style.opacity = "0.6";
    googleRegisterBtn.style.cursor = "not-allowed";
  }
}

// --- Mapeo de errores de Supabase a mensajes claros en español ---
function mapRegisterError(error) {
  const msg = (error.message || "").toLowerCase();
  const status = error.status;

  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo electrónico. Intentá iniciar sesión.";
  }
  if (msg.includes("password") && msg.includes("at least")) {
    const match = error.message.match(/at least (\d+)/);
    const minLen = match ? match[1] : "6";
    return `La contraseña debe tener al menos ${minLen} caracteres.`;
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("too short") || msg.includes("too common"))) {
    return "La contraseña es muy débil. Usá al menos 6 caracteres con letras y números.";
  }
  if (msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "El correo electrónico no es válido. Verificá que esté bien escrito.";
  }
  if (msg.includes("email address") && msg.includes("invalid")) {
    return "El correo electrónico ingresado no es válido.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit") || msg.includes("email rate limit") || status === 429) {
    return "Demasiados intentos de registro. Esperá unos minutos antes de intentar de nuevo.";
  }
  if (msg.includes("signup is disabled") || msg.includes("signups not allowed")) {
    return "El registro de nuevas cuentas está deshabilitado temporalmente.";
  }
  if (msg.includes("database error")) {
    return "Error interno del servidor. Intentá de nuevo en unos minutos.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Error de conexión. Verificá tu conexión a internet.";
  }
  return "No se pudo crear la cuenta. Verificá los datos e intentá de nuevo.";
}

// --- Registro con email/contraseña ---
async function registerWithEmail() {
  // Validar aceptación de términos
  if (!checkTermsAccepted(termsCheckbox, "terms-label")) return;

  const email = registerEmailInput?.value?.trim() ?? "";
  const password = registerPasswordInput?.value ?? "";
  const name = registerNameInput?.value?.trim() ?? "";
  const accountType = document.querySelector('input[name="account_type"]:checked')?.value ?? "cliente";

  // Validaciones locales específicas
  if (!name) {
    showToast("Ingresá tu nombre y apellido.", "error");
    registerNameInput?.focus();
    return;
  }
  if (name.length < 2) {
    showToast("El nombre debe tener al menos 2 caracteres.", "error");
    registerNameInput?.focus();
    return;
  }
  if (!email) {
    showToast("Ingresá tu correo electrónico.", "error");
    registerEmailInput?.focus();
    return;
  }
  if (!isValidEmail(email)) {
    showToast("El formato del correo electrónico no es válido.", "error");
    registerEmailInput?.focus();
    return;
  }
  if (!password) {
    showToast("Ingresá una contraseña.", "error");
    registerPasswordInput?.focus();
    return;
  }
  // Validación básica
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    showToast("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número", "error");
    registerPasswordInput?.focus();
    return;
  }

  setLoading(registerBtn, true, "Crear cuenta");

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        }
      }
    });

    if (error) {
      console.error("Register error:", error);
      showToast(mapRegisterError(error), "error");
      setLoading(registerBtn, false, "Crear cuenta");
      return;
    }

    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      showToast("Ya existe una cuenta con ese correo. Intentá iniciar sesión.", "error");
      setLoading(registerBtn, false, "Crear cuenta");
      return;
    }

    // Éxito
    disableAllInputs();
    showToast("¡Cuenta creada con éxito! Revisá tu correo para confirmar el registro.", "success");

    setTimeout(() => {
      window.location.href = "../pages/login.html";
    }, 3500);
  } catch (err) {
    console.error("Unexpected register error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(registerBtn, false, "Crear cuenta");
  }
}

// --- Registro con Google ---
async function registerWithGoogle() {
  // Validar aceptación de términos (mismo checkbox que email)
  if (!checkTermsAccepted(termsCheckbox, "terms-label")) return;

  setLoading(googleRegisterBtn, true, "Crear cuenta con Google");

  try {
    const redirectTo = `${window.location.origin}/pages/home.html`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("Google register error:", error);
      showToast("No se pudo conectar con Google. Intentá de nuevo.", "error");
      setLoading(googleRegisterBtn, false, "Crear cuenta con Google");
    }
  } catch (err) {
    console.error("Unexpected Google register error:", err);
    showToast("Error de conexión con Google. Verificá tu internet.", "error");
    setLoading(googleRegisterBtn, false, "Crear cuenta con Google");
  }
}

// --- Manejadores de Eventos (se inicializan dentro del guard) ---
function initRegisterForm() {
  const registerForm = document.getElementById("register-form");
  registerForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    registerWithEmail();
  });

  googleRegisterBtn?.addEventListener("click", registerWithGoogle);

  // Alternar visibilidad de contraseña
  const toggleRegisterPasswordBtn = document.getElementById("toggle-register-password");
  toggleRegisterPasswordBtn?.addEventListener("click", () => {
    const type = registerPasswordInput.getAttribute("type") === "password" ? "text" : "password";
    registerPasswordInput.setAttribute("type", type);
    
    const icon = toggleRegisterPasswordBtn.querySelector("i");
    if (icon) {
      if (type === "text") {
        icon.className = "fa-regular fa-eye-slash";
        toggleRegisterPasswordBtn.setAttribute("aria-label", "Ocultar contraseña");
      } else {
        icon.className = "fa-regular fa-eye";
        toggleRegisterPasswordBtn.setAttribute("aria-label", "Mostrar contraseña");
      }
    }
  });

  // Verificar errores OAuth en la URL
  checkUrlErrors();
}

// --- Inicialización con Guard ---
// Página INVERSA: si hay sesión → redirigir a Home. Si no hay → mostrar formulario.
guardPage({
  redirectIfAuth: true,
  onReady: () => {
    initRegisterForm();
  },
});
