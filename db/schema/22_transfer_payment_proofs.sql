-- F2-04 (A113-176) — Transferencia + comprobante.
--
-- payment_proofs (tabla + RLS de select/insert/update) ya existía desde
-- 17_fase2_order_payment_columns.sql, sin usar todavía. Acá se agrega lo que
-- faltaba: el bucket de storage donde vive el archivo del comprobante, un
-- trigger de integridad, y el RPC que el vendedor usa para confirmar/
-- rechazar.

-- =========================================================
-- 1. Bucket privado (a diferencia de products/stores, que son públicos):
--    un comprobante de transferencia es información sensible, no algo para
--    servir por URL directa a cualquiera — se accede con signed URLs.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Convención de paths: payment-proofs/{order_id}/{archivo}. El primer
-- segmento del path (storage.foldername) es el order_id — así la policy
-- puede resolver a qué orden pertenece un objeto sin una tabla extra.

drop policy if exists payment_proofs_storage_insert_client on storage.objects;
create policy payment_proofs_storage_insert_client on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.client_id = auth.uid()
        and o.payment_method = 'transferencia'
    )
  );

drop policy if exists payment_proofs_storage_select_participants on storage.objects;
create policy payment_proofs_storage_select_participants on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (
          o.client_id = auth.uid()
          or o.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

-- =========================================================
-- 2. Integridad: un payment_proof solo puede insertarse para una orden que
--    use 'transferencia' y todavía esté pendiente de pago. La policy de
--    insert en payment_proofs (17_fase2_order_payment_columns.sql) ya exige
--    que la orden sea del cliente, pero no chequea payment_method/status —
--    un trigger es más simple acá que reescribir esa policy.
-- =========================================================
create or replace function public.validate_payment_proof_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select payment_method, payment_status into v_order
  from public.orders where id = new.order_id;

  if v_order is null then
    raise exception 'La orden no existe.';
  end if;

  if v_order.payment_method != 'transferencia' then
    raise exception 'Esta orden no usa el método de pago transferencia.';
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Esta orden ya no está pendiente de pago.';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_proofs_validate_order on public.payment_proofs;
create trigger payment_proofs_validate_order
before insert on public.payment_proofs
for each row execute procedure public.validate_payment_proof_order();

-- Es solo para el trigger, no una RPC de verdad — revocar EXECUTE (mismo
-- criterio que handle_new_user/rls_auto_enable en F1-02, get_advisors lo
-- marca si no se hace).
revoke execute on function public.validate_payment_proof_order() from public;
revoke execute on function public.validate_payment_proof_order() from anon;
revoke execute on function public.validate_payment_proof_order() from authenticated;

-- =========================================================
-- 3. RPC confirm_transfer_payment: solo el vendedor de la tienda del pedido
--    (o un admin) puede confirmar/rechazar. Al confirmar, la orden pasa a
--    paid (mismo destino final que el pago simulado, F2-03). Al rechazar,
--    la orden queda pending para que el cliente pueda subir un comprobante
--    nuevo (no se borra el proof rechazado, queda de auditoría).
-- =========================================================
create or replace function public.confirm_transfer_payment(p_proof_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_proof record;
  v_order record;
begin
  if v_uid is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  v_is_admin := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin';

  select id, order_id, status into v_proof
  from public.payment_proofs
  where id = p_proof_id
  for update;

  if not found then
    raise exception 'El comprobante no existe.';
  end if;

  if v_proof.status != 'pending' then
    raise exception 'Este comprobante ya fue revisado.';
  end if;

  select o.id, o.store_id, o.payment_status into v_order
  from public.orders o
  where o.id = v_proof.order_id
  for update;

  if not v_is_admin and not exists (
    select 1 from public.stores where id = v_order.store_id and owner_id = v_uid
  ) then
    raise exception 'No sos el vendedor de esta orden.';
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Esta orden ya no está pendiente de pago.';
  end if;

  if p_approve then
    update public.payment_proofs set status = 'confirmed', confirmed_by = v_uid where id = p_proof_id;
    update public.orders set payment_status = 'paid', status = 'paid' where id = v_order.id;
  else
    update public.payment_proofs set status = 'rejected', confirmed_by = v_uid where id = p_proof_id;
  end if;

  return jsonb_build_object('proof_id', p_proof_id, 'approved', p_approve);
end;
$$;

revoke execute on function public.confirm_transfer_payment(uuid, boolean) from public;
revoke execute on function public.confirm_transfer_payment(uuid, boolean) from anon;
grant execute on function public.confirm_transfer_payment(uuid, boolean) to authenticated;
