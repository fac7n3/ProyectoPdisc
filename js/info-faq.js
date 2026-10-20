// Preguntas frecuentes (pages/info.html): al tocar un atajo de tema la página se
// desliza suave hasta ese grupo y lo marca unos segundos en azul pastel (clase
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

// Cuánto dura el color: lo justo para ubicarte, después se desvanece solo.
const MARK_MS = 4000;
let markTimer = null;

function clearMark() {
  sections.forEach((s, a) => {
    s.classList.remove('is-marked');
    a.removeAttribute('aria-current');
  });
}

function mark(section) {
  clearTimeout(markTimer);
  clearMark();
  // Tocar el mismo tema dos veces repite el "latido".
  void section.offsetWidth;
  section.classList.add('is-marked');
  [...sections.entries()].find(([, s]) => s === section)?.[0].setAttribute('aria-current', 'true');
  markTimer = setTimeout(clearMark, MARK_MS);
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
