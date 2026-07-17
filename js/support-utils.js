import { supabase } from './auth-utils.js';

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

export async function submitSupportTicket(subject, message) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Debés iniciar sesión para enviar un reclamo.');

  const { error } = await supabase.from('support_tickets').insert({
    user_id: session.user.id,
    subject,
    message,
  });
  if (error) throw error;
}

export async function fetchMyTickets() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, message, status, created_at')
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

/**
 * Sección compartida "Contactar a soporte" — form (asunto/mensaje) + lista de
 * reclamos propios con su estado + hilo de mensajes expandible + cancelar.
 * Usada en perfil.js (cliente), vender.js (vendedor) y repartidor.js (repartidor).
 */
export async function renderSupportSection(container) {
  container.textContent = '';

  const formTitle = document.createElement('h3');
  formTitle.className = 'tkt-heading';
  formTitle.textContent = 'Contactar a soporte';
  container.appendChild(formTitle);

  const form = document.createElement('form');
  form.className = 'tkt-form';

  const subjectInput = document.createElement('input');
  subjectInput.type = 'text';
  subjectInput.placeholder = 'Asunto';
  subjectInput.required = true;
  subjectInput.maxLength = 150;
  subjectInput.className = 'tkt-input';
  form.appendChild(subjectInput);

  const messageInput = document.createElement('textarea');
  messageInput.placeholder = 'Contanos qué pasó...';
  messageInput.required = true;
  messageInput.maxLength = 2000;
  messageInput.className = 'tkt-textarea';
  form.appendChild(messageInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'tkt-submit';
  submitBtn.textContent = 'Enviar reclamo';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      await submitSupportTicket(subjectInput.value.trim(), messageInput.value.trim());
      await renderSupportSection(container);
    } catch (err) {
      console.error('Error al enviar el reclamo:', err);
      alert(err.message || 'No se pudo enviar el reclamo.');
      submitBtn.disabled = false;
    }
  });

  container.appendChild(form);

  const listTitle = document.createElement('h3');
  listTitle.className = 'tkt-heading';
  listTitle.textContent = 'Mis reclamos';
  container.appendChild(listTitle);

  const tickets = await fetchMyTickets();

  if (tickets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'tkt-empty';
    empty.textContent = 'Todavía no enviaste ningún reclamo.';
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

    const top = document.createElement('div');
    top.className = 'tkt-item__top';

    const subjectSpan = document.createElement('strong');
    subjectSpan.className = 'tkt-item__subject';
    subjectSpan.textContent = t.subject;
    top.appendChild(subjectSpan);

    const statusSpan = document.createElement('span');
    statusSpan.className = `tkt-badge ${statusBadgeClass(t.status)}`;
    statusSpan.textContent = statusLabel(t.status);
    top.appendChild(statusSpan);

    row.appendChild(top);

    const msgP = document.createElement('p');
    msgP.className = 'tkt-item__msg';
    msgP.textContent = t.message;
    row.appendChild(msgP);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'tkt-item__date';
    dateSpan.textContent = new Date(t.created_at).toLocaleDateString('es-AR');
    row.appendChild(dateSpan);

    if (t.status !== 'cancelled' && t.status !== 'resolved') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'tkt-cancel';
      cancelBtn.textContent = 'Cancelar reclamo';
      cancelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Cancelar este reclamo?')) return;
        try {
          await cancelTicket(t.id);
          showToast('Reclamo cancelado.', 'success');
          await renderSupportSection(container);
        } catch (err) {
          alert(err.message || 'No se pudo cancelar.');
        }
      });
      row.appendChild(cancelBtn);
    }

    const thread = document.createElement('div');
    thread.className = 'tkt-thread';
    row.appendChild(thread);

    thread.addEventListener('click', (e) => e.stopPropagation());

    top.addEventListener('click', async () => {
      const isOpen = thread.classList.toggle('tkt-thread--open');
      if (isOpen && !thread.dataset.loaded) {
        thread.dataset.loaded = '1';
        await renderTicketThread(thread, t, myId, container);
      }
    });

    list.appendChild(row);
  }

  container.appendChild(list);
}

async function renderTicketThread(threadEl, ticket, myId, container) {
  threadEl.textContent = '';

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
      alert(err.message || 'No se pudo enviar.');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Enviar';
    }
  });

  threadEl.appendChild(replyForm);
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
  toast.classList.add('toast--visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('toast--visible'), 2500);
}
