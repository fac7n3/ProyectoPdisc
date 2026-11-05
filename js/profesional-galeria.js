/**
 * Sección "Fotos de trabajos" del panel del profesional.
 *
 * Son filas de `professional_promos` (bucket `professional-promos`). La
 * migración 93 les sumó `sort_order` y `description`: antes eran una pila sin
 * orden y sin pie de foto.
 */

import { compressImage } from './image-compress.js';
import { supabase, showToast } from './auth-utils.js';
import { removeStoredObjects, videoFileProblem, videoExtension, safeVideoUrl } from './storage-utils.js';
import { confirmDialog } from './confirm-dialog.js';

const MAX_FOTOS = 6; // entre fotos y videos
const MAX_VIDEOS = 2;
const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = 'professional-promos';

let ctx = null;
let fotos = [];

export function initGaleria(contexto) {
  ctx = contexto;
  document.getElementById('of-photo-upload')?.addEventListener('change', subir);
  document.getElementById('of-video-upload')?.addEventListener('change', subirVideo);
  ctx.alMostrar('galeria', cargar);
}

async function cargar() {
  const { data, error } = await supabase
    .from('professional_promos')
    .select('id, image_url, description, sort_order, media_type')
    .eq('professional_id', ctx.prof.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando las fotos:', error);
    showToast('No pudimos cargar tus fotos.');
    return;
  }

  fotos = data || [];
  render();
}

function render() {
  const grid = document.getElementById('of-gallery');
  if (!grid) return;
  const { el, icono } = ctx;

  const llenoTotal = fotos.length >= MAX_FOTOS;
  const llenoVideos = fotos.filter(esVideo).length >= MAX_VIDEOS;
  [['of-photo-upload-label', llenoTotal], ['of-video-upload-label', llenoTotal || llenoVideos]].forEach(([id, bloqueado]) => {
    const label = document.getElementById(id);
    if (!label) return;
    label.classList.toggle('is-disabled', bloqueado);
    label.style.pointerEvents = bloqueado ? 'none' : '';
    label.style.opacity = bloqueado ? '0.5' : '';
  });

  if (!fotos.length) {
    const vacio = el('div', 'of-empty');
    vacio.appendChild(icono('fa-solid fa-camera'));
    vacio.appendChild(el('p', null, 'Todavía no subiste fotos ni videos.'));
    vacio.appendChild(el('p', 'of-sub', 'Mostrar trabajos terminados es lo que más convence a alguien que no te conoce.'));
    grid.replaceChildren(vacio);
    return;
  }

  grid.replaceChildren(...fotos.map((foto, i) => tarjeta(foto, i)));
}

function tarjeta(foto, indice) {
  const { el, icono } = ctx;
  const card = el('div', 'of-photo');

  const marco = el('div', 'of-photo__img');
  if (esVideo(foto)) {
    const video = document.createElement('video');
    video.src = `${safeVideoUrl(foto.image_url)}#t=0.1`;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', foto.description || 'Video de un trabajo');
    marco.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = foto.image_url;
    img.alt = foto.description || 'Foto de un trabajo';
    img.loading = 'lazy';
    marco.appendChild(img);
  }
  card.appendChild(marco);

  const body = el('div', 'of-photo__body');

  const pie = el('input', 'of-photo__caption');
  pie.type = 'text';
  pie.maxLength = 160;
  pie.placeholder = 'Describí la foto (opcional)';
  pie.value = foto.description || '';
  pie.setAttribute('aria-label', 'Descripción de la foto');
  // Se guarda al salir del campo: no hace falta un botón por foto.
  pie.addEventListener('blur', () => guardarPie(foto, pie.value.trim()));
  body.appendChild(pie);

  const acciones = el('div', 'of-photo__actions');

  const subir = el('button', 'of-photo__btn');
  subir.type = 'button';
  subir.title = 'Mover antes';
  subir.setAttribute('aria-label', 'Mover esta foto antes');
  subir.appendChild(icono('fa-solid fa-arrow-left'));
  subir.disabled = indice === 0;
  subir.addEventListener('click', () => mover(indice, -1));

  const bajar = el('button', 'of-photo__btn');
  bajar.type = 'button';
  bajar.title = 'Mover después';
  bajar.setAttribute('aria-label', 'Mover esta foto después');
  bajar.appendChild(icono('fa-solid fa-arrow-right'));
  bajar.disabled = indice === fotos.length - 1;
  bajar.addEventListener('click', () => mover(indice, 1));

  const borrar = el('button', 'of-photo__btn');
  borrar.type = 'button';
  borrar.title = 'Borrar foto';
  borrar.setAttribute('aria-label', 'Borrar esta foto');
  borrar.appendChild(icono('fa-solid fa-trash'));
  borrar.addEventListener('click', () => eliminar(foto));

  acciones.append(subir, bajar, borrar);
  body.appendChild(acciones);
  card.appendChild(body);

  return card;
}

function esVideo(foto) {
  return foto.media_type === 'video';
}

async function subir(event) {
  const elegido = event.target.files?.[0];
  event.target.value = '';
  if (!elegido) return;
  // Una foto de celular pesa 3-5 MB: se achica ANTES de mirar el tope de 2 MB.
  const archivo = await compressImage(elegido, 'photo');

  if (fotos.length >= MAX_FOTOS) {
    showToast(`Podés tener hasta ${MAX_FOTOS} fotos. Borrá una para subir otra.`);
    return;
  }
  if (archivo.size > MAX_BYTES) {
    showToast('La foto no puede pesar más de 2 MB.');
    return;
  }

  const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
  const ruta = `${ctx.user.id}/${Date.now()}.${ext}`;

  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(ruta, archivo);
  if (errSubida) {
    console.error('Error subiendo la foto:', errSubida);
    showToast('No pudimos subir la foto.');
    return;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const { error } = await supabase.from('professional_promos').insert({
    professional_id: ctx.prof.id,
    image_url: data?.publicUrl,
    sort_order: fotos.length,
  });

  if (error) {
    console.error('Error guardando la foto:', error);
    showToast('La foto se subió pero no se pudo guardar.');
    return;
  }

  await cargar();
  showToast('Foto agregada.', 'success');
}

async function subirVideo(event) {
  const archivo = event.target.files?.[0];
  event.target.value = '';
  if (!archivo) return;

  if (fotos.length >= MAX_FOTOS) {
    showToast(`Podés tener hasta ${MAX_FOTOS} entre fotos y videos. Borrá uno para subir otro.`);
    return;
  }
  if (fotos.filter(esVideo).length >= MAX_VIDEOS) {
    showToast(`Podés tener hasta ${MAX_VIDEOS} videos. Borrá uno para subir otro.`);
    return;
  }
  const problema = videoFileProblem(archivo);
  if (problema) {
    showToast(problema);
    return;
  }

  showToast('Subiendo el video…', 'success');
  const ruta = `${ctx.user.id}/${Date.now()}.${videoExtension(archivo)}`;
  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type });
  if (errSubida) {
    console.error('Error subiendo el video:', errSubida);
    showToast('No pudimos subir el video.');
    return;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const { error } = await supabase.from('professional_promos').insert({
    professional_id: ctx.prof.id,
    image_url: data?.publicUrl,
    media_type: 'video',
    sort_order: fotos.length,
  });
  if (error) {
    console.error('Error guardando el video:', error);
    // Subido pero sin fila: se borra el archivo para no dejarlo huérfano.
    await removeStoredObjects(supabase, BUCKET, [data?.publicUrl]);
    showToast('El video se subió pero no se pudo guardar.');
    return;
  }

  await cargar();
  showToast('Video agregado.', 'success');
}

async function guardarPie(foto, texto) {
  const valor = texto || null;
  if ((foto.description || null) === valor) return;

  const { error } = await supabase
    .from('professional_promos')
    .update({ description: valor })
    .eq('id', foto.id);

  if (error) {
    console.error('Error guardando la descripción:', error);
    showToast('No pudimos guardar la descripción.');
    return;
  }

  foto.description = valor;
}

async function eliminar(foto) {
  const nombre = esVideo(foto) ? 'este video' : 'esta foto';
  if (!(await confirmDialog(`¿Borramos ${nombre}?`, { confirmText: 'Borrar', danger: true }))) return;

  const { error } = await supabase.from('professional_promos').delete().eq('id', foto.id);
  if (error) {
    console.error('Error borrando la foto:', error);
    showToast('No pudimos borrar la foto.');
    return;
  }

  // Sin esto el archivo queda huérfano en el bucket -- el mismo problema que
  // ya se corrigió con las fotos de producto (js/storage-utils.js).
  await removeStoredObjects(supabase, BUCKET, [foto.image_url]);
  await cargar();
  showToast(esVideo(foto) ? 'Video borrado.' : 'Foto borrada.', 'success');
}

async function mover(indice, delta) {
  const destino = indice + delta;
  if (destino < 0 || destino >= fotos.length) return;

  const copia = [...fotos];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  fotos = copia;
  render();

  const resultados = await Promise.all(
    copia.map((f, i) => supabase.from('professional_promos').update({ sort_order: i }).eq('id', f.id))
  );
  const falla = resultados.find((r) => r.error);
  if (falla) {
    console.error('Error guardando el orden:', falla.error);
    showToast('No pudimos guardar el orden nuevo.');
    cargar();
  }
}
