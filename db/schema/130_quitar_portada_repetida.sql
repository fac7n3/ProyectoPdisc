-- La portada vive en products.image_url y NO como fila de product_images (la
-- galería del cliente y del vendedor arma [image_url, ...product_images]).
-- Las migraciones 125 y 129 insertaron todas las fotos, portada incluida, así
-- que en 139 productos la primera foto salía repetida. Se borran esas filas y
-- se reordena `position` para que las restantes arranquen en 0.
delete from public.product_images pi
using public.products p
where p.id = pi.product_id and pi.url = p.image_url;

update public.product_images pi
set position = r.n
from (
  select id, row_number() over (partition by product_id order by position, created_at) - 1 as n
  from public.product_images
) r
where r.id = pi.id and pi.position <> r.n;
