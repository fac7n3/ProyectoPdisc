-- Cambia el ícono de "Papelería" de un lazo/cinta a una bolsita de compras
-- (tipo bolsa de regalo), a pedido del usuario.

update categories set icon = 'fa-solid fa-bag-shopping' where slug = 'papeleria';
