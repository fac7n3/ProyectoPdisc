-- F7-02 (A113-?) — Chat comprador-vendedor con contexto de producto (D8),
-- extraída de 13_target_data_model.sql sección 9. Único cambio respecto al
-- diseño original: se agrega `product_id` (nullable) a `conversations` para
-- guardar de qué producto partió la charla — el roadmap pide "chat con
-- contexto de producto", no un hilo de chat separado por producto, así que
-- se mantiene un solo hilo por (cliente, comercio) y el producto queda como
-- dato informativo del inicio de esa conversación.
--
-- Alcance a propósito acotado: sin Supabase Realtime (mismo criterio que el
-- resto del proyecto — "Envíos en curso" F3-04, pagos por confirmar F2-04,
-- etc. — se actualiza al recargar/refrescar, no hay push en vivo). Sin
-- adjuntar imágenes al chat.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, store_id)
);

alter table public.conversations enable row level security;

drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants on public.conversations
  for select to authenticated
  using (
    client_id = auth.uid()
    or store_id in (select id from public.stores where owner_id = auth.uid())
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

drop policy if exists conversations_insert_client on public.conversations;
create policy conversations_insert_client on public.conversations
  for insert to authenticated
  with check (client_id = auth.uid());

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id);

alter table public.messages enable row level security;

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          c.client_id = auth.uid()
          or c.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

drop policy if exists messages_insert_participants on public.messages;
create policy messages_insert_participants on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.client_id = auth.uid() or c.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );
