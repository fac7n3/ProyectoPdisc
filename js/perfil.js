import { supabase, guardPage, showToast } from "./auth-utils.js";
import { formatPrice } from "./cart-utils.js";
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

// --- Favoritos: Cargar desde la tabla favorites (F4-03) ---
async function loadFavoritos(userId) {
  if (!favoritosContainer) return;
  try {
    const { data: favRows, error: favError } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId);

    if (favError) throw favError;

    const wishlist = (favRows || []).map((f) => f.product_id);

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
      const priceFmt = formatPrice(p.price);
      const imgSrc = p.image_url || '../Assets/images/placeholder.png';

      const card = document.createElement('a');
      card.className = "fav-card";
      card.href = `./producto.html?id=${encodeURIComponent(p.id)}`;

      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = p.title;
      img.loading = 'lazy';
      card.appendChild(img);

      const info = document.createElement('div');
      info.className = 'fav-card-info';

      const priceSpan = document.createElement('span');
      priceSpan.className = 'fav-price';
      priceSpan.textContent = priceFmt;
      info.appendChild(priceSpan);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'fav-title';
      titleSpan.textContent = p.title;
      info.appendChild(titleSpan);

      card.appendChild(info);
      favoritosContainer.appendChild(card);
    });

  } catch (err) {
    console.error("Error loading wishlist", err);
    favoritosContainer.innerHTML = `<p style="color: #ef4444;">Error al cargar favoritos.</p>`;
  }
}

// --- Compras: Cargar desde DB ---

const ORDER_STATUS_LABELS = {
  pending: 'Pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para retirar',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const PAYMENT_METHOD_LABELS = {
  simulado: 'Pago simulado',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
};

const DELIVERY_METHOD_LABELS = {
  pickup: 'Retiro en el local',
  delivery: 'Envío a domicilio',
};

const DELIVERY_STATUS_LABELS = {
  assigned: 'Un repartidor tomó tu pedido',
  picked_up: 'El repartidor está en camino',
  delivered: 'Entregado',
};

/**
 * Construye la card de una orden con DOM API (nunca innerHTML): el nombre
 * de la tienda y el título de cada producto los define el vendedor, así que
 * se tratan como no confiables — mismo criterio que F1-01 en comercio.js/
 * producto.js.
 */
function buildCompraItem(order) {
  const date = new Date(order.created_at).toLocaleDateString('es-AR');
  const shortId = order.id.split('-')[0].toUpperCase();
  const statusText = ORDER_STATUS_LABELS[order.status] || order.status;
  const storeName = order.stores?.name || 'Comercio';

  const item = document.createElement('div');
  item.className = 'compra-item';

  const info = document.createElement('div');
  info.className = 'compra-info';

  const idSpan = document.createElement('span');
  idSpan.className = 'compra-id';
  idSpan.textContent = `Orden #${shortId} — ${storeName}`;
  info.appendChild(idSpan);

  const dateSpan = document.createElement('span');
  dateSpan.className = 'compra-date';
  const methodLabel = DELIVERY_METHOD_LABELS[order.delivery_method] || 'Retiro en el local';
  const paymentLabel = PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || '';
  dateSpan.textContent = `${date} · ${methodLabel} · ${paymentLabel}`;
  info.appendChild(dateSpan);

  if (order.order_items?.length) {
    const itemsList = document.createElement('ul');
    itemsList.className = 'compra-items-list';
    order.order_items.forEach((oi) => {
      const li = document.createElement('li');
      // Título "congelado" al momento de la compra (order_items.title), no
      // un join en vivo a products: si el vendedor lo desactiva o lo borra
      // después, el recibo del cliente no debe desaparecer (F2-06).
      const title = oi.title || 'Producto';
      li.textContent = `${oi.quantity}x ${title} — ${formatPrice(oi.price * oi.quantity)}`;
      itemsList.appendChild(li);
    });
    info.appendChild(itemsList);
  }

  const statusDiv = document.createElement('div');
  const statusSpan = document.createElement('span');
  statusSpan.className = `compra-status compra-status--${order.status}`;
  statusSpan.textContent = statusText;
  statusDiv.appendChild(statusSpan);
  info.appendChild(statusDiv);

  // F3-04: estado del envío (si el pedido es delivery y ya tiene repartidor).
  // Sin push en tiempo real todavía — se actualiza al recargar "Mis compras",
  // igual que el resto de los paneles de este proyecto.
  // deliveries.order_id es UNIQUE -> PostgREST lo embebe como objeto único,
  // no como array (relación 1:1, no 1:N).
  const deliveryStatus = order.deliveries?.status;
  if (order.delivery_method === 'delivery' && deliveryStatus && DELIVERY_STATUS_LABELS[deliveryStatus]) {
    const deliverySpan = document.createElement('span');
    deliverySpan.className = 'compra-date';
    deliverySpan.textContent = DELIVERY_STATUS_LABELS[deliveryStatus];
    info.appendChild(deliverySpan);
  }

  const proofSection = buildPaymentProofSection(order);
  if (proofSection) info.appendChild(proofSection);

  item.appendChild(info);

  const totalDiv = document.createElement('div');
  totalDiv.className = 'compra-total';
  totalDiv.textContent = formatPrice(order.total_price);
  item.appendChild(totalDiv);

  return item;
}

/**
 * F2-04: si la orden es por transferencia y sigue pendiente, muestra el
 * estado del último comprobante (si hay uno) y un input para subir uno
 * nuevo. El vendedor lo confirma/rechaza desde vender.js.
 */
function buildPaymentProofSection(order) {
  if (order.payment_method !== 'transferencia' || order.payment_status !== 'pending') {
    return null;
  }

  const wrap = document.createElement('div');
  wrap.className = 'compra-proof';

  const proofs = order.payment_proofs || [];
  const latestProof = [...proofs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];

  if (latestProof?.status === 'pending') {
    const msg = document.createElement('p');
    msg.className = 'compra-proof__message';
    msg.textContent = 'Comprobante enviado — esperando confirmación del comercio.';
    wrap.appendChild(msg);
    return wrap;
  }

  if (latestProof?.status === 'rejected') {
    const msg = document.createElement('p');
    msg.className = 'compra-proof__message compra-proof__message--error';
    msg.textContent = 'El comprobante anterior fue rechazado. Subí uno nuevo.';
    wrap.appendChild(msg);
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,application/pdf';
  fileInput.className = 'compra-proof__file';
  wrap.appendChild(fileInput);

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'bl-btn bl-btn-primary compra-proof__btn';
  uploadBtn.textContent = 'Subir comprobante';
  wrap.appendChild(uploadBtn);

  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      showToast('Elegí un archivo primero.', 'error');
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Subiendo...';

    try {
      // Sanea el nombre de archivo: nada de "/" ni ".." que intente escapar
      // de la carpeta {order.id}/ que usan las policies de storage.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
      const path = `${order.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('payment_proofs')
        .insert({ order_id: order.id, receipt_url: path });
      if (insertError) throw insertError;

      showToast('Comprobante enviado. Esperá la confirmación del comercio.', 'success');
      await loadCompras(order.client_id);
    } catch (err) {
      console.error('Error al subir comprobante', err);
      showToast('No se pudo subir el comprobante.', 'error');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Subir comprobante';
    }
  });

  return wrap;
}

async function loadCompras(userId) {
  if (!comprasContainer) return;
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, client_id, status, payment_method, payment_status, delivery_method, created_at, total_price,
        stores ( name ),
        order_items ( quantity, price, title ),
        payment_proofs ( status, created_at ),
        deliveries ( status )
      `)
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    comprasContainer.textContent = '';

    if (!orders || orders.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.color = 'var(--bl-perfil-text-sec)';
      emptyMsg.textContent = 'Aún no realizaste ninguna compra.';
      comprasContainer.appendChild(emptyMsg);
      return;
    }

    orders.forEach((order) => {
      comprasContainer.appendChild(buildCompraItem(order));
    });
  } catch (err) {
    console.error("Error loading orders", err);
    comprasContainer.textContent = '';
    const errorMsg = document.createElement('p');
    errorMsg.style.color = '#ef4444';
    errorMsg.textContent = 'Error al cargar tus compras.';
    comprasContainer.appendChild(errorMsg);
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
  loadFavoritos(user.id);
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
