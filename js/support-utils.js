import { supabase } from './auth-utils.js';

const STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function statusColor(status) {
  if (status === 'resolved') return 'background: #d1fae5; color: #059669;';
  if (status === 'in_progress') return 'background: #fef3c7; color: #d97706;';
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

/**
 * F12-11: sección compartida "Contactar a soporte" -- form (asunto/mensaje)
 * + lista de reclamos propios con su estado. Usada en perfil.js (cliente),
 * vender.js (vendedor) y repartidor.js (repartidor), mismo patrón que
 * reviews-utils.js/notifications-utils.js (un módulo, varios puntos de
 * integración). Alcance a propósito acotado: sin hilo de respuesta en la
 * app -- el admin solo cambia el estado (ver 46_support_tickets.sql).
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

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.6rem;';

  tickets.forEach((t) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding: 0.75rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-md, 0.5rem);';

    const top = document.createElement('div');
    top.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;';

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

    list.appendChild(row);
  });

  container.appendChild(list);
}
