import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

// Inicializar Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// --- Sistema de Notificaciones ---
function initToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = "error") {
  const container = initToastContainer();
  const toast = document.createElement("div");
  
  const bgColor = type === "error" ? "#fee2e2" : "#dcfce7";
  const textColor = type === "error" ? "#991b1b" : "#166534";
  const icon = type === "error"
    ? '<i class="fa-solid fa-circle-exclamation"></i>'
    : '<i class="fa-solid fa-circle-check"></i>';

  toast.style.cssText = `
    background-color: ${bgColor};
    color: ${textColor};
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
  `;
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Eliminar después de 4 segundos
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

// --- Utilidades de Interfaz ---
export function setLoading(btn, loading, originalText = "Enviar") {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Cargando...';
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  } else {
    btn.textContent = originalText || btn.dataset.originalText || "Enviar";
    btn.style.opacity = "";
    btn.style.cursor = "";
  }
}

// --- Validaciones ---
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Verificación de Errores OAuth ---
export function checkUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));

  const error = params.get("error") || hashParams.get("error");
  const errorDesc = params.get("error_description") || hashParams.get("error_description");

  if (error) {
    console.error("Auth redirect error:", error, errorDesc);
    let userMsg = "Hubo un problema de autenticación. Intentá de nuevo.";
    if (errorDesc) {
      const decodedDesc = decodeURIComponent(errorDesc).replace(/\+/g, " ");
      if (decodedDesc.includes("Database error")) {
        userMsg = "Error de base de datos al guardar tu perfil. Por favor, intentá de nuevo.";
      } else {
        userMsg = `Error: ${decodedDesc}`;
      }
    }
    showToast(userMsg, "error");
    history.replaceState(null, null, window.location.pathname);
  }
}

// --- Listener Global de Sesión ---
let isHandlingRedirect = false;

export function setupGlobalSessionListener(redirectIfNoSession = false, redirectIfSession = false) {
  // Escuchar cambios de estado de autenticación
  supabase.auth.onAuthStateChange((event, session) => {
    if (isHandlingRedirect) return;

    if (event === "SIGNED_OUT" && redirectIfNoSession) {
      isHandlingRedirect = true;
      window.location.replace("../pages/login.html");
    } else if (event === "SIGNED_IN" && redirectIfSession) {
      isHandlingRedirect = true;
      window.location.replace("../pages/perfil.html");
    }
  });

  // Verificar sesión inicial
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user && redirectIfNoSession) {
      window.location.replace("../pages/login.html");
    } else if (user && redirectIfSession) {
      window.location.replace("../pages/perfil.html");
    }
  }).catch(() => {
    // Ignorar error
  });
}
