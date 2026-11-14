// node js/admin-beneficios-utils.test.mjs
import assert from 'node:assert/strict';
import {
  benefitState, whenText, calendarDaysUntil, filterBenefits, renewalsDue, summarizeBenefits,
  storesWithService, renewalWhatsAppUrl, renewedEnd, normalizeText, renewalReminderPreview, EXPIRING_DAYS, RENEWAL_DAYS,
} from './admin-beneficios-utils.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// 2026-11-12 15:00 UTC = 12:00 en Argentina (UTC-3)
const NOW = Date.parse('2026-11-12T15:00:00Z');
const H = 3600000;
const DAY = 24 * H;
const iso = (ms) => new Date(ms).toISOString();

let seq = 0;
const row = (over = {}) => ({
  id: `r${(seq += 1)}`, store_id: 's1', store_name: 'Panadería López', owner_email: 'lopez@x.com',
  plan_id: null, service_id: 'banner_chico', item_name: 'Banner chico', quantity: 1, source: 'purchase', status: 'active',
  starts_at: iso(NOW - 10 * DAY), ends_at: iso(NOW + 20 * DAY), ...over,
});

console.log('--- estado de una compra ---');
check('quitada, en revisión y esperando pago salen del estado guardado', () => {
  assert.equal(benefitState(row({ status: 'cancelled' }), NOW), 'quitado');
  assert.equal(benefitState(row({ status: 'needs_review' }), NOW), 'en_revision');
  assert.equal(benefitState(row({ status: 'pending', starts_at: null, ends_at: null }), NOW), 'esperando_pago');
});
check('vigente, vence pronto (7 días o menos), vencida y programada', () => {
  assert.equal(benefitState(row(), NOW), 'vigente');
  assert.equal(benefitState(row({ ends_at: iso(NOW + EXPIRING_DAYS * DAY) }), NOW), 'vence_pronto');
  assert.equal(benefitState(row({ ends_at: iso(NOW + EXPIRING_DAYS * DAY + H) }), NOW), 'vigente');
  assert.equal(benefitState(row({ ends_at: iso(NOW - 1000) }), NOW), 'vencido');
  assert.equal(benefitState(row({ ends_at: iso(NOW) }), NOW), 'vencido');
  assert.equal(benefitState(row({ starts_at: iso(NOW + DAY), ends_at: iso(NOW + 31 * DAY) }), NOW), 'programado');
});

console.log('--- cuándo vence (días de calendario en Argentina) ---');
check('hoy, mañana, en N días, ayer, hace N días', () => {
  assert.equal(whenText(iso(Date.parse('2026-11-13T02:00:00Z')), NOW), 'vence hoy'); // 23:00 del 12 en Argentina
  assert.equal(whenText(iso(Date.parse('2026-11-13T04:00:00Z')), NOW), 'vence mañana'); // 01:00 del 13, solo 13 h después
  assert.equal(whenText(iso(Date.parse('2026-11-15T15:00:00Z')), NOW), 'vence en 3 días');
  assert.equal(whenText(iso(Date.parse('2026-11-12T10:00:00Z')), NOW), 'venció hoy');
  assert.equal(whenText(iso(Date.parse('2026-11-11T15:00:00Z')), NOW), 'venció ayer');
  assert.equal(whenText(iso(Date.parse('2026-11-08T15:00:00Z')), NOW), 'venció hace 4 días');
});
check('un vencimiento a las 23:30 en Argentina no salta de día', () => {
  assert.equal(calendarDaysUntil('2026-11-13T02:30:00Z', NOW), 0); // 23:30 del 12 (UTC ya es 13)
});

console.log('--- renovaciones por hacer ---');
check('3 días o menos y vencidas de los últimos 7; ordenadas de la más urgente', () => {
  const rows = [
    row({ id: 'en3', ends_at: iso(Date.parse('2026-11-15T15:00:00Z')) }),
    row({ id: 'en4', ends_at: iso(Date.parse('2026-11-16T15:00:00Z')) }),
    row({ id: 'hace7', ends_at: iso(Date.parse('2026-11-05T15:00:00Z')) }),
    row({ id: 'hace8', ends_at: iso(Date.parse('2026-11-04T15:00:00Z')) }),
    row({ id: 'manana', ends_at: iso(Date.parse('2026-11-13T15:00:00Z')) }),
    row({ id: 'quitada', status: 'cancelled', ends_at: iso(Date.parse('2026-11-14T15:00:00Z')) }),
    row({ id: 'revision', status: 'needs_review', ends_at: iso(Date.parse('2026-11-14T15:00:00Z')) }),
    row({ id: 'lejos' }),
  ];
  const due = renewalsDue(rows, NOW);
  assert.deepEqual(due.map((r) => r.id), ['hace7', 'manana', 'en3']);
  assert.equal(due[0].expired, true);
  assert.equal(due[0].when, 'venció hace 7 días');
  assert.equal(due[1].when, 'vence mañana');
  assert.equal(due[2].daysLeft, RENEWAL_DAYS);
});
check('contadores: revisión, vencen pronto, vigentes, renovaciones y la insignia del menú', () => {
  const rows = [
    row({ status: 'needs_review' }),
    row({ ends_at: iso(NOW + 2 * DAY) }),
    row({ ends_at: iso(NOW + 6 * DAY) }),
    row(),
    row({ starts_at: iso(NOW + DAY), ends_at: iso(NOW + 31 * DAY) }),
    row({ status: 'cancelled' }),
    row({ ends_at: iso(NOW - 2 * DAY) }),
  ];
  const s = summarizeBenefits(rows, NOW);
  assert.deepEqual(s, { review: 1, expiring: 2, active: 4, renewals: 2, badge: 3 });
});

console.log('--- filtros de la tabla ---');
const PLAN_ITEMS = [
  { plan_id: 'pro', service_id: 'redes_sociales', quantity: 1 }, { plan_id: 'pro', service_id: 'banner_chico', quantity: 1 },
  { plan_id: 'base', service_id: 'banner_chico', quantity: 1 },
];
const DATA = [
  row({ id: 'a', store_name: 'Panadería López', owner_email: 'lopez@x.com', service_id: 'banner_chico', item_name: 'Banner chico' }),
  row({ id: 'b', store_name: 'Kiosco Sol', owner_email: 'sol@x.com', plan_id: 'pro', service_id: null, item_name: 'Plan Pro', ends_at: iso(NOW + 3 * DAY) }),
  row({ id: 'c', store_name: 'Ferretería El Clavo', owner_email: 'clavo@x.com', service_id: 'redes_sociales', item_name: 'Redes sociales', ends_at: iso(NOW - DAY) }),
  row({ id: 'd', store_name: 'Librería Ñandú', owner_email: 'nandu@x.com', status: 'needs_review', service_id: 'estadisticas_pro', item_name: 'Estadísticas Pro' }),
];
const ids = (rs) => rs.map((r) => r.id).join();
check('buscar sin acentos ni mayúsculas: por comercio, email y elemento', () => {
  assert.equal(ids(filterBenefits(DATA, { q: 'panaderia' }, NOW, PLAN_ITEMS)), 'a');
  assert.equal(ids(filterBenefits(DATA, { q: 'FERRETERIA' }, NOW, PLAN_ITEMS)), 'c');
  assert.equal(ids(filterBenefits(DATA, { q: 'nandu' }, NOW, PLAN_ITEMS)), 'd');
  assert.equal(ids(filterBenefits(DATA, { q: 'sol@x' }, NOW, PLAN_ITEMS)), 'b');
  assert.equal(ids(filterBenefits(DATA, { q: 'estadisticas' }, NOW, PLAN_ITEMS)), 'd');
  assert.equal(ids(filterBenefits(DATA, { q: '   ' }, NOW, PLAN_ITEMS)), 'a,b,c,d');
});
check('por combo o servicio: un servicio incluye los combos que lo traen', () => {
  assert.equal(ids(filterBenefits(DATA, { itemId: 'redes_sociales' }, NOW, PLAN_ITEMS)), 'b,c');
  assert.equal(ids(filterBenefits(DATA, { itemId: 'banner_chico' }, NOW, PLAN_ITEMS)), 'a,b');
  assert.equal(ids(filterBenefits(DATA, { itemId: 'pro' }, NOW, PLAN_ITEMS)), 'b');
  assert.equal(ids(filterBenefits(DATA, { itemId: 'banner_grande' }, NOW, PLAN_ITEMS)), '');
});
check('por estado: "vigentes" suma los que vencen pronto; el resto exacto', () => {
  assert.equal(ids(filterBenefits(DATA, { state: 'vigente' }, NOW, PLAN_ITEMS)), 'a,b');
  assert.equal(ids(filterBenefits(DATA, { state: 'vence_pronto' }, NOW, PLAN_ITEMS)), 'b');
  assert.equal(ids(filterBenefits(DATA, { state: 'vencido' }, NOW, PLAN_ITEMS)), 'c');
  assert.equal(ids(filterBenefits(DATA, { state: 'en_revision' }, NOW, PLAN_ITEMS)), 'd');
});
check('los filtros se combinan', () => {
  assert.equal(ids(filterBenefits(DATA, { q: 'kiosco', itemId: 'redes_sociales', state: 'vigente' }, NOW, PLAN_ITEMS)), 'b');
  assert.equal(ids(filterBenefits(DATA, { q: 'kiosco', state: 'vencido' }, NOW, PLAN_ITEMS)), '');
});
check('normalizeText', () => {
  assert.equal(normalizeText('  Ñandú Ferretería '), 'nandu ferreteria');
  assert.equal(normalizeText(null), '');
});

console.log('--- Redes sociales: historias para resubir ---');
check('suma compra directa, regalo y combos que lo incluyen, sin duplicar comercios', () => {
  const rows = [
    row({ id: '1', store_id: 's1', store_name: 'Panadería López', service_id: 'redes_sociales', item_name: 'Redes sociales', source: 'purchase', ends_at: iso(NOW + 5 * DAY) }),
    row({ id: '2', store_id: 's1', store_name: 'Panadería López', service_id: 'redes_sociales', item_name: 'Redes sociales', source: 'admin', ends_at: iso(NOW + 9 * DAY) }),
    row({ id: '3', store_id: 's2', store_name: 'Kiosco Sol', plan_id: 'pro', service_id: null, item_name: 'Plan Pro', ends_at: iso(NOW + 12 * DAY) }),
    row({ id: '4', store_id: 's3', store_name: 'Almacén Ana', service_id: 'redes_sociales', item_name: 'Redes sociales', source: 'admin' }),
    row({ id: '5', store_id: 's4', store_name: 'Vencida SA', service_id: 'redes_sociales', item_name: 'Redes sociales', ends_at: iso(NOW - DAY) }),
    row({ id: '6', store_id: 's5', store_name: 'Quitada SA', service_id: 'redes_sociales', item_name: 'Redes sociales', status: 'cancelled' }),
    row({ id: '7', store_id: 's6', store_name: 'Futura SA', service_id: 'redes_sociales', item_name: 'Redes sociales', starts_at: iso(NOW + DAY), ends_at: iso(NOW + 31 * DAY) }),
    row({ id: '8', store_id: 's7', store_name: 'Sin redes SA', plan_id: 'base', service_id: null, item_name: 'Plan Base' }),
  ];
  const out = storesWithService(rows, 'redes_sociales', PLAN_ITEMS, NOW);
  assert.deepEqual(out.map((s) => s.store_name), ['Almacén Ana', 'Kiosco Sol', 'Panadería López']);
  const lopez = out.find((s) => s.store_id === 's1');
  assert.deepEqual(lopez.origins, ['Compra', 'Regalo']);
  assert.equal(lopez.endsAt, iso(NOW + 9 * DAY)); // el fin más lejano
  assert.deepEqual(out.find((s) => s.store_id === 's2').origins, ['Plan Pro']);
  assert.deepEqual(out.find((s) => s.store_id === 's3').origins, ['Regalo']);
});

console.log('--- recordarle al comercio por WhatsApp ---');
check('mensaje con el elemento, el comercio y la fecha; link a wa.me con solo dígitos', () => {
  const url = renewalWhatsAppUrl({ phone: '+54 9 3329 12-3456', storeName: 'Panadería López', itemName: 'Plan Pro', endsAt: '2026-11-15T15:00:00Z' });
  assert.ok(url.startsWith('https://wa.me/5493329123456?text='));
  assert.equal(new URL(url).searchParams.get('text'), 'Hola, te escribimos de Baradero Local: Plan Pro de Panadería López vence el 15/11/2026. ¿Querés renovarlo?');
});
check('si ya venció dice "venció"; sin nombre de comercio no inventa uno', () => {
  const t = (p) => new URL(renewalWhatsAppUrl(p)).searchParams.get('text');
  assert.match(t({ phone: '5493329123456', storeName: 'X', itemName: 'Banner chico', endsAt: '2026-11-10T15:00:00Z', expired: true }), /Banner chico de X venció el 10\/11\/2026\./);
  assert.equal(t({ phone: '5493329123456', itemName: 'Banner chico', endsAt: '2026-11-15T15:00:00Z' }), 'Hola, te escribimos de Baradero Local: Banner chico vence el 15/11/2026. ¿Querés renovarlo?');
});
check('caracteres raros no rompen el link y sin WhatsApp válido devuelve null', () => {
  const u = new URL(renewalWhatsAppUrl({ phone: '5493329123456', storeName: 'Pan & Más #1 "El mejor"?', itemName: 'Plan Base', endsAt: '2026-11-15T15:00:00Z' }));
  assert.equal([...u.searchParams.keys()].join(), 'text');
  assert.match(u.searchParams.get('text'), /Plan Base de Pan & Más #1 "El mejor"\? vence/);
  for (const phone of [null, '', 'abc', '1234567', '5'.repeat(16)]) {
    assert.equal(renewalWhatsAppUrl({ phone, storeName: 'X', itemName: 'Plan Pro', endsAt: '2026-11-15T15:00:00Z' }), null);
  }
  assert.equal(renewalWhatsAppUrl({ phone: '5493329123456', storeName: 'X', itemName: ' ', endsAt: '2026-11-15T15:00:00Z' }), null);
});

console.log('--- aviso que reciben los admins ---');
check('resumen de lo que vence, con hasta 3 comercios y "y N más"', () => {
  const items = [
    { store_name: 'Kiosco Sol', item_name: 'Banner chico x2', ends_at: '2026-11-13T15:00:00Z' },
    { store_name: 'Panadería López', item_name: 'Plan Pro', ends_at: '2026-11-14T15:00:00Z' },
  ];
  assert.equal(renewalReminderPreview({ count: 2, items }), '2 por vencer: Kiosco Sol (Banner chico x2, 13/11/2026); Panadería López (Plan Pro, 14/11/2026)');
  const cinco = Array.from({ length: 5 }, (_, i) => ({ store_name: `Comercio ${i + 1}`, item_name: 'Plan Base', ends_at: '2026-11-13T15:00:00Z' }));
  assert.equal(renewalReminderPreview({ count: 7, items: cinco }), '7 por vencer: Comercio 1 (Plan Base, 13/11/2026); Comercio 2 (Plan Base, 13/11/2026); Comercio 3 (Plan Base, 13/11/2026) y 4 más');
});
check('sin datos no inventa nada; con solo el conteo igual avisa', () => {
  assert.equal(renewalReminderPreview(null), null);
  assert.equal(renewalReminderPreview({}), null);
  assert.equal(renewalReminderPreview({ count: 3 }), '3 por vencer');
  assert.equal(renewalReminderPreview({ count: 1, items: [{}] }), '1 por vencer: Comercio (combo)');
});

console.log('--- fecha nueva al renovar (igual que la base) ---');
check('vigente: suma desde su fin; vencida: desde ahora', () => {
  const fin = NOW + 2 * DAY;
  assert.equal(renewedEnd({ ends_at: iso(fin) }, 30, NOW).getTime(), fin + 30 * DAY);
  assert.equal(renewedEnd({ ends_at: iso(NOW - 3 * DAY) }, 30, NOW).getTime(), NOW + 30 * DAY);
});

console.log(`\n${n} checks`);
