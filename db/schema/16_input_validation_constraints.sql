-- F1-04 (A113-161/162): validación de CUIT (dígito verificador) e inputs de
-- seller_requests también del lado servidor (el cliente ya valida en
-- vender.js/validation-utils.js, pero nunca hay que confiar solo en eso:
-- cualquiera puede pegarle directo al endpoint de Supabase sin pasar por
-- el formulario).
--
-- Los CHECK permiten NULL a propósito: hay una fila vieja de prueba
-- ("Test Bakery") con cuit/address/phone en null que no se toca. La
-- validación del cliente ya exige estos campos en altas nuevas.

create or replace function public.is_valid_cuit(cuit text)
returns boolean
language plpgsql
immutable
as $$
declare
  clean text;
  digits int[];
  multipliers int[] := array[5,4,3,2,7,6,5,4,3,2];
  total int := 0;
  i int;
  mod_val int;
  expected int;
  check_digit int;
begin
  clean := regexp_replace(coalesce(cuit, ''), '[^0-9]', '', 'g');
  if length(clean) != 11 then
    return false;
  end if;

  for i in 1..11 loop
    digits[i] := substring(clean from i for 1)::int;
  end loop;

  for i in 1..10 loop
    total := total + digits[i] * multipliers[i];
  end loop;

  mod_val := total % 11;
  expected := 11 - mod_val;
  check_digit := case when expected = 11 then 0 when expected = 10 then 9 else expected end;

  return check_digit = digits[11];
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seller_requests_cuit_valid'
  ) then
    alter table public.seller_requests
      add constraint seller_requests_cuit_valid check (cuit is null or public.is_valid_cuit(cuit));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'seller_requests_shop_name_length'
  ) then
    alter table public.seller_requests
      add constraint seller_requests_shop_name_length check (char_length(shop_name) between 3 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'seller_requests_phone_length'
  ) then
    alter table public.seller_requests
      add constraint seller_requests_phone_length check (phone is null or char_length(phone) between 6 and 20);
  end if;
end $$;
