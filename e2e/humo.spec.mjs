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

  test('los banners chicos de cada mosaico van de a dos, debajo del grande', async ({ page, problemas }) => {
    await page.goto('/pages/home.html');
    await expect(page.locator('#products-grid .product-card[id]').first()).toBeVisible();
    // Con las publicidades ya pintadas (o los banners fijos, si un espacio no tiene).
    await page.waitForLoadState('networkidle');

    for (const slots of [['mosaic_a', 'mosaic_b', 'mosaic_c'], ['mosaic_d', 'mosaic_e', 'mosaic_f']]) {
      const [grande, izq, der] = await page.evaluate((lista) => lista.map((slot) => {
        const r = document.querySelector(`[data-promo-slot="${slot}"]`).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      }), slots);
      const nombre = slots.join('/');
      expect(Math.abs(izq.top - der.top), `${nombre}: los dos chicos arrancan a la misma altura`).toBeLessThan(1);
      expect(Math.abs(izq.height - der.height), `${nombre}: los dos chicos miden lo mismo de alto`).toBeLessThan(1);
      expect(izq.right, `${nombre}: uno al lado del otro, sin pisarse`).toBeLessThanOrEqual(der.left);
      expect(izq.top, `${nombre}: debajo del grande`).toBeGreaterThanOrEqual(grande.bottom);
      expect(izq.width, `${nombre}: cada chico ocupa menos de la mitad del grande`).toBeLessThan(grande.width / 2);
      expect(Math.abs(izq.width - der.width), `${nombre}: columnas parejas`).toBeLessThan(1);
      expect(der.right, `${nombre}: no se sale del ancho del grande`).toBeLessThanOrEqual(grande.right + 1);
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

test.describe('avisos', () => {
  test('agregar al carrito avisa en la pila única, arriba a la derecha', async ({ page }) => {
    await page.goto('/pages/home.html');
    await page.locator('#products-grid .product-card[id] .product-card__add').first().click();
    const aviso = page.locator('#bl-toast-container .bl-toast').first();
    await expect(aviso).toBeVisible();
    const caja = await aviso.boundingBox();
    const vista = page.viewportSize();
    expect(caja.y, 'el aviso tiene que estar arriba').toBeLessThan(vista.height / 3);
    expect(caja.x + caja.width / 2, 'y del lado derecho').toBeGreaterThan(vista.width / 2);
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
