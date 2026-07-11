-- F12-01: bug encontrado en la auditoría de huecos del proyecto —
-- approve_seller_request/approve_delivery_request nunca notificaban al
-- usuario aprobado (ni el rechazo directo desde admin.js, que es un UPDATE
-- de cliente, no un RPC). Un trigger genérico en las dos tablas cubre
-- ambos caminos (RPC de aprobación + UPDATE directo de rechazo) sin
-- duplicar la llamada a create_notification en cada lugar.

CREATE OR REPLACE FUNCTION public.notify_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
declare
  v_type text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'approved' then
    v_type := case TG_TABLE_NAME
      when 'seller_requests' then 'seller_request_approved'
      when 'delivery_requests' then 'delivery_request_approved'
    end;
  elsif new.status = 'rejected' then
    v_type := case TG_TABLE_NAME
      when 'seller_requests' then 'seller_request_rejected'
      when 'delivery_requests' then 'delivery_request_rejected'
    end;
  else
    return new;
  end if;

  perform public.create_notification(new.user_id, v_type, jsonb_build_object('request_id', new.id));
  return new;
end;
$function$;

revoke execute on function public.notify_request_status_change() from public, anon, authenticated;

drop trigger if exists seller_requests_notify_status on public.seller_requests;
create trigger seller_requests_notify_status
  after update on public.seller_requests
  for each row execute function public.notify_request_status_change();

drop trigger if exists delivery_requests_notify_status on public.delivery_requests;
create trigger delivery_requests_notify_status
  after update on public.delivery_requests
  for each row execute function public.notify_request_status_change();
