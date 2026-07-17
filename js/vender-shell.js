// Shell "Mi cuenta": sidebar colapsable + navegación entre secciones por `data-section`
// (hash del URL). Reusa el mismo patrón de toggle/aria/click-afuera/Escape que
// `nav-utils.js` (initCategoryBar / initNotificationsBell). No reescribe ninguna
// sección: solo muestra una por vez y marca la activa. Fase 0 del rediseño "Mi cuenta".

const DEFAULT_SECTION = 'resumen';

export function initVenderShell() {
  const sidebar = document.getElementById('mc-sidebar');
  if (!sidebar || sidebar.dataset.shellInit) return; // idempotente
  sidebar.dataset.shellInit = '1';

  // Grupos colapsables (Ventas, etc.)
  sidebar.querySelectorAll('.mc-group').forEach((group) => {
    const trigger = group.querySelector('.mc-group__trigger');
    const panel = group.querySelector('.mc-group__panel');
    if (!trigger || !panel) return;
    trigger.addEventListener('click', () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
      group.classList.toggle('is-open', willOpen);
    });
  });

  // Navegación por ítem: cambia el hash (el hashchange hace el resto)
  sidebar.querySelectorAll('.mc-navitem').forEach((item) => {
    item.addEventListener('click', () => {
      location.hash = item.dataset.section;
      closeDrawer();
    });
  });

  // Drawer mobile
  document.getElementById('mc-hamburger')?.addEventListener('click', openDrawer);
  document.getElementById('mc-close')?.addEventListener('click', closeDrawer);
  document.getElementById('mc-backdrop')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  window.addEventListener('hashchange', showActiveSection);
  showActiveSection();
}

function showActiveSection() {
  const sections = Array.from(document.querySelectorAll('.mc-content .mc-section'));
  if (!sections.length) return;

  const requested = location.hash.replace('#', '');
  // Si el hash no matchea ninguna sección visible en el sidebar, caer al default.
  const validKeys = new Set(sections.map((s) => s.dataset.section));
  const key = validKeys.has(requested) ? requested : DEFAULT_SECTION;

  sections.forEach((s) => {
    s.hidden = s.dataset.section !== key;
  });

  // Estado activo + abrir el grupo que contiene al ítem activo
  document.querySelectorAll('.mc-navitem').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.section === key);
  });
  const activeItem = document.querySelector(`.mc-navitem[data-section="${key}"]`);
  const group = activeItem?.closest('.mc-group');
  if (group) {
    const panel = group.querySelector('.mc-group__panel');
    if (panel) panel.hidden = false;
    group.classList.add('is-open');
    group.querySelector('.mc-group__trigger')?.setAttribute('aria-expanded', 'true');
  }
}

function openDrawer() {
  document.getElementById('mc-sidebar')?.classList.add('is-open');
  const backdrop = document.getElementById('mc-backdrop');
  if (backdrop) backdrop.hidden = false;
}

function closeDrawer() {
  document.getElementById('mc-sidebar')?.classList.remove('is-open');
  const backdrop = document.getElementById('mc-backdrop');
  if (backdrop) backdrop.hidden = true;
}
