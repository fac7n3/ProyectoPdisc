import { supabase } from './auth-utils.js';

let starSeq = 0;

// Estilos del menú de tres puntos (reseña propia): se inyectan una sola vez
// por documento en vez de repetir cssText largo por cada reseña renderizada.
let _reviewMenuStylesInjected = false;
function ensureReviewMenuStyles() {
  if (_reviewMenuStylesInjected) return;
  _reviewMenuStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .bl-review-menu-btn { width: 1.75rem; height: 1.75rem; border-radius: 50%; border: none; background: none; color: var(--bl-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .bl-review-menu-btn.is-active { background: var(--bl-border-light); color: #111827; }
  `;
  document.head.appendChild(style);
}

/** Cierra todos los menús de tres puntos abiertos en reseñas (cualquier sección de la página). */
function closeAllReviewMenus() {
  document.querySelectorAll('[data-review-menu]').forEach((el) => { el.style.display = 'none'; });
  document.querySelectorAll('.bl-review-menu-btn.is-active').forEach((btn) => btn.classList.remove('is-active'));
}
document.addEventListener('click', closeAllReviewMenus);

/**
 * Selector de estrellas (1 a 5). Reemplaza al `<select>` con opciones "★★★☆☆"
 * que estaba copiado igual acá y en perfil.js (calificar al repartidor):
 * elegir una calificación con un desplegable obliga a abrirlo y leer cinco
 * cadenas casi idénticas, cuando el gesto natural es tocar la tercera estrella.
 *
 * Son radios nativos: el teclado (flechas), el `required` y el envío del
 * formulario los sigue manejando el navegador. El relleno hasta la estrella
 * elegida se hace solo con CSS -- por eso las estrellas se pintan en orden
 * inverso (5→1) y se muestran con `row-reverse`: así "la elegida y las
 * anteriores" son "la elegida y sus hermanas siguientes", que sí se puede
 * expresar con el selector `~`.
 *
 * @returns {{ element, getValue }}
 */
export function buildStarRating({ value = 0, ariaLabel = 'Calificación', doc = document } = {}) {
  const name = `bl-stars-${++starSeq}`;

  const wrap = doc.createElement('div');
  wrap.className = 'bl-stars';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', ariaLabel);

  [5, 4, 3, 2, 1].forEach((n) => {
    const opt = doc.createElement('label');
    opt.className = 'bl-stars__opt';
    opt.title = n === 1 ? '1 estrella' : `${n} estrellas`;

    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(n);
    input.required = true;
    input.className = 'bl-stars__input';
    if (Number(value) === n) input.checked = true;
    // El lector de pantalla no ve la estrella dibujada.
    input.setAttribute('aria-label', opt.title);
    opt.appendChild(input);

    const icon = doc.createElement('i');
    icon.className = 'fa-solid fa-star bl-stars__icon';
    icon.setAttribute('aria-hidden', 'true');
    opt.appendChild(icon);

    wrap.appendChild(opt);
  });

  return {
    element: wrap,
    getValue: () => Number(wrap.querySelector(`input[name="${name}"]:checked`)?.value || 0),
  };
}

/** Promedio y cantidad de reseñas visibles (no ocultas) de un producto o comercio. */
export async function fetchReviewsSummary(targetType, targetId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('is_hidden', false);

  if (error || !data || data.length === 0) return { average: null, count: 0 };

  const average = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
  return { average, count: data.length };
}

/** Lista de reseñas visibles, más recientes primero. */
export async function fetchReviews(targetType, targetId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, client_id')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar reseñas:', error);
    return [];
  }
  return data || [];
}

/** La reseña propia del usuario logueado para este target, si existe. */
export async function fetchOwnReview(targetType, targetId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('client_id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Error al cargar tu reseña:', error);
    return null;
  }
  return data;
}

/** Crea o actualiza (upsert) la reseña propia. */
export async function submitReview(targetType, targetId, rating, comment) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Debés iniciar sesión para dejar una reseña.');

  const { error } = await supabase.from('reviews').upsert(
    {
      target_type: targetType,
      target_id: targetId,
      client_id: session.user.id,
      rating,
      comment: comment || null,
    },
    { onConflict: 'target_type,target_id,client_id' }
  );

  if (error) throw error;
}

/** Borra la reseña propia (reviews_delete_own_or_admin ya cubre la policy). */
export async function deleteOwnReview(targetType, targetId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Debés iniciar sesión.');

  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('client_id', session.user.id);

  if (error) throw error;
}

/** Construye las estrellas (llenas/vacías) de un rating, como texto simple. */
export function buildStarsText(rating) {
  const rounded = Math.round(rating);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

/**
 * Arma la sección completa de reseñas (resumen + lista + form propio) dentro
 * de `container`. No usa innerHTML con datos de la DB (todo vía DOM API).
 */
export async function renderReviewsSection(container, targetType, targetId, { hideForm = false } = {}) {
  container.textContent = '';

  const title = document.createElement('h2');
  title.textContent = 'Reseñas';
  title.style.cssText = 'font-size: 1.25rem; margin-bottom: 0.75rem;';
  container.appendChild(title);

  const summaryEl = document.createElement('div');
  summaryEl.style.cssText = 'margin-bottom: 1rem; color: var(--bl-text-secondary);';
  container.appendChild(summaryEl);

  const listEl = document.createElement('div');
  listEl.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;';
  container.appendChild(listEl);

  const formWrap = document.createElement('div');
  container.appendChild(formWrap);

  const [summary, reviews, ownReview] = await Promise.all([
    fetchReviewsSummary(targetType, targetId),
    fetchReviews(targetType, targetId),
    fetchOwnReview(targetType, targetId),
  ]);

  summaryEl.textContent = summary.count > 0
    ? `${buildStarsText(summary.average)} ${summary.average.toFixed(1)} (${summary.count} reseña${summary.count === 1 ? '' : 's'})`
    : 'Todavía no hay reseñas.';

  if (reviews.length === 0) {
    // hideForm = el dueño del producto/comercio está viendo esto -- no tiene
    // sentido invitarlo a "ser el primero en dejar una reseña" a sí mismo.
    if (!hideForm) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color: var(--bl-text-muted); font-size: 0.9rem;';
      empty.textContent = 'Sé el primero en dejar una reseña.';
      listEl.appendChild(empty);
    }
  } else {
    reviews.forEach((review) => {
      const isOwn = !!(ownReview && review.id === ownReview.id);

      const row = document.createElement('div');
      row.style.cssText = 'padding: 0.75rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); position: relative;';

      const starsLine = document.createElement('div');
      starsLine.style.cssText = 'color: #f59e0b; font-weight: 700;';
      starsLine.textContent = buildStarsText(review.rating);
      row.appendChild(starsLine);

      if (review.comment) {
        const commentP = document.createElement('p');
        commentP.style.cssText = 'margin: 0.35rem 0; color: var(--bl-text);';
        commentP.textContent = review.comment;
        row.appendChild(commentP);
      }

      const meta = document.createElement('div');
      meta.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--bl-text-muted);';
      const dateSpan = document.createElement('span');
      dateSpan.textContent = `Cliente · ${new Date(review.created_at).toLocaleDateString('es-AR')}`;
      meta.appendChild(dateSpan);

      if (isOwn) {
        // Reseña propia: en vez de "Reportar", un menú de tres puntos con
        // Editar (salta al form de abajo, que ya queda en modo "Editar tu
        // reseña" porque existe ownReview) y Eliminar.
        const menuWrap = document.createElement('div');
        menuWrap.style.cssText = 'position: absolute; top: 0.6rem; right: 0.6rem;';

        ensureReviewMenuStyles();
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'bl-review-menu-btn';
        menuBtn.setAttribute('aria-label', 'Opciones de tu reseña');
        menuBtn.setAttribute('aria-haspopup', 'true');
        const menuIcon = document.createElement('i');
        menuIcon.className = 'fa-solid fa-ellipsis';
        menuBtn.appendChild(menuIcon);
        menuWrap.appendChild(menuBtn);

        const menuList = document.createElement('div');
        menuList.style.cssText = 'display: none; position: absolute; top: 2.1rem; right: 0; background: var(--bl-surface); border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.12); min-width: 140px; overflow: hidden; z-index: 5;';

        const editItem = document.createElement('button');
        editItem.type = 'button';
        editItem.textContent = 'Editar reseña';
        editItem.style.cssText = 'display: block; width: 100%; text-align: left; padding: 0.6rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.85rem; color: var(--bl-text);';
        editItem.addEventListener('click', () => {
          menuList.style.display = 'none';
          menuBtn.classList.remove('is-active');
          formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          formWrap.querySelector('textarea')?.focus();
        });
        menuList.appendChild(editItem);

        const deleteItem = document.createElement('button');
        deleteItem.type = 'button';
        deleteItem.textContent = 'Eliminar reseña';
        deleteItem.style.cssText = 'display: block; width: 100%; text-align: left; padding: 0.6rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.85rem; color: #ef4444;';
        deleteItem.addEventListener('click', async () => {
          if (!confirm('¿Eliminar tu reseña? Esta acción no se puede deshacer.')) return;
          try {
            await deleteOwnReview(targetType, targetId);
            await renderReviewsSection(container, targetType, targetId, { hideForm });
          } catch (err) {
            alert(err.message || 'No se pudo eliminar la reseña.');
          }
        });
        menuList.appendChild(deleteItem);

        menuWrap.appendChild(menuList);

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = menuList.style.display === 'block';
          closeAllReviewMenus();
          menuList.style.display = isOpen ? 'none' : 'block';
          menuBtn.classList.toggle('is-active', !isOpen);
        });
        menuList.dataset.reviewMenu = 'true';

        row.appendChild(menuWrap);
      } else {
        const reportBtn = document.createElement('button');
        reportBtn.type = 'button';
        reportBtn.style.cssText = 'background: none; border: none; color: var(--bl-text-muted); text-decoration: underline; cursor: pointer; font-size: 0.8rem;';
        reportBtn.textContent = 'Reportar';
        reportBtn.addEventListener('click', async () => {
          const reason = prompt('¿Por qué querés reportar esta reseña?');
          if (reason === null) return;
          const { error } = await supabase.rpc('report_review', { p_review_id: review.id, p_reason: reason });
          if (error) {
            alert(error.message || 'No se pudo reportar la reseña.');
            return;
          }
          alert('Reseña reportada. El equipo la va a revisar.');
        });
        meta.appendChild(reportBtn);
      }

      row.appendChild(meta);
      listEl.appendChild(row);
    });
  }

  // A113-273: el dueño del producto/comercio no puede dejarse una reseña a
  // sí mismo -- lo decide quien llama (product-modal.js/producto.js) según
  // si el usuario logueado es el owner.
  if (!hideForm) {
    buildReviewForm(formWrap, targetType, targetId, ownReview, () => renderReviewsSection(container, targetType, targetId, { hideForm }));
  }
}

function buildReviewForm(container, targetType, targetId, ownReview, onSubmitted) {
  container.textContent = '';

  const form = document.createElement('form');
  form.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; max-width: 400px;';

  const label = document.createElement('label');
  label.style.cssText = 'font-weight: 600; font-size: 0.9rem;';
  label.textContent = ownReview ? 'Editar tu reseña' : 'Dejar una reseña';
  form.appendChild(label);

  const stars = buildStarRating({
    value: ownReview?.rating ?? 0,
    ariaLabel: 'Tu calificación',
  });
  form.appendChild(stars.element);

  const commentInput = document.createElement('textarea');
  commentInput.placeholder = 'Comentario (opcional)';
  commentInput.maxLength = 1000;
  commentInput.style.cssText = 'padding: 0.5rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-sm); font-family: inherit; min-height: 70px;';
  if (ownReview?.comment) commentInput.value = ownReview.comment;
  form.appendChild(commentInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.style.cssText = 'width: fit-content; padding: 0.6rem 1.25rem; background: var(--bl-primary); color: white; border: none; border-radius: var(--bl-radius-md); font-weight: 700; cursor: pointer;';
  submitBtn.textContent = ownReview ? 'Guardar cambios' : 'Publicar reseña';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await submitReview(targetType, targetId, stars.getValue(), commentInput.value.trim());
      await onSubmitted();
    } catch (err) {
      alert(err.message || 'No se pudo guardar la reseña. ¿Iniciaste sesión?');
    }
  });

  container.appendChild(form);
}
