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

function statusColor(status) {
  if (status === 'resolved') return 'background: #d1fae5; color: #059669;';
  if (status === 'in_progress') return 'background: #fef3c7; color: #d97706;';
  if (status === 'cancelled') return 'background: #fee2e2; color: #dc2626;';
  return 'background: #e2e8f0; color: #4a5568;';
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
  formTitle.style.cssText = 'font-size: 1.1rem; margin-bottom: 0.5rem;';
  formTitle.textContent = 'Contactar a soporte';
  container.appendChild(formTitle);

  const form = document.createElement('form');
  form.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; margin-bottom: 1.5rem;';

  const subjectInput = document.createElement('input');
  subjectInput.type = 'text';
  subjectInput.placeholder = 'Asunto';
  subjectInput.required = true;
  subjectInput.maxLength = 150;
  subjectInput.style.cssText = 'padding: 0.5rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-sm, 0.375rem);';
  form.appendChild(subjectInput);

  const messageInput = document.createElement('textarea');
  messageInput.placeholder = 'Contanos qué pasó...';
  messageInput.required = true;
  messageInput.maxLength = 2000;
  messageInput.style.cssText = 'padding: 0.5rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-sm, 0.375rem); min-height: 90px; font-family: inherit;';
  form.appendChild(messageInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.style.cssText = 'width: fit-content; padding: 0.6rem 1.25rem; background: var(--bl-primary, #2563eb); color: white; border: none; border-radius: var(--bl-radius-md, 0.5rem); font-weight: 700; cursor: pointer;';
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
  listTitle.style.cssText = 'font-size: 1.1rem; margin-bottom: 0.5rem;';
  listTitle.textContent = 'Mis reclamos';
  container.appendChild(listTitle);

  const tickets = await fetchMyTickets();

  if (tickets.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--bl-text-muted, #94a3b8); font-size: 0.9rem;';
    empty.textContent = 'Todavía no enviaste ningún reclamo.';
    container.appendChild(empty);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.6rem;';

  for (const t of tickets) {
    const row = document.createElement('div');
    row.style.cssText = 'padding: 0.75rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-md, 0.5rem);';

    const top = document.createElement('div');
    top.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; cursor: pointer;';
    top.addEventListener('click', () => {
      const thread = row.querySelector('.ticket-thread');
      if (thread) {
        thread.style.display = thread.style.display === 'none' ? 'block' : 'none';
      }
    });

    const subjectSpan = document.createElement('strong');
    subjectSpan.textContent = t.subject;
    top.appendChild(subjectSpan);

    const statusSpan = document.createElement('span');
    statusSpan.style.cssText = `font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; ${statusColor(t.status)}`;
    statusSpan.textContent = statusLabel(t.status);
    top.appendChild(statusSpan);

    row.appendChild(top);

    const msgP = document.createElement('p');
    msgP.style.cssText = 'margin: 0.35rem 0; font-size: 0.9rem; color: var(--bl-text-secondary, #4a5568);';
    msgP.textContent = t.message;
    row.appendChild(msgP);

    const dateSpan = document.createElement('span');
    dateSpan.style.cssText = 'font-size: 0.8rem; color: var(--bl-text-muted, #94a3b8);';
    dateSpan.textContent = new Date(t.created_at).toLocaleDateString('es-AR');
    row.appendChild(dateSpan);

    if (t.status !== 'cancelled' && t.status !== 'resolved') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.style.cssText = 'display: block; margin-top: 0.4rem; background: none; border: 1px solid #fecaca; color: #dc2626; border-radius: 6px; padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.8rem;';
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
    thread.className = 'ticket-thread';
    thread.style.cssText = 'display: none; margin-top: 0.75rem; border-top: 1px solid var(--bl-border, #e2e8f0); padding-top: 0.75rem;';
    row.appendChild(thread);

    thread.addEventListener('click', (e) => e.stopPropagation());

    top.addEventListener('click', async () => {
      if (thread.style.display === 'block' && !thread.dataset.loaded) {
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
    msgList.style.cssText = 'display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; margin-bottom: 0.75rem;';

    messages.forEach((m) => {
      const isMine = m.sender_id === myId;
      const bubble = document.createElement('div');
      bubble.style.cssText = `padding: 0.5rem 0.75rem; border-radius: 12px; max-width: 80%; font-size: 0.875rem; ${isMine ? 'align-self: flex-end; background: var(--bl-primary, #2563eb); color: white;' : 'align-self: flex-start; background: var(--bl-surface-alt, #f0f4f8);'}`;
      bubble.textContent = m.message;

      const meta = document.createElement('div');
      meta.style.cssText = `font-size: 0.7rem; color: ${isMine ? 'rgba(255,255,255,0.7)' : 'var(--bl-text-muted, #94a3b8)'}; margin-top: 0.2rem;`;
      meta.textContent = new Date(m.created_at).toLocaleString('es-AR');
      bubble.appendChild(meta);

      msgList.appendChild(bubble);
    });
    threadEl.appendChild(msgList);
  } else {
    const noMsgs = document.createElement('p');
    noMsgs.style.cssText = 'font-size: 0.85rem; color: var(--bl-text-muted, #94a3b8); margin-bottom: 0.5rem;';
    noMsgs.textContent = 'Todavía no hay respuestas.';
    threadEl.appendChild(noMsgs);
  }

  if (ticket.status === 'cancelled' || ticket.status === 'resolved') {
    const closed = document.createElement('p');
    closed.style.cssText = 'font-size: 0.85rem; color: var(--bl-text-muted, #94a3b8);';
    closed.textContent = ticket.status === 'cancelled' ? 'Reclamo cancelado.' : 'Reclamo resuelto.';
    threadEl.appendChild(closed);
    return;
  }

  const replyForm = document.createElement('div');
  replyForm.style.cssText = 'display: flex; gap: 0.5rem;';

  const replyInput = document.createElement('textarea');
  replyInput.placeholder = 'Escribí una respuesta...';
  replyInput.maxLength = 2000;
  replyInput.style.cssText = 'flex: 1; padding: 0.5rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-sm, 0.375rem); min-height: 60px; font-family: inherit; resize: vertical;';
  replyForm.appendChild(replyInput);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.style.cssText = 'align-self: flex-end; padding: 0.5rem 1rem; background: var(--bl-primary, #2563eb); color: white; border: none; border-radius: var(--bl-radius-md, 0.5rem); cursor: pointer; font-weight: 600;';
  sendBtn.textContent = 'Enviar';
  replyForm.appendChild(sendBtn);

  sendBtn.addEventListener('click', async () => {
    const msg = replyInput.value.trim();
    if (!msg) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando...';
    try {
      await sendTicketMessage(ticket.id, msg);
      thread.dataset.loaded = '';
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
