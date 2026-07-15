import { supabase, showToast, guardPage } from './auth-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

let currentUserId = null;
let activeConversationId = null;
let conversationsCache = [];

/** Busca la conversación (cliente, comercio) o la crea si no existe (F7-02). */
async function ensureConversation(storeId, productId) {
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id')
    .eq('client_id', currentUserId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (findError) {
    console.error('Error buscando conversación:', findError);
    return;
  }

  if (existing) {
    activeConversationId = existing.id;
    return;
  }

  const { data: created, error: insertError } = await supabase
    .from('conversations')
    .insert({ client_id: currentUserId, store_id: storeId, product_id: productId || null })
    .select('id')
    .single();

  if (insertError) {
    console.error('Error creando conversación:', insertError);
    showToast('No se pudo iniciar la conversación.', 'error');
    return;
  }
  activeConversationId = created.id;
}

function conversationLabel(conv) {
  const iAmClient = conv.client_id === currentUserId;
  return iAmClient ? (conv.stores?.name || 'Comercio') : 'Cliente';
}

async function loadConversations() {
  const panel = document.getElementById('conversations-panel');

  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_id, store_id, product_id, created_at, stores(name), products(title)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar conversaciones:', error);
    panel.textContent = '';
    const errMsg = document.createElement('p');
    errMsg.style.cssText = 'padding: 1rem; color: #ef4444;';
    errMsg.textContent = 'No se pudieron cargar las conversaciones.';
    panel.appendChild(errMsg);
    return;
  }

  conversationsCache = data || [];
  panel.textContent = '';

  if (conversationsCache.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'padding: 1rem; color: var(--bl-text-muted);';
    empty.textContent = 'No tenés conversaciones todavía.';
    panel.appendChild(empty);
    return;
  }

  conversationsCache.forEach((conv) => {
    const btn = document.createElement('button');
    btn.className = `conversation-item${conv.id === activeConversationId ? ' active' : ''}`;
    btn.dataset.id = conv.id;

    const strong = document.createElement('strong');
    strong.textContent = conversationLabel(conv);
    btn.appendChild(strong);

    if (conv.products?.title) {
      const small = document.createElement('small');
      small.textContent = `Sobre: ${conv.products.title}`;
      btn.appendChild(small);
    }

    btn.addEventListener('click', () => selectConversation(conv.id));
    panel.appendChild(btn);
  });

  if (activeConversationId) {
    await loadThread(activeConversationId);
  }
}

async function selectConversation(convId) {
  activeConversationId = convId;
  document.querySelectorAll('.conversation-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === convId);
  });
  await loadThread(convId);
}

async function loadThread(convId) {
  const conv = conversationsCache.find((c) => c.id === convId);
  const panel = document.getElementById('thread-panel');
  panel.textContent = '';

  const header = document.createElement('div');
  header.className = 'thread-header';
  header.textContent = conv ? conversationLabel(conv) : 'Conversación';
  panel.appendChild(header);

  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'thread-messages';
  panel.appendChild(messagesDiv);

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error al cargar mensajes:', error);
  }

  (messages || []).forEach((m) => {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${m.sender_id === currentUserId ? 'mine' : 'theirs'}`;

    const bodyDiv = document.createElement('div');
    bodyDiv.textContent = m.body;
    bubble.appendChild(bodyDiv);

    const time = document.createElement('time');
    time.textContent = new Date(m.created_at).toLocaleString('es-AR');
    bubble.appendChild(time);

    messagesDiv.appendChild(bubble);
  });

  const replyForm = document.createElement('form');
  replyForm.className = 'thread-reply';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Escribí un mensaje...';
  textarea.required = true;
  textarea.maxLength = 2000;
  replyForm.appendChild(textarea);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.textContent = 'Enviar';
  replyForm.appendChild(sendBtn);

  panel.appendChild(replyForm);

  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;

    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: currentUserId,
      body,
    });

    if (sendError) {
      showToast('No se pudo enviar el mensaje.', 'error');
      console.error(sendError);
      return;
    }

    textarea.value = '';
    await loadThread(convId);
  });
}

async function initMensajesPage(user) {
  currentUserId = user.id;
  initNotificationsBell();

  const params = new URLSearchParams(window.location.search);
  const storeParam = params.get('store');
  const productParam = params.get('product');

  if (storeParam) {
    await ensureConversation(storeParam, productParam);
  }

  await loadConversations();
}

guardPage({
  requireAuth: true,
  onReady: (user) => {
    initMensajesPage(user);
  },
});
