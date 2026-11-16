// Botón "volver arriba" para las páginas sueltas (Información, Términos,
// Privacidad). Es el mismo botón del inicio (.scroll-top de home.css, ver
// initScrollTop en nav-utils.js), pero no se importa de ahí para no cargar en
// estas páginas todo lo del navbar. Aparece al bajar 400 px y sube suave
// (directo con "reducir animaciones").
const btn = document.getElementById('scroll-top-btn');

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('bl-reduce-motion');
}

if (btn) {
  // Se esconde cuando el pie entra en pantalla: en celular tapaba sus enlaces.
  const footer = document.querySelector('footer');
  const toggle = () => {
    const overFooter = footer && footer.getBoundingClientRect().top < window.innerHeight;
    btn.classList.toggle('scroll-top--visible', window.scrollY > 400 && !overFooter);
  };
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}
