// Preguntas frecuentes (pages/info.html): al tocar un atajo de tema la página se
// desliza suave hasta ese grupo y lo deja marcado en azul pastel (clase
// .is-marked), así no se pierde de vista dónde cayó. También marca el grupo si
// la página se abre con su ancla (info.html#faq-cuenta).
const chips = [...document.querySelectorAll('.faq-index a[href^="#faq-"]')];
const sections = new Map();
chips.forEach((a) => {
  const section = document.getElementById(a.getAttribute('href').slice(1));
  if (section) sections.set(a, section);
});

// El CSS (a11y.css) ya apaga el scroll suave con "reducir animaciones", pero
// scrollIntoView({ behavior: 'smooth' }) lo ignora: hay que respetarlo acá.
function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('bl-reduce-motion');
}

function mark(section) {
  sections.forEach((s, a) => {
    const on = s === section;
    s.classList.toggle('is-marked', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
  // Tocar el mismo tema dos veces repite el "latido".
  section.classList.remove('is-marked');
  void section.offsetWidth;
  section.classList.add('is-marked');
}

chips.forEach((a) => {
  const section = sections.get(a);
  if (!section) return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    mark(section);
    try { history.replaceState(null, '', `#${section.id}`); } catch { /* sin historial, no pasa nada */ }
  });
});

// Con el ancla en la URL (al abrir la página o con atrás/adelante) se marca el grupo.
function markFromHash() {
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target && [...sections.values()].includes(target)) mark(target);
}
markFromHash();
window.addEventListener('hashchange', markFromHash);

// Botón "volver arriba" (el mismo del inicio, ver initScrollTop en nav-utils.js;
// no se importa de ahí para no cargar en esta página todo lo del navbar).
const scrollTopBtn = document.getElementById('scroll-top-btn');
if (scrollTopBtn) {
  const toggle = () => scrollTopBtn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}
