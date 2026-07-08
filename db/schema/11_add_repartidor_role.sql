-- Migración 11: agregar el rol 'repartidor' al enum app_role.
-- Contexto: handle_new_user (migración 10) ya mapea account_type='repartidor',
-- pero el valor faltaba en el enum, por lo que el registro de un repartidor fallaba.
-- Aplicada a la base real el 2026-07-07 (F0-02 / A113-137, A113-138).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'repartidor';
