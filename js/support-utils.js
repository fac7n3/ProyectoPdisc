/**
 * support-utils.js — Reclamos de soporte
 * Baradero Local
 *
 * Sección compartida "Contactar a soporte": formulario de reclamo nuevo +
 * lista de los reclamos propios con su estado, el hilo de mensajes y los
 * archivos adjuntos. La usan perfil.js (cliente), vender.js (vendedor) y
 * repartidor.js (repartidor) — por eso vive acá y no en una de esas páginas.
 *
 * Adjuntos: se pueden sumar capturas de pantalla (o un PDF) al enviar el
 * reclamo. Van a un bucket privado, se suben ANTES de insertar el ticket y
 * se abren con signed URLs (ver db/schema/73_support_ticket_attachments.sql).
 */
import { supabase } from './auth-utils.js';
import { formatFileSize, storedFileName } from './storage-utils.js';

const STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

const STATUS_BADGE_CLASSES = {
  open: 'tkt-badge--open',
  in_progress: 'tkt-badge--in_progress',
  resolved: 'tkt-badge--resolved',
  cancelled: 'tkt-badge--cancelled',
};

function statusBadgeClass(status) {
  return STATUS_BADGE_CLASSES[status] || 'tkt-badge--open';
}

// --- Adjuntos ---
const BUCKET = 'support-attachments';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60;
const DROP_HINT = `Arrastralas acá o hacé clic — hasta ${MAX_FILES} archivos (imagen o PDF) de 5 MB`;

/**
 * Sube los archivos al bucket y devuelve sus rutas. Si uno falla se borran
 * los que ya habían subido: mejor perder el intento entero que dejar
 * archivos huérfanos ocupando (y costando) lugar en el bucket.
 */
async function uploadAttachments(files, userId, onProgress) {
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1, files.length);
    const file = files[i];
    // Sanea el nombre: nada de "/" ni ".." que intente escapar de la carpeta
    // {uid}/ que exige la policy del bucket.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'archivo';
    // +i para que dos archivos elegidos juntos no compartan el milisegundo.
    const path = `${userId}/${Date.now() + i}-${safeName}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (error) {
      await removeAttachments(paths);
      throw error;
    }
    paths.push(path);
  }
  return paths;
}

async function removeAttachments(paths) {
  if (!paths?.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('No se pudieron borrar los adjuntos del reclamo:', error.message);
}

async function openAttachment(path, trigger) {
  trigger.disabled = true;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  trigger.disabled = false;
  if (error || !data?.signedUrl) {
    showToast('No se pudo abrir el archivo.', 'error');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Fila de archivos adjuntos de un ticket, cada uno abriéndose con su signed
 * URL. Exportada porque el panel de admin muestra exactamente lo mismo
 * (js/admin.js) — el bucket es privado, así que no alcanza con un <a href>.
 */
export function buildAttachmentChips(paths) {
  if (!paths?.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'tkt-chips';

  const label = document.createElement('span');
  label.className = 'tkt-chips__label';
  const clip = document.createElement('i');
  clip.className = 'fa-solid fa-paperclip';
  clip.setAttribute('aria-hidden', 'true');
  label.append(clip, document.createTextNode(
    paths.length === 1 ? ' 1 archivo adjunto' : ` ${paths.length} archivos adjuntos`
  ));
  wrap.appendChild(label);

  paths.forEach((path) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tkt-chip';
    chip.title = 'Abrir el archivo en una pestaña nueva';

    const icon = document.createElement('i');
    icon.className = /\.pdf$/i.test(path) ? 'fa-solid fa-file-pdf' : 'fa-solid fa-image';
    icon.setAttribute('aria-hidden', 'true');
    chip.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'tkt-chip__name';
    name.textContent = storedFileName(path);
    chip.appendChild(name);

    chip.addEventListener('click', () => openAttachment(path, chip));
    wrap.appendChild(chip);
  });

  return wrap;
}

/**
 * Selector de adjuntos: zona para arrastrar o hacer clic + la lista de lo
 * elegido con miniatura, peso y botón para sacarlo.
 *
 * El <input type="file"> nativo no se puede estilar (cada navegador dibuja su
 * propio "Seleccionar archivo... Ningún archivo seleccionado"), así que queda
 * oculto y lo dispara un <button> real — botón y no un div con role, para no
 * reimplementar a mano el foco ni el Enter/Espacio.
 *
 * Devuelve { element, getFiles, cleanup }.
 */
function buildAttachmentPicker() {
  const root = document.createElement('div');
  root.className = 'tkt-attach';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.multiple = true;
  input.hidden = true;

  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'tkt-drop';

  const dropIcon = document.createElement('i');
  dropIcon.className = 'fa-regular fa-images tkt-drop__icon';
  dropIcon.setAttribute('aria-hidden', 'true');

  const dropMain = document.createElement('span');
  dropMain.className = 'tkt-drop__main';
  dropMain.textContent = 'Sumá capturas de pantalla';

  const dropHint = document.createElement('span');
  dropHint.className = 'tkt-drop__hint';
  dropHint.textContent = DROP_HINT;

  drop.append(dropIcon, dropMain, dropHint);

  const list = document.createElement('ul');
  list.className = 'tkt-files';

  const error = document.createElement('p');
  error.className = 'tkt-msg tkt-msg--error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  root.append(drop, list, error, input);

  /** [{ file, url }] — url es el objectURL de la miniatura, null si es PDF. */
  let items = [];

  function fail(msg) {
    error.textContent = msg;
    error.hidden = false;
  }

  function render() {
    list.textContent = '';
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'tkt-file';

      if (item.url) {
        const img = document.createElement('img');
        img.className = 'tkt-file__thumb';
        img.src = item.url;
        img.alt = '';
        li.appendChild(img);
      } else {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-file-pdf tkt-file__thumb tkt-file__thumb--icon';
        icon.setAttribute('aria-hidden', 'true');
        li.appendChild(icon);
      }

      const meta = document.createElement('div');
      meta.className = 'tkt-file__meta';

      const name = document.createElement('span');
      name.className = 'tkt-file__name';
      name.textContent = item.file.name;

      const size = document.createElement('span');
      size.className = 'tkt-file__size';
      size.textContent = formatFileSize(item.file.size);

      meta.append(name, size);
      li.appendChild(meta);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tkt-file__remove';
      remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
      const x = document.createElement('i');
      x.className = 'fa-solid fa-xmark';
      x.setAttribute('aria-hidden', 'true');
      remove.appendChild(x);
      remove.addEventListener('click', () => {
        if (item.url) URL.revokeObjectURL(item.url);
        items.splice(index, 1);
        error.hidden = true;
        render();
        drop.focus();
      });
      li.appendChild(remove);

      list.appendChild(li);
    });

    // Con el cupo lleno la zona no desaparece: se apaga y lo dice, así se
    // entiende por qué dejó de aceptar archivos.
    drop.disabled = items.length >= MAX_FILES;
    dropHint.textContent = drop.disabled ? `Llegaste al máximo de ${MAX_FILES} archivos` : DROP_HINT;
  }

  function addFiles(fileList) {
    error.hidden = true;
    for (const file of Array.from(fileList || [])) {
      if (items.length >= MAX_FILES) {
        fail(`Podés adjuntar hasta ${MAX_FILES} archivos. El resto no se sumó.`);
        break;
      }
      const isImage = file.type.startsWith('image/');
      if (!isImage && file.type !== 'application/pdf') {
        fail(`"${file.name}" no es una imagen ni un PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        fail(`"${file.name}" pesa ${formatFileSize(file.size)} y el máximo son 5 MB.`);
        continue;
      }
      items.push({ file, url: isImage ? URL.createObjectURL(file) : null });
    }
    render();
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = ''; // permite volver a elegir el mismo archivo
  });

  // Sin el preventDefault en dragover el navegador abre el archivo en una
  // pestaña nueva en vez de soltarlo acá.
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    addFiles(e.dataTransfer?.files);
  });

  render();

  return {
    element: root,
    getFiles: () => items.map((i) => i.file),
    cleanup: () => {
      items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
      items = [];
    },
  };
}

export async function submitSupportTicket(subject, message, attachments = []) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Debés iniciar sesión para enviar un reclamo.');

  const row = { user_id: session.user.id, subject, message };
  // La columna solo viaja si hay algo adjunto: así un reclamo sin archivos
  // sigue entrando aunque todavía no se haya aplicado la migración 73.
  if (attachments.length) row.attachments = attachments;

  const { error } = await supabase.from('support_tickets').insert(row);
  if (error) {
    await removeAttachments(attachments);
    throw error;
  }
}

export async function fetchMyTickets() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  // select('*') y no la lista de columnas: así la sección no se rompe en un
  // entorno donde todavía no corrió la migración 73 (attachments).
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar tus reclamos:', error);
    return [];
  }
  return data || [];
}

async function fetchTicketMessages(ticketId) {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('id, sender_id, message, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error al cargar mensajes del reclamo:', error);
    return [];
  }
  return data || [];
}

async function sendTicketMessage(ticketId, message) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Debés iniciar sesión.');

  const { error } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    sender_id: session.user.id,
    message,
  });
  if (error) throw error;
}

async function cancelTicket(ticketId) {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: 'cancelled' })
    .eq('id', ticketId);
  if (error) throw error;
}

/** Campo con etiqueta arriba: <label> real, así el clic enfoca el control. */
function buildField(labelText, control) {
  const field = document.createElement('label');
  field.className = 'tkt-field';

  const label = document.createElement('span');
  label.className = 'tkt-label';
  label.textContent = labelText;

  field.append(label, control);
  return field;
}

function buildTicketForm(container) {
  const card = document.createElement('section');
  card.className = 'tkt-card';

  const head = document.createElement('header');
  head.className = 'tkt-card__head';

  const icon = document.createElement('span');
  icon.className = 'tkt-card__icon';
  const headsetIcon = document.createElement('i');
  headsetIcon.className = 'fa-solid fa-headset';
  headsetIcon.setAttribute('aria-hidden', 'true');
  icon.appendChild(headsetIcon);

  const headText = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'tkt-card__title';
  title.textContent = '¿Necesitás ayuda?';
  const sub = document.createElement('p');
  sub.className = 'tkt-card__sub';
  sub.textContent = 'Contanos qué pasó y te respondemos por acá mismo. Si podés, sumá una captura: se resuelve mucho más rápido.';
  headText.append(title, sub);

  head.append(icon, headText);
  card.appendChild(head);

  const form = document.createElement('form');
  form.className = 'tkt-form';

  const subjectInput = document.createElement('input');
  subjectInput.type = 'text';
  subjectInput.placeholder = 'Ej: No me llegó el pedido';
  subjectInput.required = true;
  subjectInput.maxLength = 150;
  subjectInput.className = 'tkt-input';
  form.appendChild(buildField('Asunto', subjectInput));

  const messageInput = document.createElement('textarea');
  messageInput.placeholder = 'Contanos qué pasó, con el número de pedido o el nombre del comercio si viene al caso.';
  messageInput.required = true;
  messageInput.maxLength = 2000;
  messageInput.className = 'tkt-textarea';

  const messageField = buildField('¿Qué pasó?', messageInput);
  const counter = document.createElement('span');
  counter.className = 'tkt-counter';
  counter.textContent = `0 / ${messageInput.maxLength}`;
  messageField.appendChild(counter);
  messageInput.addEventListener('input', () => {
    counter.textContent = `${messageInput.value.length} / ${messageInput.maxLength}`;
  });
  form.appendChild(messageField);

  const picker = buildAttachmentPicker();
  const attachField = document.createElement('div');
  attachField.className = 'tkt-field';
  const attachLabel = document.createElement('span');
  attachLabel.className = 'tkt-label';
  attachLabel.append(document.createTextNode('Archivos '));
  const optional = document.createElement('span');
  optional.className = 'tkt-label__opt';
  optional.textContent = '(opcional)';
  attachLabel.appendChild(optional);
  attachField.append(attachLabel, picker.element);
  form.appendChild(attachField);

  const formError = document.createElement('p');
  formError.className = 'tkt-msg tkt-msg--error';
  formError.setAttribute('role', 'alert');
  formError.hidden = true;
  form.appendChild(formError);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'tkt-submit';
  const sendIcon = document.createElement('i');
  sendIcon.className = 'fa-solid fa-paper-plane';
  sendIcon.setAttribute('aria-hidden', 'true');
  const submitText = document.createElement('span');
  submitText.textContent = 'Enviar reclamo';
  submitBtn.append(sendIcon, submitText);
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    submitBtn.disabled = true;
    const files = picker.getFiles();
    submitText.textContent = files.length ? 'Subiendo archivos...' : 'Enviando...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Debés iniciar sesión para enviar un reclamo.');

      const paths = await uploadAttachments(files, session.user.id, (done, total) => {
        submitText.textContent = `Subiendo archivos (${done}/${total})...`;
      });
      submitText.textContent = 'Enviando...';
      await submitSupportTicket(subjectInput.value.trim(), messageInput.value.trim(), paths);

      picker.cleanup();
      showToast('Reclamo enviado. Te respondemos por acá.', 'success');
      await renderSupportSection(container);
    } catch (err) {
      console.error('Error al enviar el reclamo:', err);
      formError.textContent = err.message || 'No se pudo enviar el reclamo. Probá de nuevo.';
      formError.hidden = false;
      submitBtn.disabled = false;
      submitText.textContent = 'Enviar reclamo';
    }
  });

  card.appendChild(form);
  return card;
}

/**
 * Sección compartida "Contactar a soporte" — formulario + lista de reclamos
 * propios con estado, hilo de mensajes expandible, adjuntos y cancelación.
 */
export async function renderSupportSection(container) {
  container.textContent = '';
  container.appendChild(buildTicketForm(container));

  const tickets = await fetchMyTickets();

  const listHead = document.createElement('div');
  listHead.className = 'tkt-listhead';
  const listTitle = document.createElement('h3');
  listTitle.className = 'tkt-heading';
  listTitle.textContent = 'Mis reclamos';
  listHead.appendChild(listTitle);
  if (tickets.length) {
    const count = document.createElement('span');
    count.className = 'tkt-count';
    count.textContent = tickets.length;
    listHead.appendChild(count);
  }
  container.appendChild(listHead);

  if (tickets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tkt-empty';
    const emptyIcon = document.createElement('i');
    emptyIcon.className = 'fa-regular fa-comments';
    emptyIcon.setAttribute('aria-hidden', 'true');
    const emptyText = document.createElement('p');
    emptyText.textContent = 'Todavía no enviaste ningún reclamo.';
    const emptyHint = document.createElement('span');
    emptyHint.textContent = 'Cuando envíes uno vas a poder seguir la conversación desde acá.';
    empty.append(emptyIcon, emptyText, emptyHint);
    container.appendChild(empty);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;

  const list = document.createElement('div');
  list.className = 'tkt-list';

  for (const t of tickets) {
    const row = document.createElement('div');
    row.className = 'tkt-item';
    row.id = `ticket-${t.id}`;

    const top = document.createElement('button');
    top.type = 'button';
    top.className = 'tkt-item__top';
    top.setAttribute('aria-expanded', 'false');

    const main = document.createElement('span');
    main.className = 'tkt-item__main';

    const subjectSpan = document.createElement('strong');
    subjectSpan.className = 'tkt-item__subject';
    subjectSpan.textContent = t.subject;
    main.appendChild(subjectSpan);

    const preview = document.createElement('span');
    preview.className = 'tkt-item__preview';
    preview.textContent = t.message;
    main.appendChild(preview);

    const meta = document.createElement('span');
    meta.className = 'tkt-item__meta';
    const dateSpan = document.createElement('span');
    dateSpan.textContent = new Date(t.created_at).toLocaleDateString('es-AR', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    meta.appendChild(dateSpan);
    const attachments = t.attachments || [];
    if (attachments.length) {
      const clip = document.createElement('span');
      clip.className = 'tkt-item__clip';
      const clipIcon = document.createElement('i');
      clipIcon.className = 'fa-solid fa-paperclip';
      clipIcon.setAttribute('aria-hidden', 'true');
      clip.append(clipIcon, document.createTextNode(` ${attachments.length}`));
      meta.appendChild(clip);
    }
    main.appendChild(meta);

    top.appendChild(main);

    const statusSpan = document.createElement('span');
    statusSpan.className = `tkt-badge ${statusBadgeClass(t.status)}`;
    statusSpan.textContent = statusLabel(t.status);
    top.appendChild(statusSpan);

    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down tkt-item__chev';
    chevron.setAttribute('aria-hidden', 'true');
    top.appendChild(chevron);

    row.appendChild(top);

    const thread = document.createElement('div');
    thread.className = 'tkt-thread';
    row.appendChild(thread);

    top.addEventListener('click', async () => {
      const isOpen = thread.classList.toggle('tkt-thread--open');
      row.classList.toggle('tkt-item--open', isOpen);
      top.setAttribute('aria-expanded', String(isOpen));
      if (isOpen && !thread.dataset.loaded) {
        thread.dataset.loaded = '1';
        await renderTicketThread(thread, t, myId, container);
      }
    });

    list.appendChild(row);
  }

  container.appendChild(list);

  // A113-271: click en una notificación de soporte trae acá con ?ticket=<id>
  // -- abre el hilo de ese reclamo puntual y lo lleva a la vista.
  const ticketIdParam = new URLSearchParams(window.location.search).get('ticket');
  if (ticketIdParam) {
    const targetRow = list.querySelector(`#ticket-${CSS.escape(ticketIdParam)}`);
    if (targetRow) {
      targetRow.querySelector('.tkt-item__top')?.click();
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetRow.style.transition = 'box-shadow 0.3s ease';
      targetRow.style.boxShadow = '0 0 0 3px var(--bl-primary)';
      setTimeout(() => { targetRow.style.boxShadow = ''; }, 2200);
    }
    const url = new URL(window.location);
    url.searchParams.delete('ticket');
    window.history.replaceState({}, '', url);
  }
}

async function renderTicketThread(threadEl, ticket, myId, container) {
  threadEl.textContent = '';

  // El reclamo original arriba de todo: el texto completo (en la lista se ve
  // recortado a una línea) y los archivos con los que se envió.
  const original = document.createElement('div');
  original.className = 'tkt-original';
  const originalMsg = document.createElement('p');
  originalMsg.className = 'tkt-original__msg';
  originalMsg.textContent = ticket.message;
  original.appendChild(originalMsg);
  const chips = buildAttachmentChips(ticket.attachments);
  if (chips) original.appendChild(chips);
  threadEl.appendChild(original);

  const messages = await fetchTicketMessages(ticket.id);

  if (messages.length > 0) {
    const msgList = document.createElement('div');
    msgList.className = 'tkt-thread__list';

    messages.forEach((m) => {
      const isMine = m.sender_id === myId;
      const bubble = document.createElement('div');
      bubble.className = `tkt-bubble ${isMine ? 'tkt-bubble--mine' : 'tkt-bubble--theirs'}`;
      bubble.textContent = m.message;

      const meta = document.createElement('div');
      meta.className = 'tkt-bubble__meta';
      meta.textContent = new Date(m.created_at).toLocaleString('es-AR');
      bubble.appendChild(meta);

      msgList.appendChild(bubble);
    });
    threadEl.appendChild(msgList);
  } else {
    const noMsgs = document.createElement('p');
    noMsgs.className = 'tkt-thread__note';
    noMsgs.textContent = 'Todavía no hay respuestas.';
    threadEl.appendChild(noMsgs);
  }

  if (ticket.status === 'cancelled' || ticket.status === 'resolved') {
    const closed = document.createElement('p');
    closed.className = 'tkt-thread__note';
    closed.textContent = ticket.status === 'cancelled' ? 'Reclamo cancelado.' : 'Reclamo resuelto.';
    threadEl.appendChild(closed);
    return;
  }

  const replyForm = document.createElement('div');
  replyForm.className = 'tkt-reply';

  const replyInput = document.createElement('textarea');
  replyInput.placeholder = 'Escribí una respuesta...';
  replyInput.maxLength = 2000;
  replyInput.className = 'tkt-reply__input';
  replyForm.appendChild(replyInput);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'tkt-reply__send';
  sendBtn.textContent = 'Enviar';
  replyForm.appendChild(sendBtn);

  sendBtn.addEventListener('click', async () => {
    const msg = replyInput.value.trim();
    if (!msg) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando...';
    try {
      await sendTicketMessage(ticket.id, msg);
      threadEl.dataset.loaded = '';
      await renderTicketThread(threadEl, ticket, myId, container);
    } catch (err) {
      showToast(err.message || 'No se pudo enviar.', 'error');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Enviar';
    }
  });

  threadEl.appendChild(replyForm);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'tkt-cancel';
  cancelBtn.textContent = 'Cancelar reclamo';
  cancelBtn.addEventListener('click', async () => {
    if (!confirm('¿Cancelar este reclamo?')) return;
    try {
      await cancelTicket(ticket.id);
      showToast('Reclamo cancelado.', 'success');
      await renderSupportSection(container);
    } catch (err) {
      showToast(err.message || 'No se pudo cancelar.', 'error');
    }
  });
  threadEl.appendChild(cancelBtn);
}

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) {
    alert(msg);
    return;
  }
  toast.textContent = msg;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast--success');
  if (type === 'error') toast.classList.add('toast--error');
  toast.classList.add('toast--visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('toast--visible'), 2500);
}
