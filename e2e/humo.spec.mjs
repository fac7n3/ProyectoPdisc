import { test, expect, sinProblemas } from './helpers.mjs';

// Páginas públicas que se abren sin sesión. `listo` es lo que tiene que verse
// para decir que la página cargó de verdad (no solo que el HTML llegó).
const PAGINAS = [
  { ruta: '/', listo: 'body' },
  { ruta: '/pages/home.html', listo: '#products-grid .product-card[id]' },
  { ruta: '/pages/search.html?q=a', listo: '.product-card, [data-search-empty], .search-empty' },
  { ruta: '/pages/comercios.html', listo: 'a[href*="comercio.html?id="]' },
  { ruta: '/pages/servicios.html', listo: 'h1' },
  { ruta: '/pages/contratar.html', listo: 'h1' },
  { ruta: '/pages/farmacias.html', listo: 'h1' },
  { ruta: '/pages/info.html', listo: 'h1' },
  { ruta: '/pages/terminos.html', listo: 'h1' },
  { ruta: '/pages/privacidad.html', listo: 'h1' },
  { ruta: '/pages/login.html', listo: 'form' },
  { ruta: '/pages/register.html', listo: 'form' },
  { ruta: '/pages/recuperar-password.html', listo: 'form' },
];

for (const { ruta, listo } of PAGINAS) {
  test(`abre sin errores: ${ruta}`, async ({ page, problemas, escrituras }) => {
    await page.goto(ruta);
    await expect(page.locator(listo).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    sinProblemas(problemas);
    // La telemetría (log_*: búsquedas, vistas) es esperable; se corta igual, pero no es un fallo.
    const datos = escrituras.filter((e) => !e.includes('/rpc/log_'));
    expect(datos, 'Una página pública no debería escribir al abrirse').toEqual([]);
  });
}

test.describe('home', () => {
  test('muestra 16 recomendados y los banners nuevos', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    await expect(page.locator('#products-grid .product-card[id]')).toHaveCount(16);
    // Los 6 espacios nuevos (mosaic_g..l): cada uno trae un banner o el cartel fijo.
    await expect(page.locator('.promo-strip')).not.toHaveCount(0);
    await page.waitForLoadState('networkidle');
    sinProblemas(problemas);
  });

  test('"Ver más productos" suma tarjetas sin repetir ninguna', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    const grilla = page.locator('#discover-grid .product-card[id]');
    const boton = page.locator('#discover-more');
    // La primera tanda se pide sola cuando la persona baja hasta Ofertas (IntersectionObserver real).
    await page.locator('#ofertas').scrollIntoViewIfNeeded();
    await expect(grilla.first()).toBeVisible();
    await boton.scrollIntoViewIfNeeded();
    const antes = await grilla.count();
    await boton.click();
    await expect.poll(() => grilla.count()).toBeGreaterThan(antes);

    // Recomendados y Esenciales pueden compartir algún producto (son listas distintas);
    // lo que no puede pasar es repetir dentro de "Seguí descubriendo" ni contra lo ya mostrado.
    const ids = await page.locator('#discover-grid .product-card[id]').evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size, 'Hay tarjetas repetidas en Seguí descubriendo').toBe(ids.length);
    const otros = await page.locator('.product-card[id]:not(#discover-grid *)').evaluateAll((els) => els.map((e) => e.id));
    expect(ids.filter((id) => otros.includes(id)), 'Seguí descubriendo repite productos ya mostrados').toEqual([]);
    sinProblemas(problemas);
  });

  test('tocar un producto abre el modal y se cierra', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    await page.locator('#products-grid .product-card[id] .product-card__name').first().click();
    const modal = page.locator('#pm-overlay .product-modal');
    await expect(modal).toBeVisible();
    // El modal pasa por "Cargando producto" y después trae el detalle real.
    await expect(modal.locator('.pm-shipping')).toBeVisible();
    await page.locator('#pm-close-btn').click();
    await expect(page.locator('#pm-overlay')).toHaveCount(0);
    sinProblemas(problemas);
  });
});

test.describe('home en teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Desde el 2026-11-16 los chicos ya no van de a dos: uno por fila, del ancho del grande,
  // para que en el teléfono se vean más grandes.
  test('los banners chicos de cada mosaico van de a uno por fila, debajo del grande y a todo el ancho', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    await expect(page.locator('#products-grid .product-card[id]').first()).toBeVisible();
    // Con las publicidades ya pintadas (o los banners fijos, si un espacio no tiene).
    await page.waitForLoadState('networkidle');

    const vista = page.viewportSize();
    for (const slots of [['mosaic_a', 'mosaic_b', 'mosaic_c'], ['mosaic_d', 'mosaic_e', 'mosaic_f']]) {
      const [grande, primero, segundo] = await page.evaluate((lista) => lista.map((slot) => {
        const r = document.querySelector(`[data-promo-slot="${slot}"]`).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      }), slots);
      const nombre = slots.join('/');
      expect(grande.width, `${nombre}: el grande ocupa casi todo el ancho de la pantalla`).toBeGreaterThan(vista.width * 0.75);
      for (const chico of [primero, segundo]) {
        expect(Math.abs(chico.left - grande.left), `${nombre}: cada chico arranca donde arranca el grande`).toBeLessThan(1);
        expect(Math.abs(chico.width - grande.width), `${nombre}: cada chico mide de ancho lo mismo que el grande`).toBeLessThan(1);
      }
      expect(primero.top, `${nombre}: el primer chico va debajo del grande`).toBeGreaterThanOrEqual(grande.bottom);
      expect(segundo.top, `${nombre}: el segundo chico va debajo del primero, no al lado`).toBeGreaterThanOrEqual(primero.bottom);
      expect(Math.abs(primero.height - segundo.height), `${nombre}: los dos chicos miden lo mismo de alto`).toBeLessThan(1);
    }

    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra, 'La página no debe tener scroll horizontal').toBeLessThanOrEqual(0);
    sinProblemas(problemas);
  });
});

test.describe('ficha de producto y comercio', () => {
  test('producto.html carga el detalle de un producto real', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    const id = await page.locator('#products-grid .product-card[id]').first().getAttribute('id');
    await page.goto(`/pages/producto.html?id=${id}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    sinProblemas(problemas);
  });

  test('el comparador "otros comercios" aparece en un producto que está en varios', async ({ page, problemas }, info) => {
    await page.goto('/pages/home.html');
    const ids = await page.locator('.product-card[id]').evaluateAll((els) => els.map((e) => e.id));
    let visto = false;
    for (const id of [...new Set(ids)]) {
      await page.goto(`/pages/producto.html?id=${id}`);
      await page.waitForLoadState('networkidle');
      if (await page.locator('.bl-compare').count()) {
        await page.locator('.bl-compare__title').click(); // viene cerrado
        await expect(page.locator('.bl-compare__row').nth(1)).toBeVisible();
        visto = true;
        break;
      }
    }
    // Depende de los datos: si hoy ningún producto del home se repite, no es un fallo.
    test.skip(!visto, 'Ningún producto del home está hoy en más de un comercio');
    sinProblemas(problemas);
  });

  test('comercio.html carga un comercio real', async ({ page, problemas }) => {
    await page.goto('/pages/comercios.html');
    const link = page.locator('a[href*="comercio.html?id="]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/comercio\.html\?id=/);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    sinProblemas(problemas);
  });
});

test.describe('agregar al carrito', () => {
  // "Agregado al carrito" no lleva aviso (en celular tapaba la pantalla): lo dice el propio
  // botón y el carrito del navbar, con flashAddedToCart de js/cart-utils.js.
  test('el botón pasa a "Agregado", el carrito del navbar rebota y suma, sin aviso', async ({ page, problemas, escrituras }, info) => {
    await page.goto('/pages/home.html');
    const contador = page.locator('#cart-badge');
    const botones = page.locator('#products-grid .product-card[id] .product-card__add');
    await expect(botones.first()).toBeVisible();
    await expect(contador, 'El carrito arranca vacío').toBeHidden();

    // El rebote dura 0,6 s: se anota apenas aparece, para no depender de llegar a verlo.
    await page.evaluate(() => {
      const carrito = document.getElementById('nav-cart');
      new MutationObserver(() => {
        if (carrito.classList.contains('is-bumping')) window.__carritoReboto = true;
      }).observe(carrito, { attributes: true, attributeFilter: ['class'] });
    });

    // Un producto con opciones (color, sabor, talle) no se agrega desde la tarjeta: abre el
    // modal para elegirlas. Se busca el primero que se agrega de un toque.
    const modal = page.locator('#pm-overlay');
    let boton = null;
    let etiqueta = '';
    for (const candidato of await botones.all()) {
      etiqueta = (await candidato.textContent()).trim();
      await candidato.click();
      await expect(candidato.and(page.locator('.is-added')).or(modal).first()).toBeVisible();
      if (await modal.count()) {
        await page.locator('#pm-close-btn').click();
        await expect(modal).toHaveCount(0);
        continue;
      }
      boton = candidato;
      break;
    }
    // Depende de los datos: si hoy todos los recomendados tienen opciones, no es un fallo.
    info.skip(!boton, 'Hoy todos los productos recomendados tienen opciones');

    await expect(boton).toHaveText(/Agregado/);
    await expect(contador, 'El contador del carrito del navbar sube').toHaveText('1');
    expect(await page.evaluate(() => window.__carritoReboto === true), 'El carrito del navbar rebota').toBe(true);
    await expect(page.locator('#bl-toast-container .bl-toast'), 'Agregar al carrito no muestra aviso').toHaveCount(0);

    // El botón vuelve solo a como estaba, y el producto sigue contado.
    await expect(boton).not.toHaveClass(/is-added/);
    await expect(boton).toHaveText(etiqueta);
    await expect(contador).toHaveText('1');

    // Sin sesión el carrito queda en el navegador: no sale nada hacia la base (la telemetría
    // log_* se corta igual, pero es esperable).
    const datos = escrituras.filter((e) => !e.includes('/rpc/log_'));
    expect(datos, 'Agregar al carrito sin sesión no escribe en Supabase').toEqual([]);
    sinProblemas(problemas);
  });
});

test.describe('buscador', () => {
  // Minúscula y sin acentos, para comparar los nombres con lo buscado.
  const plano = (t) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const resultado = '#products-grid .product-card[id], #products-grid .no-results';

  test('"agua" trae solo productos que se llaman así, no los de variante "verde agua"', async ({ page, problemas }, info) => {
    await page.goto('/pages/search.html?q=agua');
    await expect(page.locator(resultado).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const nombres = await page.locator('#products-grid .product-card__name').allTextContents();
    // Sin aguas en el catálogo la búsqueda cae a "parecidos" y lo avisa: ahí no hay nada que comparar.
    info.skip(!nombres.length || await page.locator('#search-note').isVisible(), 'Hoy no hay productos con "agua" en el nombre');
    expect(nombres.filter((n) => !/\bagua/.test(plano(n))), 'Resultados sin "agua" en el nombre').toEqual([]);
    sinProblemas(problemas);
  });

  test('una palabra mal escrita se corrige y la página lo avisa', async ({ page, problemas }, info) => {
    await page.goto('/pages/search.html?q=sapatiyas');
    await expect(page.locator(resultado).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const nombres = await page.locator('#products-grid .product-card__name').allTextContents();
    info.skip(!nombres.length, 'Hoy no hay zapatillas en el catálogo');
    await expect(page.locator('#search-note')).toContainText('zapatillas');
    expect(nombres.filter((n) => !/zapatilla/.test(plano(n))), 'Resultados que no son zapatillas').toEqual([]);
    sinProblemas(problemas);
  });

  test('al escribir sugiere frases para completar, y elegir una busca eso', async ({ page, problemas }, info) => {
    await page.goto('/pages/home.html');
    const input = page.locator('#search-input');
    await input.click();
    await input.pressSequentially('agu', { delay: 40 });
    // "Buscar ..." aparece cuando llegó la respuesta del RPC.
    await expect(page.locator('.search-suggest__row--search')).toBeVisible();
    const frases = page.locator('.search-suggest__row--term');
    info.skip(await frases.count() === 0, 'Hoy ningún producto empieza con "agu"');
    const frase = (await frases.first().textContent()).trim();
    expect(plano(frase)).toContain('agu');
    await frases.first().click();
    await expect(page).toHaveURL(/search\.html\?q=/);
    await expect(page.locator('#catalog-title')).toContainText(frase);
    await expect(page.locator('#products-grid .product-card[id]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    sinProblemas(problemas);
  });

  test('con una palabra mal escrita el desplegable ofrece la corregida', async ({ page, problemas }, info) => {
    await page.goto('/pages/home.html');
    const input = page.locator('#search-input');
    await input.click();
    await input.pressSequentially('sapatiyas', { delay: 40 });
    await expect(page.locator('.search-suggest__row--search')).toContainText('sapatiyas');
    const arreglo = page.locator('.search-suggest__row--fix');
    info.skip(await arreglo.count() === 0, 'Hoy no hay zapatillas en el catálogo');
    await expect(arreglo).toContainText('Quizás quisiste decir');
    await expect(arreglo.locator('.search-suggest__main')).toHaveText('zapatillas');
    sinProblemas(problemas);
  });
});
