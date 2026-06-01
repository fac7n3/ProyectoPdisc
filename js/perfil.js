import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const sessionStatus = document.getElementById("session-status");
const userEmail = document.getElementById("user-email");
const userName = document.getElementById("user-name");
const userRole = document.getElementById("user-role");
const logoutBtn = document.getElementById("logout-btn");

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function renderSession() {
  let profileData;

  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      window.location.href = "../pages/login.html";
      return;
    }

    const profileResponse = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .single();

    if (profileResponse.error) {
      console.error(profileResponse.error);
      window.location.href = "../pages/login.html";
      return;
    }

    profileData = profileResponse.data;
  } catch (err) {
    console.error("Authentication error:", err);
    window.location.href = "../pages/login.html";
    return;
  }

  const role = profileData.role ?? "cliente";
  sessionStatus.textContent = "Sesión iniciada correctamente.";
  userEmail.textContent = profileData.email ?? "sin email";
  userName.textContent = profileData.full_name ?? "-";
  userRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  const roleBadge = document.getElementById("user-role-badge");
  if (roleBadge) {
    roleBadge.textContent = role;
    roleBadge.className = `profile-badge ${role.toLowerCase()}`;
  }
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "../pages/login.html";
}

logoutBtn?.addEventListener("click", logout);
renderSession();
