-- El aprobar/rechazar una solicitud de profesional (js/admin.js,
-- approveProfessionalRequest/rejectProfessionalRequest) es un UPDATE directo
-- de professional_requests.status, igual que el rechazo de seller_requests/
-- delivery_requests -- pero a esa tabla nunca se le enchufó el trigger
-- genérico de 41_notify_request_status.sql, así que quien pedía sumarse
-- como profesional no se enteraba cuando lo aprobaban. Mismo patrón: se
-- amplía el CASE existente (no se duplica la función) y se agrega el
-- trigger a la tabla que faltaba.

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
      when 'professional_requests' then 'professional_request_approved'
    end;
  elsif new.status = 'rejected' then
    v_type := case TG_TABLE_NAME
      when 'seller_requests' then 'seller_request_rejected'
      when 'delivery_requests' then 'delivery_request_rejected'
      when 'professional_requests' then 'professional_request_rejected'
    end;
  else
    return new;
  end if;

  perform public.create_notification(new.user_id, v_type, jsonb_build_object('request_id', new.id));
  return new;
end;
$function$;

drop trigger if exists professional_requests_notify_status on public.professional_requests;
create trigger professional_requests_notify_status
  after update on public.professional_requests
  for each row execute function public.notify_request_status_change();
