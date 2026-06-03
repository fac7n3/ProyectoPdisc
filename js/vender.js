// Lógica de vendedor - Panel de vendedor (demo)

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast toast--visible toast--success';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  const registerView = document.getElementById('register-view');
  const dashboardView = document.getElementById('dashboard-view');
  const form = document.getElementById('seller-form');
  const shopNameLabel = document.getElementById('dash-shop-name');
  const logoutBtn = document.getElementById('btn-logout-seller');

  // Verificar si es vendedor
  function checkSellerState() {
    const isSeller = localStorage.getItem('is_seller') === 'true';
    const shopName = localStorage.getItem('seller_shop_name');

    if (isSeller) {
      registerView.style.display = 'none';
      dashboardView.style.display = 'block';
      if (shopName) {
        shopNameLabel.textContent = shopName;
      }
    } else {
      registerView.style.display = 'block';
      dashboardView.style.display = 'none';
    }
  }

  // Verificación inicial
  checkSellerState();

  // Manejar registro
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('shop-name').value;
    
    // Guardar en almacenamiento local
    localStorage.setItem('is_seller', 'true');
    localStorage.setItem('seller_shop_name', nameInput);
    
    showToast('¡Registro exitoso! Bienvenido a Baradero Local.');
    checkSellerState();
  });

  // Manejar cierre de sesión
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('is_seller');
    localStorage.removeItem('seller_shop_name');
    showToast('Sesión de vendedor cerrada.');
    checkSellerState();
  });
});
