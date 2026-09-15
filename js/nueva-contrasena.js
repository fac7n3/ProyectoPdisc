import { supabase, showToast, setLoading, initPasswordToggle, checkUrlErrors } from "./auth-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

const mainContent = document.getElementById("main-content");
const loadingScreen = document.getElementById("loading-screen");
const formView = document.getElementById("newpass-form-view");
const invalidView = document.getElementById("newpass-invalid-view");
const successView = document.getElementById("newpass-success-view");
const form = document.getElementById("newpass-form");
const passwordInput = document.getElementById("new-password");
const passwordConfirmInput = document.getElementById("new-password-confirm");
const submitBtn = document.getElementById("newpass-btn");

function reveal() {
  if (loadingScreen) loadingScreen.style.display = "none";
  if (mainContent) mainContent.style.visibility = "visible";
}

function showForm() {
  formView.style.display = "block";
  reveal();
}

function showInvalidLink() {
  formView.style.display = "none";
  invalidView.style.display = "block";
  reveal();
}

async function updatePassword() {
  const password = passwordInput?.value ?? "";
  const passwordConfirm = passwordConfirmInput?.value ?? "";

  if (!password) {
    showToast("Ingresá tu nueva contraseña.", "error");
    passwordInput?.focus();
    return;
  }
  // Misma regla que en el registro (js/register.js).
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    showToast("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número", "error");
    passwordInput?.focus();
    return;
  }
  if (!passwordConfirm) {
    showToast("Repetí la contraseña para confirmarla.", "error");
    passwordConfirmInput?.focus();
    return;
  }
  if (password !== passwordConfirm) {
    showToast("Las contraseñas no coinciden.", "error");
    passwordConfirmInput?.focus();
    passwordConfirmInput?.select();
    return;
  }

  setLoading(submitBtn, true, "Guardar nueva contraseña");

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("Update password error:", error);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("least"))) {
        showToast("La contraseña es muy débil. Probá con otra.", "error");
      } else if (msg.includes("should be different")) {
        showToast("La nueva contraseña tiene que ser distinta a la anterior.", "error");
      } else {
        showToast("No se pudo actualizar la contraseña. Intentá de nuevo.", "error");
      }
      setLoading(submitBtn, false, "Guardar nueva contraseña");
      return;
    }

    // Cierra la sesión de recuperación: que vuelva a entrar con la
    // contraseña nueva, en vez de quedar logueado acá mismo.
    await supabase.auth.signOut();
    formView.style.display = "none";
    successView.style.display = "block";
  } catch (err) {
    console.error("Unexpected update password error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(submitBtn, false, "Guardar nueva contraseña");
  }
}

function initForm() {
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    updatePassword();
  });
  initPasswordToggle("toggle-new-password", passwordInput);
  initPasswordToggle("toggle-new-password-confirm", passwordConfirmInput);
}

// El link del mail de recuperación trae el token en el hash de la URL:
// supabase-js lo detecta solo al cargar el cliente y arma una sesión
// temporal (dispara el evento PASSWORD_RECOVERY), sin esperar a este script.
// Por eso no usamos guardPage (piensa en sesión = usuario logueado normal,
// nos mandaría derecho a Home) -- acá cualquier sesión activa al entrar
// habilita el formulario, y si no hay ninguna (link vencido/inválido/URL
// visitada directa) mostramos el aviso de error.
let resolved = false;
function finish(hasSession) {
  if (resolved) return;
  resolved = true;
  initForm();
  hasSession ? showForm() : showInvalidLink();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) finish(true);
});

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) finish(true);
});

// Margen para que el intercambio del token del link termine antes de
// resignarse a "enlace inválido".
setTimeout(() => finish(false), 2500);

checkUrlErrors();
