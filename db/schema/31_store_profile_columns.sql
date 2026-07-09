-- F5-08 (A113-198) — Edición del perfil de la tienda.
-- Extraída de 13_target_data_model.sql (sección 4) al arrancar esta tarea.
-- Nota histórica (F0-08/RUN_LOCAL.md): comercio.js ya leía `store.description`
-- sin que la columna existiera -> siempre caía al fallback "Sin descripción
-- disponible." Se resuelve al aplicar este bloque.

alter table public.stores
  add column if not exists description text,
  add column if not exists zone text,
  add column if not exists hours jsonb;
