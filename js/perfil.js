import { supabase, guardPage, showToast } from "./auth-utils.js";
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Referencias al DOM ---
const sidebarName = document.getElementById("sidebar-name");
const sidebarEmail = document.getElementById("sidebar-email");
const sidebarAvatar = document.getElementById("sidebar-avatar");

const cardName = document.getElementById("card-name");
const cardEmail = document.getElementById("card-email");
const cardRole = document.getElementById("card-role");

const logoutBtn = document.getElementById("logout-btn");
const mainContent = document.getElementById("main-content");

// Direcciones
const formDirecciones = document.getElementById("direcciones-form");
const inputPhone = document.getElementById("address-phone");
const inputAddress = document.getElementById("address-main");
const inputDetails = document.getElementById("address-details");
const btnSaveAddress = document.getElementById("btn-save-address");

// Contenedores
const comprasContainer = document.getElementById("compras-container");
const favoritosContainer = document.getElementById("favoritos-container");

// Pestañas
const navLinks = document.querySelectorAll(".profile-nav__link[data-target]");
const tabPanes = document.querySelectorAll(".tab-pane");

// Variable global para user_id
let currentUserId = null;

// --- Lógica de Pestañas (Tabs) ---
navLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetId = link.getAttribute("data-target");
    if (!targetId) return;

    // Quitar active de todos
    navLinks.forEach(l => l.classList.remove("profile-nav__link--active"));
    tabPanes.forEach(pane => {
      pane.style.display = "none";
      pane.classList.remove("active");
    });

    // Activar el clickeado
    link.classList.add("profile-nav__link--active");
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      // Usar grid-column full width para compras/fav/direc, o dejar mis-datos normal
      targetPane.style.display = targetId === "tab-mis-datos" ? "contents" : "block";
      if (targetId !== "tab-mis-datos") targetPane.style.gridColumn = "1 / -1";
      
      // Forzar reflow para que la animación CSS corra de nuevo
      void targetPane.offsetWidth;
      targetPane.classList.add("active");
    }
  });
});


// --- Función auxiliar ---
function removeSkeleton(element) {
  if (!element) return;
  element.classList.remove('skeleton', 'skeleton-text', 'skeleton-text-short', 'skeleton-avatar');
}

// --- Renderizar perfil con datos del JWT (rápido) ---
function renderQuickProfile(user) {
  const quickName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const quickRole = user.app_metadata?.role || "cliente";

  if (mainContent) mainContent.style.display = "grid";

  if (sidebarName) { sidebarName.textContent = quickName || "-"; removeSkeleton(sidebarName); }
  if (sidebarEmail) { sidebarEmail.textContent = user.email || "sin email"; removeSkeleton(sidebarEmail); }
  if (cardName) { cardName.textContent = quickName || "-"; removeSkeleton(cardName); }
  if (cardEmail) { cardEmail.textContent = user.email || "sin email"; removeSkeleton(cardEmail); }
  if (cardRole) {
    cardRole.textContent = quickRole.charAt(0).toUpperCase() + quickRole.slice(1);
    removeSkeleton(cardRole);
  }
}

// --- Direcciones: Cargar y Guardar ---
function fillDirecciones(profile) {
  if (inputPhone) inputPhone.value = profile.phone || "";
  if (inputAddress) inputAddress.value = profile.address || "";
  if (inputDetails) inputDetails.value = profile.address_details || "";
}

if (formDirecciones) {
  formDirecciones.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserId) return;
    
    if (btnSaveAddress) {
      btnSaveAddress.disabled = true;
      btnSaveAddress.textContent = "Guardando...";
    }

    const updates = {
      phone: inputPhone.value.trim(),
      address: inputAddress.value.trim(),
      address_details: inputDetails.value.trim()
    };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', currentUserId);

      if (error) throw error;
      showToast("Dirección guardada correctamente", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al guardar dirección");
    } finally {
      if (btnSaveAddress) {
        btnSaveAddress.disabled = false;
        btnSaveAddress.textContent = "Guardar cambios";
      }
    }
  });
}

// --- Favoritos: Cargar desde LocalStorage + DB ---
async function loadFavoritos() {
  if (!favoritosContainer) return;
  try {
    const raw = localStorage.getItem('bl_wishlist');
    const wishlist = raw ? JSON.parse(raw) : [];

    if (wishlist.length === 0) {
      favoritosContainer.innerHTML = `<p style="color: var(--bl-perfil-text-sec);">Aún no agregaste productos a tus favoritos.</p>`;
      return;
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, price, image_url')
      .in('id', wishlist)
      .eq('is_active', true);

    if (error) throw error;

    if (!products || products.length === 0) {
      favoritosContainer.innerHTML = `<p style="color: var(--bl-perfil-text-sec);">No se encontraron los productos favoritos (pueden haber sido eliminados).</p>`;
      return;
    }

    favoritosContainer.innerHTML = "";
    products.forEach(p => {
      const priceFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(p.price);
      const img = p.image_url || '../Assets/images/placeholder.png';
      
      const card = document.createElement('a');
      card.className = "fav-card";
      card.href = `./producto.html?id=${p.id}`;
      card.innerHTML = `
        <img src="${img}" alt="${p.title}" loading="lazy" />
        <div class="fav-card-info">
          <span class="fav-price">${priceFmt}</span>
          <span class="fav-title">${p.title}</span>
        </div>
      `;
      favoritosContainer.appendChild(card);
    });

  } catch (err) {
    console.error("Error loading wishlist", err);
    favoritosContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar favoritos.</p>`;
  }
}

// --- Compras: Cargar desde DB ---
async function loadCompras(userId) {
  if (!comprasContainer) return;
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, created_at, total_price')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      comprasContainer.innerHTML = `<p style="color: var(--bl-perfil-text-sec);">Aún no realizaste ninguna compra.</p>`;
      return;
    }

    comprasContainer.innerHTML = "";
    orders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString('es-AR');
      const total = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(order.total_price);
      const shortId = order.id.split('-')[0].toUpperCase();
      
      const item = document.createElement('div');
      item.className = "compra-item";
      
      // Traducción de estado
      let statusText = "Pendiente";
      if (order.status === 'paid') statusText = "Pagado";
      else if (order.status === 'shipped') statusText = "Enviado";
      else if (order.status === 'completed') statusText = "Completado";
      else if (order.status === 'cancelled') statusText = "Cancelado";

      item.innerHTML = `
        <div class="compra-info">
          <span class="compra-id">Orden #${shortId}</span>
          <span class="compra-date">${date}</span>
          <div><span class="compra-status compra-status--${order.status}">${statusText}</span></div>
        </div>
        <div class="compra-total">${total}</div>
      `;
      comprasContainer.appendChild(item);
    });

  } catch (err) {
    console.error("Error loading orders", err);
    comprasContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar tus compras.</p>`;
  }
}


// --- Renderizar perfil completo ---
async function renderFullProfile(user) {
  currentUserId = user.id;
  try {
    // Pedimos explicitamente los campos nuevos (phone, address, address_details) si existen
    // Si la migración SQL no se corrió, tirará error de que no existen. Usamos un select defensivo o asumimos que el usuario lo corrió.
    // Como pedimos "select('*')", traerá todo lo que haya.
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }

    if (!profile) return;

    const roleFromDB = profile.role ?? "cliente";
    const emailToUse = profile.email ?? user.email ?? "sin email";
    const nameToUse = profile.full_name ?? "-";

    if (sidebarEmail) sidebarEmail.textContent = emailToUse;
    if (sidebarName) sidebarName.textContent = nameToUse;
    if (cardEmail) cardEmail.textContent = emailToUse;
    if (cardName) cardName.textContent = nameToUse;
    if (cardRole) cardRole.textContent = roleFromDB.charAt(0).toUpperCase() + roleFromDB.slice(1);

    // Renderizar avatar
    if (sidebarAvatar && profile.avatar_url) {
      removeSkeleton(sidebarAvatar);
      sidebarAvatar.innerHTML = ""; 
      const img = document.createElement("img");
      img.src = profile.avatar_url;
      img.alt = profile.full_name || "Avatar";
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
      img.onerror = () => { sidebarAvatar.innerHTML = '<i class="fa-regular fa-user"></i>'; };
      sidebarAvatar.appendChild(img);
    } else if (sidebarAvatar) {
      removeSkeleton(sidebarAvatar);
    }

    // Llenar formularios de otras pestañas
    fillDirecciones(profile);

  } catch (err) {
    console.error("Profile fetch error:", err);
  }
  
  // Cargar las colecciones asíncronamente
  loadFavoritos();
  loadCompras(user.id);
}

// --- Cerrar sesión ---
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    showToast("Cerrando sesión...", "success");
    setTimeout(async () => {
      await supabase.auth.signOut();
    }, 800);
  });
}

// --- Inicialización con Guard ---
guardPage({
  requireAuth: true,
  onReady: (user) => {
    renderQuickProfile(user);
    renderFullProfile(user);
  },
});
