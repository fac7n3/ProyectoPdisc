import { supabase, showToast, setLoading, isValidEmail, guardPage } from "./auth-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

const emailInput = document.getElementById("recover-email");
const recoverForm = document.getElementById("recover-form");
const recoverBtn = document.getElementById("recover-btn");
const successNotice = document.getElementById("recover-success");

async function requestPasswordReset() {
  const email = emailInput?.value?.trim() ?? "";

  if (!email) {
    showToast("Ingresá tu correo electrónico.", "error");
    emailInput?.focus();
    return;
  }
  if (!isValidEmail(email)) {
    showToast("El formato del correo electrónico no es válido.", "error");
    emailInput?.focus();
    return;
  }

  setLoading(recoverBtn, true, "Enviar instrucciones");

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/pages/login.html`,
    });

    if (error) {
      console.error("Reset password error:", error);
      showToast("Hubo un error al intentar enviar el correo. Intentá nuevamente.", "error");
      setLoading(recoverBtn, false, "Enviar instrucciones");
      return;
    }

    recoverForm.style.display = "none";
    successNotice.style.display = "block";
  } catch (err) {
    console.error("Unexpected reset error:", err);
    showToast("Error inesperado. Intentá de nuevo más tarde.", "error");
    setLoading(recoverBtn, false, "Enviar instrucciones");
  }
}

function initRecoverForm() {
  recoverForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    requestPasswordReset();
  });
}

// Página INVERSA: si hay sesión → redirigir a Home. Si no hay → mostrar formulario.
guardPage({
  redirectIfAuth: true,
  onReady: () => {
    initRecoverForm();
  },
});
