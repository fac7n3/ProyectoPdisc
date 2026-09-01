-- A113-299 (BUG) — "Transferencia bancaria" no funciona en el carrito: el
-- cliente elige el método, se crea el pedido (pending) y se le pide subir un
-- comprobante desde "Mis compras"... pero nunca se le mostró a DÓNDE
-- transferir. Auditado el 2026-09-01: de los pedidos reales con
-- payment_method='transferencia', ninguno tiene jamás un payment_proofs
-- asociado (ni uno solo rechazado) -- el cliente no tenía forma de pagar de
-- verdad, así que nadie llegaba a subir nada.
--
-- Fix: un campo de texto libre en stores (CBU/alias/banco, lo que el
-- vendedor quiera poner) que se muestra en el carrito apenas se elige
-- transferencia y también en la tarjeta del pedido en "Mis compras" (para
-- tenerlo a mano al subir el comprobante). Texto libre y no obligatorio a
-- propósito -- no todos los bancos/billeteras usan CBU (alias, cvu, incluso
-- un link de MP), y forzar un formato estructurado hoy sería adivinar de más.

alter table public.stores add column if not exists transfer_info text;

comment on column public.stores.transfer_info is
  'Datos para que el cliente transfiera (CBU/alias/banco), texto libre. Se muestra en el carrito cuando el pago es por transferencia. NULL = el vendedor todavía no lo cargó.';
