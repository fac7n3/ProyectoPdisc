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
