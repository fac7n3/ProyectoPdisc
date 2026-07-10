import { supabase } from './auth-utils.js';

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

/** Construye las estrellas (llenas/vacías) de un rating, como texto simple. */
export function buildStarsText(rating) {
  const rounded = Math.round(rating);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

/**
 * Arma la sección completa de reseñas (resumen + lista + form propio) dentro
 * de `container`. No usa innerHTML con datos de la DB (todo vía DOM API).
 */
export async function renderReviewsSection(container, targetType, targetId) {
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
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--bl-text-muted); font-size: 0.9rem;';
    empty.textContent = 'Sé el primero en dejar una reseña.';
    listEl.appendChild(empty);
  } else {
    reviews.forEach((review) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding: 0.75rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md);';

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

      row.appendChild(meta);
      listEl.appendChild(row);
    });
  }

  buildReviewForm(formWrap, targetType, targetId, ownReview, () => renderReviewsSection(container, targetType, targetId));
}

function buildReviewForm(container, targetType, targetId, ownReview, onSubmitted) {
  container.textContent = '';

  const form = document.createElement('form');
  form.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; max-width: 400px;';

  const label = document.createElement('label');
  label.style.cssText = 'font-weight: 600; font-size: 0.9rem;';
  label.textContent = ownReview ? 'Editar tu reseña' : 'Dejar una reseña';
  form.appendChild(label);

  const ratingSelect = document.createElement('select');
  ratingSelect.required = true;
  ratingSelect.style.cssText = 'padding: 0.5rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-sm);';
  [5, 4, 3, 2, 1].forEach((n) => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
    ratingSelect.appendChild(opt);
  });
  if (ownReview) ratingSelect.value = String(ownReview.rating);
  form.appendChild(ratingSelect);

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
      await submitReview(targetType, targetId, parseInt(ratingSelect.value, 10), commentInput.value.trim());
      await onSubmitted();
    } catch (err) {
      alert(err.message || 'No se pudo guardar la reseña. ¿Iniciaste sesión?');
    }
  });

  container.appendChild(form);
}
