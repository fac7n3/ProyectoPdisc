// Interacciones de la página principal
// Sin dependencia de Supabase para demo estática — los productos están en el HTML.

/** Notificación toast */
function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast--success');
  toast.classList.add('toast--visible');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2500);
}

/** Botones de agregar al carrito */
function initCartButtons() {
  document.querySelectorAll('.product-card__add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.product-card');
      const name = card?.querySelector('.product-card__name')?.textContent || 'Producto';

      // Animación rápida de escala
      btn.style.transform = 'scale(0.93)';
      setTimeout(() => { btn.style.transform = ''; }, 120);

      // Actualizar contador del carrito
      const cartBadge = document.querySelector('#nav-cart .badge');
      if (cartBadge) {
        const current = parseInt(cartBadge.textContent, 10) || 0;
        cartBadge.textContent = current + 1;
      }

      showToast(`${name} agregado al carrito`, 'success');
    });
  });
}

/** Alternar favoritos */
function initWishlist() {
  document.querySelectorAll('.product-card__wishlist').forEach((btn) => {
    btn.addEventListener('click', () => {
      const icon = btn.querySelector('i');
      const isActive = icon.classList.contains('fa-solid');

      if (isActive) {
        icon.classList.replace('fa-solid', 'fa-regular');
        btn.style.color = '';
        showToast('Eliminado de favoritos');
      } else {
        icon.classList.replace('fa-regular', 'fa-solid');
        btn.style.color = '#ef4444';
        showToast('Agregado a favoritos', 'success');
      }
    });
  });
}

/** Búsqueda — filtro básico */
function initSearch() {
  const input = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  function doSearch() {
    const query = input?.value.trim().toLowerCase();
    if (!query) return;

    document.querySelectorAll('.product-card').forEach((card) => {
      const name = card.querySelector('.product-card__name')?.textContent.toLowerCase() || '';
      const shop = card.querySelector('.product-card__shop')?.textContent.toLowerCase() || '';
      const matches = name.includes(query) || shop.includes(query);
      card.style.display = matches ? '' : 'none';
    });

    showToast(`Buscando "${input.value.trim()}"...`);
  }

  searchBtn?.addEventListener('click', doSearch);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  // Reiniciar al vaciar
  input?.addEventListener('input', () => {
    if (!input.value.trim()) {
      document.querySelectorAll('.product-card').forEach((card) => {
        card.style.display = '';
      });
    }
  });
}

/** Botón volver arriba */
function initScrollTop() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/** Navbar se compacta al hacer scroll */
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    } else {
      navbar.style.boxShadow = '';
    }
  }, { passive: true });
}

/** Filtrado por categorías */
function initCategories() {
  const categoryItems = document.querySelectorAll('.category-bar__item:not(#cat-mas), .category-bar__dropdown-item');
  const products = document.querySelectorAll('.product-card');

  categoryItems.forEach(item => {
    if(item.id === 'cat-mas' || item.getAttribute('href') === './vender.html') return; // Saltar el toggle del dropdown y el enlace de Vender

    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Actualizar estado activo de los ítems de la barra superior
      if (item.classList.contains('category-bar__item')) {
        document.querySelectorAll('.category-bar__item').forEach(i => i.classList.remove('category-bar__item--active'));
        item.classList.add('category-bar__item--active');
      }
      
      const filter = item.dataset.filter || item.id.replace('cat-', '');
      
      products.forEach(card => {
        if (filter === 'inicio') {
          card.style.display = '';
          return;
        }
        
        const categories = (card.dataset.category || '').split(' ');
        if (categories.includes(filter)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
      
      showToast(`Filtrado por: ${item.textContent.trim()}`);
    });
  });
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initCartButtons();
  initWishlist();
  initSearch();
  initCategories();
  initScrollTop();
  initNavbarScroll();
});
