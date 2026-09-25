/**
 * Sección "Reseñas" del panel del profesional: las que le dejaron los vecinos
 * y la respuesta pública que puede escribir debajo de cada una.
 *
 * La respuesta vive en `reviews.owner_reply` (migración 94). Quién puede
 * escribirla lo decide la base: hay una policy que solo deja pasar al dueño de
 * lo reseñado y un trigger que impide que el autor de la reseña se escriba a
 * sí mismo una respuesta falsa. Acá no se valida nada de eso, se muestra.
 *
 * No se muestra el nombre de quien reseñó: el resto del sitio tampoco lo hace
 * (js/reviews-utils.js solo trae client_id).
 */

import { supabase, showToast, setLoading } from './auth-utils.js';
import { buildStarRating } from './reviews-utils.js';
import { confirmDialog } from './confirm-dialog.js';

let ctx = null;
let resenas = [];
/** id de la reseña con el cuadro de respuesta abierto. */
let respondiendo = null;

export function initResenas(contexto) {
  ctx = contexto;
  ctx.alMostrar('resenas', cargar);
}

async function cargar() {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, owner_reply, owner_replied_at')
    .eq('target_type', 'professional')
    .eq('target_id', ctx.prof.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando reseñas:', error);
    showToast('No pudimos cargar tus reseñas.');
    return;
  }

  resenas = data || [];
  render();
}

function render() {
  const lista = document.getElementById('of-reviews-list');
  if (!lista) return;
  const { el, icono } = ctx;

  if (!resenas.length) {
    const vacio = el('div', 'of-empty');
    vacio.appendChild(icono('fa-regular fa-star'));
    vacio.appendChild(el('p', null, 'Todavía no te dejaron reseñas.'));
    vacio.appendChild(el('p', 'of-sub', 'Después de cada trabajo podés pedirle al vecino que te califique: es lo que más pesa para el que todavía no te conoce.'));
    lista.replaceChildren(vacio);
    return;
  }

  lista.replaceChildren(...resenas.map(tarjeta));
}

function tarjeta(resena) {
  const { el } = ctx;
  const card = el('div', 'of-review');

  const head = el('div', 'of-review__head');
  head.appendChild(buildStarRating({ value: resena.rating, ariaLabel: `${resena.rating} de 5 estrellas` }));
  head.appendChild(el('span', 'of-inquiry__when', fechaCorta(resena.created_at)));
  card.appendChild(head);

  if (resena.comment) {
    card.appendChild(el('p', 'of-review__comment', resena.comment));
  } else {
    card.appendChild(el('p', 'of-sub', 'Calificó sin dejar comentario.'));
  }

  if (respondiendo === resena.id) {
    card.appendChild(formularioRespuesta(resena));
  } else if (resena.owner_reply) {
    card.appendChild(bloqueRespuesta(resena));
  } else {
    const responder = el('button', 'of-btn of-btn--ghost of-btn--sm', 'Responder');
    responder.type = 'button';
    responder.style.marginTop = '0.9rem';
    responder.addEventListener('click', () => {
      respondiendo = resena.id;
      render();
    });
    card.appendChild(responder);
  }

  return card;
}

function bloqueRespuesta(resena) {
  const { el } = ctx;
  const bloque = el('div', 'of-review__reply');
  bloque.appendChild(el('div', 'of-review__reply-label', 'Tu respuesta'));
  bloque.appendChild(el('div', 'of-review__reply-text', resena.owner_reply));

  const acciones = el('div', 'of-row__actions');
  acciones.style.marginTop = '0.6rem';

  const editar = el('button', 'of-btn of-btn--ghost of-btn--sm', 'Editar');
  editar.type = 'button';
  editar.addEventListener('click', () => {
    respondiendo = resena.id;
    render();
  });

  const borrar = el('button', 'of-btn of-btn--danger of-btn--sm', 'Borrar respuesta');
  borrar.type = 'button';
  borrar.addEventListener('click', () => guardarRespuesta(resena, null, borrar));

  acciones.append(editar, borrar);
  bloque.appendChild(acciones);
  return bloque;
}

function formularioRespuesta(resena) {
  const { el } = ctx;
  const bloque = el('div', 'of-review__reply');
  bloque.appendChild(el('div', 'of-review__reply-label', 'Tu respuesta'));

  const texto = el('textarea', 'form-input');
  texto.rows = 3;
  texto.maxLength = 1000;
  texto.placeholder = 'Contestá con calma: lo va a leer todo el que mire tu tarjeta.';
  texto.value = resena.owner_reply || '';
  texto.setAttribute('aria-label', 'Tu respuesta a esta reseña');
  bloque.appendChild(texto);

  const acciones = el('div', 'of-row__actions');
  acciones.style.marginTop = '0.6rem';

  const cancelar = el('button', 'of-btn of-btn--ghost of-btn--sm', 'Cancelar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', () => {
    respondiendo = null;
    render();
  });

  const guardar = el('button', 'of-btn of-btn--sm', 'Publicar respuesta');
  guardar.type = 'button';
  guardar.addEventListener('click', () => {
    const valor = texto.value.trim();
    if (!valor) {
      showToast('Escribí algo antes de publicar.');
      return;
    }
    guardarRespuesta(resena, valor, guardar);
  });

  acciones.append(cancelar, guardar);
  bloque.appendChild(acciones);

  // Se abre con el cursor listo y al final de lo que ya había escrito.
  setTimeout(() => {
    texto.focus();
    texto.setSelectionRange(texto.value.length, texto.value.length);
  }, 0);

  return bloque;
}

async function guardarRespuesta(resena, valor, btn) {
  if (valor === null && !(await confirmDialog('¿Borramos tu respuesta? Deja de verse en tu tarjeta.', { confirmText: 'Borrar', danger: true }))) return;

  const etiqueta = btn.textContent;
  setLoading(btn, true);
  // owner_replied_at lo pone el trigger de la base, no el cliente.
  const { error } = await supabase
    .from('reviews')
    .update({ owner_reply: valor })
    .eq('id', resena.id);
  setLoading(btn, false, etiqueta);

  if (error) {
    console.error('Error guardando la respuesta:', error);
    showToast('No pudimos guardar tu respuesta.');
    return;
  }

  resena.owner_reply = valor;
  respondiendo = null;
  render();
  showToast(valor ? 'Respuesta publicada.' : 'Respuesta borrada.', 'success');
}

function fechaCorta(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
