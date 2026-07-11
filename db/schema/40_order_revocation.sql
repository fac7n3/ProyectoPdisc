-- Botón de arrepentimiento (Ley 24.240 / Res. 424/2020): el cliente puede
-- revocar una compra ya pagada dentro de los 10 días hábiles posteriores,
-- sin justificar el motivo. request_order_revocation() valida ownership,
-- que esté pagada, que no se haya solicitado antes (idempotente) y el plazo
-- (15 días corridos como buffer conservador que siempre cubre 10 días
-- hábiles reales, sin necesitar un calendario de feriados completo).
-- No procesa el reembolso en sí (eso depende del medio de pago y hoy es
-- manual, igual que confirm_transfer_payment) — solo deja constancia y
-- notifica al vendedor para que lo gestione.

alter table public.orders add column if not exists revocation_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_order_revocation(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
declare
  v_client uuid := auth.uid();
  v_order record;
  v_owner_id uuid;
begin
  if v_client is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, client_id, store_id, payment_status, created_at, revocation_requested_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if v_order.client_id != v_client then
    raise exception 'Esta orden no te pertenece.';
  end if;

  if v_order.payment_status != 'paid' then
    raise exception 'Solo se puede solicitar arrepentimiento de una orden pagada.';
  end if;

  if v_order.revocation_requested_at is not null then
    return jsonb_build_object('order_id', p_order_id, 'already_requested', true);
  end if;

  if now() > v_order.created_at + interval '15 days' then
    raise exception 'El plazo para solicitar el arrepentimiento (10 días hábiles) ya venció.';
  end if;

  update public.orders
  set revocation_requested_at = now()
  where id = p_order_id;

  select owner_id into v_owner_id from public.stores where id = v_order.store_id;
  perform public.create_notification(v_owner_id, 'revocation_requested', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('order_id', p_order_id, 'already_requested', false);
end;
$function$;

revoke execute on function public.request_order_revocation(uuid) from public, anon;
grant execute on function public.request_order_revocation(uuid) to authenticated;
