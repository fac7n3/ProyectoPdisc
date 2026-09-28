-- Optimización de carga de "Contratar" (pages/contratar.html): el usuario
-- reportó que la página tarda mucho en mostrar el directorio.
--
-- js/contratar.js armaba la lista con 2 idas y vueltas seriadas al backend:
-- primero SELECT professionals, y recién con esos ids en mano, un
-- Promise.all con 5 SELECT más (reviews, professional_promos,
-- professional_services, professional_business_hours,
-- professional_service_areas). Con el proyecto en us-west-2 y los usuarios en
-- Baradero, cada ida y vuelta pesa bastante de latencia -- y la segunda tanda
-- no podía arrancar hasta que terminara la primera, aunque las 5 consultas de
-- esa tanda ya corrían en paralelo entre sí.
--
-- get_professionals_directory() junta las 6 consultas en 1 sola: la fila de
-- cada profesional activo con sus reseñas (promedio/cantidad), horarios,
-- servicios, zonas y fotos ya agregados en columnas jsonb, vía LATERAL JOIN.
-- SECURITY INVOKER (respeta la RLS del que llama, igual que search_products) y
-- con los mismos filtros explícitos que ya tenía el código -- is_active en
-- professionals y professional_services, is_hidden=false en reviews -- porque
-- las policies "ALL" del admin no filtran esas columnas (mismo comentario que
-- ya tenía loadProfessionals() en el JS).
--
-- rating_avg se castea a float8 (no numeric): PostgREST serializa numeric
-- como string en el JSON para no perder precisión, y el JS hace
-- pro._ratingAvg.toFixed(1) -- con un string ahí explotaría.

create or replace function public.get_professionals_directory()
returns table (
  id uuid,
  owner_id uuid,
  full_name text,
  category text,
  specialty text,
  description text,
  phone text,
  whatsapp text,
  photo_url text,
  serves_24h boolean,
  social_instagram text, social_instagram_show boolean,
  social_facebook text, social_facebook_show boolean,
  social_tiktok text, social_tiktok_show boolean,
  social_x text, social_x_show boolean,
  social_youtube text, social_youtube_show boolean,
  social_website text, social_website_show boolean,
  rating_avg float8,
  rating_count integer,
  horarios jsonb,
  servicios jsonb,
  zonas jsonb,
  promos jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id, p.owner_id, p.full_name, p.category, p.specialty, p.description,
    p.phone, p.whatsapp, p.photo_url, p.serves_24h,
    p.social_instagram, p.social_instagram_show,
    p.social_facebook, p.social_facebook_show,
    p.social_tiktok, p.social_tiktok_show,
    p.social_x, p.social_x_show,
    p.social_youtube, p.social_youtube_show,
    p.social_website, p.social_website_show,
    coalesce(r.rating_avg, 0)::float8 as rating_avg,
    coalesce(r.rating_count, 0) as rating_count,
    coalesce(h.horarios, '[]'::jsonb) as horarios,
    coalesce(s.servicios, '[]'::jsonb) as servicios,
    coalesce(z.zonas, '[]'::jsonb) as zonas,
    coalesce(pr.promos, '[]'::jsonb) as promos
  from professionals p
  left join lateral (
    select round(avg(rating)::numeric, 2)::float8 as rating_avg, count(*)::integer as rating_count
    from reviews
    where target_type = 'professional' and target_id = p.id and is_hidden = false
  ) r on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'day_of_week', day_of_week, 'open_time', open_time, 'close_time', close_time
    ) order by day_of_week, open_time) as horarios
    from professional_business_hours
    where professional_id = p.id
  ) h on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'title', title, 'description', description,
      'price_type', price_type, 'price_pesos', price_pesos
    ) order by sort_order) as servicios
    from professional_services
    where professional_id = p.id and is_active = true
  ) s on true
  left join lateral (
    select jsonb_agg(zone_name) as zonas
    from professional_service_areas
    where professional_id = p.id
  ) z on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'image_url', image_url, 'description', description
    ) order by sort_order, created_at) as promos
    from professional_promos
    where professional_id = p.id
  ) pr on true
  where p.is_active = true
  order by p.full_name;
$$;

grant execute on function public.get_professionals_directory() to anon, authenticated;
