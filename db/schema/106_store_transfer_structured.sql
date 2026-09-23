-- Transferencia bancaria, paso 2: datos ESTRUCTURADOS para transferir.
--
-- Hasta acá el único dato era `stores.transfer_info` (texto libre, migración
-- 69): se mostraba tal cual y el cliente tenía que seleccionar a mano el
-- alias dentro de una frase ("Banco Nación — Alias: MIVENTA — CBU: ...") para
-- copiarlo, que en el celular es justo lo que sale mal. Con cada dato en su
-- columna, la pantalla que aparece después de "Iniciar pago" puede ofrecer un
-- botón "Copiar" por dato (ver js/transfer-details.js).
--
-- `transfer_info` NO se borra: pasa a ser "Otros datos" (aclaraciones del
-- vendedor, o lo que ya había cargado antes de este cambio) y se sigue
-- mostrando debajo de los campos nuevos.
--
-- Los checks son las reglas de los bancos argentinos, así un dato mal tipeado
-- se frena al guardarlo y no cuando el cliente ya está transfiriendo:
--   * CBU/CVU: exactamente 22 dígitos (se guarda sin espacios).
--   * Alias: 6 a 20 caracteres, letras, números, punto y guion.
-- Todas nullable: ningún dato es obligatorio, el vendedor carga lo que tiene.

alter table public.stores
  add column if not exists transfer_alias  text,
  add column if not exists transfer_cbu    text,
  add column if not exists transfer_holder text,
  add column if not exists transfer_bank   text;

alter table public.stores drop constraint if exists stores_transfer_cbu_format;
alter table public.stores add constraint stores_transfer_cbu_format
  check (transfer_cbu is null or transfer_cbu ~ '^[0-9]{22}$');

alter table public.stores drop constraint if exists stores_transfer_alias_format;
alter table public.stores add constraint stores_transfer_alias_format
  check (transfer_alias is null or transfer_alias ~ '^[A-Za-z0-9.-]{6,20}$');

alter table public.stores drop constraint if exists stores_transfer_holder_len;
alter table public.stores add constraint stores_transfer_holder_len
  check (transfer_holder is null or char_length(transfer_holder) <= 80);

alter table public.stores drop constraint if exists stores_transfer_bank_len;
alter table public.stores add constraint stores_transfer_bank_len
  check (transfer_bank is null or char_length(transfer_bank) <= 60);

comment on column public.stores.transfer_alias  is 'Alias bancario para transferencias (6-20 caracteres). NULL = no cargado.';
comment on column public.stores.transfer_cbu    is 'CBU o CVU, 22 dígitos sin espacios. NULL = no cargado.';
comment on column public.stores.transfer_holder is 'Titular de la cuenta, para que el cliente confirme a quién le transfiere.';
comment on column public.stores.transfer_bank   is 'Banco o billetera (ej. Banco Nación, Mercado Pago).';
comment on column public.stores.transfer_info   is
  'Otros datos para transferir (texto libre). Desde la migración 106 el alias/CBU/titular/banco van en columnas propias; esto queda para aclaraciones.';

-- Backfill: si el texto libre ES un alias y nada más (una sola palabra con
-- forma de alias y al menos un punto, ej. "bere.alg"), se pasa a la columna
-- nueva para que tenga su botón "Copiar". Cualquier otra cosa (frases, CBU
-- con texto, etc.) se deja como está en transfer_info: adivinar de más sería
-- peor que mostrarlo como "Otros datos". Al aplicarse (2026-09-23) esto
-- copió una sola fila.
-- Se COPIA, no se mueve: el frontend que está en producción mientras esta
-- rama no se mergea solo lee transfer_info, y vaciarlo le haría decir al
-- cliente "este comercio no cargó sus datos". El frontend nuevo no lo
-- muestra dos veces (extraTransferNotes descarta el texto igual al alias).
update public.stores
   set transfer_alias = trim(transfer_info)
 where transfer_alias is null
   and trim(transfer_info) ~ '^[A-Za-z0-9.-]{6,20}$'
   and trim(transfer_info) like '%.%';
