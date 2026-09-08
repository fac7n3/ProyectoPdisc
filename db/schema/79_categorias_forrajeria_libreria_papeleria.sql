-- Baja de las categorías "Farmacia" y "Deportes" (con sus productos),
-- renombre de "Mascotas" a "Forrajería" y alta de "Librería" y "Papelería".

delete from products
where category_id in (select id from categories where slug in ('farmacia', 'deportes'));

delete from categories where slug in ('farmacia', 'deportes');

update categories set name = 'Forrajería', slug = 'forrajeria', icon = 'fa-solid fa-wheat-awn' where slug = 'mascotas';

insert into categories (name, slug, icon) values
  ('Librería', 'libreria', 'fa-solid fa-book'),
  ('Papelería', 'papeleria', 'fa-solid fa-ribbon');
