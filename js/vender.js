import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { isValidCuit, isValidShopName, isValidPhone, isValidProductTitle, isValidPrice, isValidStock } from './validation-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Verificar si es vendedor y mostrar la vista correcta ---
async function checkSellerState(user) {
  const registerView = document.getElementById('register-view');
  const dashboardView = document.getElementById('dashboard-view');
  const shopNameLabel = document.getElementById('dash-shop-name');

  if (!user) return; // guardPage ya se encarga de redirigir

  // Verificar si ya tiene el rol o una solicitud
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'vendedor' || profile?.role === 'admin') {
    registerView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    // Cargar lógica del dashboard
    await loadDashboard(user);
    return;
  }

  // Si no es vendedor, ver si tiene solicitud pendiente
  const { data: req } = await supabase
    .from('seller_requests')
    .select('status, shop_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (req) {
    registerView.style.display = 'none';
    dashboardView.style.display = 'block';
    shopNameLabel.textContent = `${req.shop_name} (Estado: ${req.status})`;
    
    // Ocultar acciones porque aún no está aprobado
    document.querySelector('.action-buttons').style.display = 'none';
    document.querySelector('.dashboard-stats').style.display = 'none';
    const formulariosYListas = document.querySelector('div[style*="margin-top: 3rem;"]');
    if(formulariosYListas) formulariosYListas.style.display = 'none';
  } else {
    registerView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
}

// --- Inicializar formulario y eventos ---
async function loadCategories() {
  const select = document.getElementById('shop-category');
  if (!select) return;

  const { data: categories, error } = await supabase
    .from('categories')
    .select('name, slug')
    .order('name');

  if (error || !categories) {
    select.innerHTML = '<option value="">Error al cargar rubros</option>';
    return;
  }

  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seleccioná un rubro...';
  select.appendChild(placeholder);

  categories.forEach(c => {
    const option = document.createElement('option');
    option.value = c.slug;
    option.textContent = c.name;
    select.appendChild(option);
  });
}

function initVenderPage(user) {
  const form = document.getElementById('seller-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const logoutBtn = document.getElementById('btn-logout-seller');

  // Cargar categorías y estado del vendedor
  loadCategories();
  checkSellerState(user);

  // Manejar registro de comercio
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('shop-name').value.trim();
    const cuitInput = document.getElementById('shop-cuit').value.trim();
    const categoryInput = document.getElementById('shop-category').value;
    const addressInput = document.getElementById('shop-address').value.trim();
    const phoneInput = document.getElementById('shop-phone').value.trim();

    if (!isValidShopName(nameInput)) {
      showToast("El nombre del comercio debe tener entre 3 y 100 caracteres.", "error");
      return;
    }
    if (!isValidCuit(cuitInput)) {
      showToast("El CUIT ingresado no es válido. Verificá el formato (11 dígitos) y el dígito verificador.", "error");
      return;
    }
    if (!addressInput) {
      showToast("Ingresá la dirección de tu comercio.", "error");
      return;
    }
    if (!isValidPhone(phoneInput)) {
      showToast("El teléfono ingresado no es válido.", "error");
      return;
    }

    if (submitBtn) setLoading(submitBtn, true, "Registrarme");

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      showToast("Sesión inválida.", "error");
      if (submitBtn) setLoading(submitBtn, false, "Registrarme");
      return;
    }

    const { error } = await supabase
      .from('seller_requests')
      .insert({ 
        user_id: user.id, 
        shop_name: nameInput,
        cuit: cuitInput,
        category_slug: categoryInput,
        address: addressInput,
        phone: phoneInput
      });

    if (error) {
      console.error("Error al solicitar ser vendedor:", error);
      showToast("Hubo un error al procesar tu solicitud.", "error");
    } else {
      showToast("¡Solicitud enviada exitosamente! Revisaremos tus datos.", "success");
      await checkSellerState();
    }
    
    if (submitBtn) setLoading(submitBtn, false, "Registrarme");
  });

  // Manejar botón de volver al inicio
  logoutBtn?.addEventListener('click', () => {
    window.location.replace('./home.html');
  });
}

// --- Vista y Lógica de Vendedor (Dashboard) ---
let currentStoreId = null;

async function loadDashboard(user) {
  // Obtener la tienda del usuario
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name')
    .eq('owner_id', user.id)
    .single();

  if (error || !store) {
    console.error("Error al cargar la tienda", error);
    return;
  }

  currentStoreId = store.id;
  document.getElementById('dash-shop-name').textContent = store.name;

  await fetchProducts();
  setupDashboardEvents();
}

async function fetchProducts() {
  if (!currentStoreId) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error al cargar productos", error);
    return;
  }

  document.getElementById('stat-products-count').textContent = products.length;

  const tbody = document.getElementById('seller-products-tbody');
  tbody.innerHTML = '';

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">No tienes productos cargados aún.</td></tr>';
    return;
  }

  products.forEach(p => {
    const tr = document.createElement('tr');

    // Image cell
    const tdImg = document.createElement('td');
    tdImg.style.padding = '1rem';
    const img = document.createElement('img');
    img.src = p.image_url || 'https://via.placeholder.com/50';
    img.style.cssText = 'width: 50px; height: 50px; border-radius: 8px; object-fit: cover;';
    img.alt = p.title || 'Producto';
    tdImg.appendChild(img);
    tr.appendChild(tdImg);

    // Name + description cell
    const tdName = document.createElement('td');
    tdName.style.padding = '1rem';
    const strong = document.createElement('strong');
    strong.textContent = p.title;
    tdName.appendChild(strong);
    if (p.description) {
      tdName.appendChild(document.createElement('br'));
      const small = document.createElement('small');
      small.style.color = 'var(--bl-text-secondary)';
      small.textContent = p.description.substring(0, 30) + '...';
      tdName.appendChild(small);
    }
    tr.appendChild(tdName);

    // Price cell
    const tdPrice = document.createElement('td');
    tdPrice.style.cssText = 'padding: 1rem; color: var(--bl-primary); font-weight: 600;';
    tdPrice.textContent = formatPrice(p.price);
    tr.appendChild(tdPrice);

    // Actions cell
    const tdActions = document.createElement('td');
    tdActions.style.padding = '1rem';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-product';
    deleteBtn.dataset.id = p.id;
    deleteBtn.style.cssText = 'background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 0.5rem;';
    const trashIcon = document.createElement('i');
    trashIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(trashIcon);
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  // Bind delete actions
  document.querySelectorAll('.btn-delete-product').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Eliminar producto? (Atención: esto fallará si el producto ya fue comprado por alguien, requiere lógica avanzada en un entorno real)')) {
        await supabase.from('products').delete().eq('id', id);
        fetchProducts();
      }
    });
  });
}

function setupDashboardEvents() {
  const btnShowAdd = document.getElementById('btn-show-add-product');
  const btnCancelAdd = document.getElementById('btn-cancel-add-product');
  const addFormContainer = document.getElementById('add-product-form-container');
  const addForm = document.getElementById('add-product-form');

  // Llenar categorías del form
  const categorySelect = document.getElementById('prod-category');
  const baseCategorySelect = document.getElementById('shop-category');
  if (categorySelect && baseCategorySelect) {
    categorySelect.innerHTML = baseCategorySelect.innerHTML;
  }

  btnShowAdd.addEventListener('click', () => {
    addFormContainer.style.display = 'block';
  });

  btnCancelAdd.addEventListener('click', () => {
    addFormContainer.style.display = 'none';
    addForm.reset();
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = addForm.querySelector('button[type="submit"]');

    const titleValue = document.getElementById('prod-name').value.trim();
    const priceValue = document.getElementById('prod-price').value;
    const stockValue = document.getElementById('prod-stock').value;

    if (!isValidProductTitle(titleValue)) {
      showToast("El nombre del producto debe tener entre 3 y 150 caracteres.", "error");
      return;
    }
    if (!isValidPrice(priceValue)) {
      showToast("El precio debe ser un número entero mayor a 0.", "error");
      return;
    }
    if (!isValidStock(stockValue)) {
      showToast("El stock debe ser un número entero mayor o igual a 0.", "error");
      return;
    }

    setLoading(btnSubmit, true, "Guardar Producto");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("Sesión inválida.", "error");
      setLoading(btnSubmit, false, "Guardar Producto");
      return;
    }

    const newProduct = {
      seller_id: user.id,
      store_id: currentStoreId,
      title: document.getElementById('prod-name').value.trim(),
      price: parseInt(document.getElementById('prod-price').value),
      stock: parseInt(document.getElementById('prod-stock').value),
      category_id: null,
      description: document.getElementById('prod-desc').value.trim(),
      image_url: document.getElementById('prod-image').value.trim()
    };

    // El select guarda el slug de la categoría; hay que resolver el UUID real
    const slug = document.getElementById('prod-category').value;
    const { data: catData } = await supabase.from('categories').select('id').eq('slug', slug).single();
    if (catData) newProduct.category_id = catData.id;

    const { error } = await supabase.from('products').insert([newProduct]);

    if (error) {
      showToast("Error al guardar el producto", "error");
      console.error(error);
    } else {
      showToast("Producto creado", "success");
      addForm.reset();
      addFormContainer.style.display = 'none';
      fetchProducts();
    }
    setLoading(btnSubmit, false, "Guardar Producto");
  });
}

// --- Inicialización con Guard ---
// Página PRIVADA: si no hay sesión → redirigir a Login
guardPage({
  requireAuth: true,
  onReady: (user) => {
    initVenderPage(user);
  },
});
