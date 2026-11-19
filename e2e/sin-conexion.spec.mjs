import { test, expect } from './helpers.mjs';

// Farmacias de turno y emergencias sin señal.
//
// Se abre cada página CON conexión (así el service worker guarda las páginas y
// la página guarda sus datos), se corta la conexión y se vuelve a abrir. Los
// datos de Supabase son de prueba (se sirven desde acá) para no depender de qué
// farmacia esté de turno hoy en producción, ni de que las filas existan.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const pad = (n) => String(n).padStart(2, '0');
const hoy = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

// Turno de las 00:00 de hoy a las 00:00 de mañana: vigente a cualquier hora del día de la prueba.
const TURNOS = [{
  id: 'turno-1',
  shift_date: hoy,
  opens_at: '00:00:00',
  closes_at: '00:00:00',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  pharmacies: {
    id: 'farmacia-1', name: 'Farmacia Prueba Sin Señal', address: 'Calle Falsa 123',
    phone: '3329-400000', whatsapp: null, pharmacist: 'Farm. Prueba', insurances: ['OSDE'], maps_url: null,
  },
}];

const CONTACTOS = [
  { id: 'c1', category: 'emergencias', name: 'Policía de prueba', phone: '101', notes: 'Las 24 horas', display_order: 1 },
  { id: 'c2', category: 'emergencias', name: 'Hospital de prueba', phone: '3329-420000', notes: null, display_order: 2 },
  { id: 'c3', category: 'veterinarias', name: 'Veterinaria de prueba', phone: '3329-430000', notes: null, display_order: 1 },
];

/** Sirve las dos consultas con datos de prueba; con `estado.sinRed` las corta como lo haría la falta de señal. */
async function servirDatos(page, estado) {
  await page.route(/\/rest\/v1\/(pharmacy_shifts|emergency_contacts)\?/, (route) => {
    if (estado.sinRed) return route.abort('internetdisconnected');
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const cuerpo = route.request().url().includes('pharmacy_shifts') ? TURNOS : CONTACTOS;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
}

/** Espera a que el service worker haya guardado las páginas y la página los datos de las dos listas. */
async function esperarGuardado(page) {
  await expect.poll(() => page.evaluate(async () => {
    const guardadas = (await (await caches.open('baradero-local-offline-v1')).keys()).map((r) => new URL(r.url).pathname);
    const paginas = ['/pages/home.html', '/pages/farmacias.html', '/pages/servicios.html'].every((p) => guardadas.includes(p));
    const datos = ['farmacias-v1', 'servicios-v1'].every((k) => localStorage.getItem(`bl_offline_${k}`));
    return paginas && datos;
  }), { timeout: 30_000, message: 'El service worker/la página no dejaron guardado lo esencial' }).toBe(true);
}

test.describe('sin conexión', () => {
  test('farmacias de turno y emergencias se ven con el modo avión', async ({ page, context }) => {
    const estado = { sinRed: false };
    const errores = [];
    page.on('pageerror', (e) => errores.push(`excepción: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errores.push(`CSP: ${m.text()}`);
    });
    await servirDatos(page, estado);

    // 1) Con señal: se abre farmacias, y la página y el service worker dejan todo guardado.
    await page.goto('/pages/farmacias.html');
    await expect(page.locator('.fx-hero__name')).toHaveText('Farmacia Prueba Sin Señal');
    await expect(page.locator('.fx-note'), 'con señal no hay aviso de copia guardada').not.toContainText('Sin conexión');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await esperarGuardado(page);

    // 2) Sin señal.
    estado.sinRed = true;
    await context.setOffline(true);

    await page.goto('/pages/farmacias.html');
    await expect(page.locator('.fx-hero__name')).toHaveText('Farmacia Prueba Sin Señal');
    await expect(page.locator('.fx-hero')).toContainText('Abierta ahora');
    await expect(page.locator('.fx-hero a[href^="tel:"]').first()).toHaveAttribute('href', 'tel:3329400000');
    const aviso = page.locator('.fx-note');
    await expect(aviso).toContainText('Sin conexión');
    await expect(aviso).toContainText('guardamos hoy a las');
    await expect(aviso).toContainText('confirmá por teléfono');
    // Se ve con su diseño (el CSS también estaba guardado), no como HTML pelado.
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Inter');

    await page.goto('/pages/servicios.html');
    await expect(page.locator('.sv-contact__name', { hasText: 'Policía de prueba' })).toBeVisible();
    await expect(page.locator('.sv-contact__name', { hasText: 'Veterinaria de prueba' })).toBeVisible();
    await expect(page.locator('.sv-note')).toContainText('Sin conexión');
    await expect(page.locator('.sv-note')).toContainText('los números que guardamos hoy a las');

    // El inicio también abre (es la pantalla de la app instalada) y lleva a lo esencial.
    await page.goto('/pages/home.html');
    await expect(page.locator('a[href$="farmacias.html"]').first()).toBeVisible();
    await expect(page.locator('a[href$="servicios.html"]').first()).toBeVisible();

    // Una página que no se guardó: pantalla propia con accesos a lo que sí está.
    await page.goto('/pages/perfil.html');
    await expect(page.getByRole('heading', { name: 'No hay conexión' })).toBeVisible();
    await page.getByRole('link', { name: 'Farmacias de turno' }).click();
    await expect(page.locator('.fx-hero__name')).toHaveText('Farmacia Prueba Sin Señal');

    expect(errores, `Errores en la página:\n  ${errores.join('\n  ')}`).toEqual([]);

    // 3) Vuelve la señal: se muestran los datos de la base, sin aviso de copia.
    estado.sinRed = false;
    await context.setOffline(false);
    await page.goto('/pages/farmacias.html');
    await expect(page.locator('.fx-hero__name')).toHaveText('Farmacia Prueba Sin Señal');
    await expect(page.locator('.fx-note')).not.toContainText('Sin conexión');
  });

  test('sin conexión y sin nada guardado todavía: se dice, no se inventa nada', async ({ page, context }) => {
    // Primera visita sin señal (el SW no existe todavía): lo que se ve es la pantalla del navegador,
    // así que acá se prueba el caso de página guardada pero sin datos (copia borrada del aparato).
    const estado = { sinRed: false };
    await servirDatos(page, estado);
    await page.goto('/pages/servicios.html');
    await expect(page.locator('.sv-contact__name').first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () =>
      (await (await caches.open('baradero-local-offline-v1')).keys()).length)).toBeGreaterThan(3);

    await page.evaluate(() => localStorage.clear());
    estado.sinRed = true;
    await context.setOffline(true);
    await page.goto('/pages/servicios.html');
    await expect(page.locator('.sv-empty')).toContainText('No hay conexión y todavía no guardamos los números');
    await expect(page.locator('.sv-contact')).toHaveCount(0);
  });
});
