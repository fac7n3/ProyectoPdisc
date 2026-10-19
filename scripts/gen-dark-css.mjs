// Genera Assets/styles/dark-auto.css: la versión oscura de todos los colores
// escritos "a mano" (hex, rgb(), hsl(), white/black) en el CSS del sitio y en
// los <style> inline de las páginas.
//
// Los colores que pasan por tokens (var(--bl-surface), var(--bl-text)...) NO se
// tocan acá: se resuelven redefiniendo los tokens en Assets/styles/dark.css.
// Este script cubre lo que los tokens no alcanzan. Para cada declaración con un
// color fijo emite una regla espejo bajo `:where(html[data-theme="dark"])`
// con un prefijo de especificidad fija (html[data-theme="dark"], +0,1,1).
//
// IMPORTANTE -- por qué se espeja TODA declaración de color, no solo las que
// cambian: Vite no respeta el orden de los <link> al construir, así que no se
// puede apoyar en "la última gana". Con el mismo prefijo en todas las reglas
// espejo, la cascada entre ellas es la original (misma especificidad relativa,
// mismo orden dentro de este archivo). Si solo se espejaran los colores que
// cambian, `.card{background:#fff}` (espejo: +0,1,1) le ganaría a
// `.card.is-active{background:var(--bl-primary)}` (sin espejo: 0,2,0). Por eso
// las declaraciones que no cambian (var(--x), colores de acento) se copian tal
// cual y entran en la misma cascada.
//
// Uso:  node scripts/gen-dark-css.mjs          -> reescribe dark-auto.css
//       node scripts/gen-dark-css.mjs --check  -> falla si dark-auto.css quedó viejo
//       (lo corre `npm test`: si cambiás un color fijo en un CSS, corré el script)
//
// Ajustes a mano van en dark.css (se carga DESPUÉS), nunca en dark-auto.css.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'Assets/styles/dark-auto.css');

// Orden = orden en que las páginas cargan los CSS, para que la cascada espejo
// sea la misma que la original.
const CSS_FILES = [
  'a11y.css', 'home.css', 'carrito.css', 'product-modal.css', 'auth.css',
  'perfil-custom.css', 'admin.css', 'profesional.css', 'repartidor.css',
];

const PREFIX = 'html[data-theme="dark"]';

/* ------------------------------- colores ------------------------------- */

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

// Token CSS de color: #hex, rgb()/rgba(), hsl()/hsla() o white/black.
const COLOR_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/g;

function parseColor(tok) {
  const t = tok.trim().toLowerCase();
  if (NAMED[t]) return [...NAMED[t]];
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }
  const m = t.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!m) return null;
  if (m[2].includes('var(')) return null;
  const parts = m[2].split(/[\s,\/]+/).filter(Boolean);
  const num = (s, pct = 1) => (s.endsWith('%') ? (parseFloat(s) / 100) * pct : parseFloat(s));
  if (m[1].startsWith('rgb')) {
    const [r, g, b, a] = parts;
    return [num(r, 255), num(g, 255), num(b, 255), a === undefined ? 1 : num(a, 1)];
  }
  const [h, s, l, a] = parts;
  const [r, g, b] = hslToRgb(parseFloat(h), num(s), num(l));
  return [r, g, b, a === undefined ? 1 : num(a, 1)];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function fmt([r, g, b, a]) {
  const R = Math.max(0, Math.min(255, Math.round(r)));
  const G = Math.max(0, Math.min(255, Math.round(g)));
  const B = Math.max(0, Math.min(255, Math.round(b)));
  if (a >= 0.999) return '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `rgba(${R}, ${G}, ${B}, ${+a.toFixed(3)})`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Azul de la paleta oscura (mismo matiz que el ancla de marca #284175).
const BLUE_H = 222;

function fromHsl(h, s, l, a) {
  const [r, g, b] = hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
  return [r, g, b, a];
}

const isNeutral = (s) => s < 0.2;

// Fondos: lo claro pasa a superficie oscura; los acentos saturados y lo que ya
// es oscuro se dejan (los botones azules con texto blanco siguen igual).
function mapBackground(c) {
  const [r, g, b, a] = c;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (a === 0) return null;
  // Negro translúcido muy suave (hover/relleno sutil) -> blanco translúcido.
  if (r === 0 && g === 0 && b === 0) return a <= 0.12 ? [255, 255, 255, +(a * 1.3).toFixed(3)] : null;
  // Blanco translúcido: <.8 es un "vidrio" sobre algo (foto, hero): no se toca.
  if (r === 255 && g === 255 && b === 255) {
    if (a < 0.8) return null;
    return fromHsl(BLUE_H, 0.28, 0.13, a);
  }
  // Tinte translúcido de un acento oscuro (rgba(40,65,117,.08)): sobre fondo
  // oscuro desaparece; se aclara y se refuerza un poco.
  if (a < 0.6 && l < 0.5 && s > 0.2) return fromHsl(h, Math.min(s, 0.7), 0.62, Math.min(0.35, a * 1.6));
  const light = l >= 0.75 || (l >= 0.6 && s < 0.35);
  if (!light) return null;
  const nl = 0.13 + (1 - l) * 0.45;
  if (isNeutral(s)) return fromHsl(BLUE_H, 0.28, nl, a);
  return fromHsl(h, Math.min(s * 0.6, 0.5), nl, a);
}

// Texto/íconos: lo oscuro pasa a claro; blancos y grises medios/claros quedan.
function mapText(c) {
  const [r, g, b, a] = c;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (a === 0 || l >= 0.62) return null;
  const nl = clamp(0.93 - l * 0.5, 0.62, 0.92);
  if (isNeutral(s)) return fromHsl(BLUE_H, 0.22, nl, a);
  return fromHsl(h, Math.min(s, 0.85), nl, a);
}

function mapBorder(c) {
  const [r, g, b, a] = c;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (a === 0) return null;
  if (r === 0 && g === 0 && b === 0) return a <= 0.3 ? [255, 255, 255, +Math.min(0.2, a * 1.3 + 0.03).toFixed(3)] : null;
  if (r === 255 && g === 255 && b === 255) return a >= 0.8 ? fromHsl(BLUE_H, 0.28, 0.13, a) : null;
  if (l >= 0.7 && s < 0.45) return fromHsl(BLUE_H, 0.25, 0.2 + (1 - l) * 0.35, a);
  if (l >= 0.8) return fromHsl(h, Math.min(s * 0.6, 0.5), 0.26 + (1 - l) * 0.4, a);
  if (l < 0.45) return fromHsl(h, Math.min(s, 0.85), 0.62, a); // borde de acento oscuro: se aclara
  return null;
}

// Sombras: las negras quedan; los anillos/halos de un acento oscuro se aclaran
// (un foco azul marino sobre fondo oscuro no se ve) y los claros se apagan.
function mapShadow(c) {
  const [r, g, b, a] = c;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (a === 0 || (isNeutral(s) && l < 0.3)) return null;
  if (l < 0.5 && s > 0.2) return fromHsl(h, Math.min(s, 0.7), 0.62, Math.min(0.5, a * 1.4));
  if (l >= 0.85 && a >= 0.8) return fromHsl(BLUE_H, 0.25, 0.2 + (1 - l) * 0.35, a);
  return null;
}

const MAPPERS = { background: mapBackground, text: mapText, border: mapBorder, shadow: mapShadow };

// Reemplaza cada color literal de `value`. Devuelve null si nada cambió.
function mapValue(value, mapper) {
  let changed = false;
  const out = value.replace(COLOR_RE, (tok, offset) => {
    // No tocar lo que está dentro de var(--x, #fff): es un fallback.
    const before = value.slice(0, offset);
    const open = (before.match(/var\(/g) || []).length - (before.match(/\)/g) || []).length;
    if (open > 0 && /var\([^)]*$/.test(before)) return tok;
    const c = parseColor(tok);
    if (!c) return tok;
    const n = mapper(c);
    if (!n) return tok;
    changed = true;
    return fmt(n);
  });
  return changed ? out : null;
}

/* ------------------------- propiedades y vars ------------------------- */

const TEXT_PROPS = new Set(['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color', '-webkit-text-fill-color', 'column-rule-color']);
const BG_PROPS = new Set(['background', 'background-color', 'background-image']);
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow', 'filter']);
const isBorderProp = (p) => /^(border|outline)(-[a-z]+)*$/.test(p) && !/(radius|width|style|spacing|collapse|image)/.test(p);

// Tokens de acento que, usados como COLOR DE TEXTO, quedan ilegibles sobre
// fondo oscuro (azul marino #284175 sobre #172033). Se remplazan por el azul
// claro de lectura --dk-accent-text (definido en dark.css).
const ACCENT_TEXT_VARS = new Set([
  '--bl-primary', '--bl-primary-dark', '--bl-primary-deeper', '--auth-primary', '--auth-primary-hover',
  '--bl-perfil-primary', '--bl-perfil-primary-hover', '--bl-vendor-accent', '--bl-vendor-accent-dark',
  '--primary-dark', '--primary-hover', '--primary-color', '--admin-navy', '--admin-navy-deep', '--catpick-accent',
  '--uib-color',
]);
// Tokens de acento ámbar del modo Oficios (texto -> ámbar claro).
const OFICIOS_TEXT_VARS = new Set(['--bl-oficios-accent', '--bl-oficios-accent-dark']);
// Fondos "de acento": llevan texto blanco/claro encima, no se les oscurece el texto.
const ACCENT_FILL_VARS = new Set([...ACCENT_TEXT_VARS, ...OFICIOS_TEXT_VARS, '--bl-accent', '--bl-accent-hover', '--bl-success', '--bl-danger']);

function mapVarText(value) {
  const m = value.trim().match(/^var\((--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i);
  if (!m) return null;
  if (ACCENT_TEXT_VARS.has(m[1])) return 'var(--dk-accent-text)';
  if (OFICIOS_TEXT_VARS.has(m[1])) return 'var(--dk-oficios-text)';
  return null;
}

/* ---------------------------- generación ---------------------------- */

const propGroup = (prop) => (TEXT_PROPS.has(prop) ? 'text' : BG_PROPS.has(prop) ? 'bg' : isBorderProp(prop) ? 'border' : 'shadow');
const tokensOf = (sel) => sel.match(/[.#][\w-]+/g) || [];

function mirrorDecls(rule) {
  const decls = [];
  const own = {};
  rule.walkDecls((d) => { if (d.parent === rule) own[d.prop.toLowerCase()] = d; });

  // ¿El fondo de la regla es un acento que se queda (botón azul, ámbar...)?
  // Entonces el texto se deja como está: ya contrasta con ese fondo.
  const bg = own['background'] || own['background-color'];
  let accentBg = false;
  if (bg) {
    const v = bg.value;
    const vars = [...v.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]);
    if (vars.some((x) => ACCENT_FILL_VARS.has(x))) accentBg = true;
    else if (!vars.length) {
      const cols = (v.match(COLOR_RE) || []).map(parseColor).filter(Boolean);
      if (cols.length && cols.every((c) => c[3] > 0.6 && !mapBackground(c))) {
        const [, , l] = rgbToHsl(...cols[0]);
        if (l > 0.12) accentBg = true; // acento medio u oscuro (no casi-negro de un overlay)
      }
    }
  }

  for (const d of Object.values(own)) {
    const prop = d.prop.toLowerCase();
    const important = d.important ? ' !important' : '';
    let nv = null;
    let relevant = true;
    if (TEXT_PROPS.has(prop)) {
      if (!accentBg) nv = mapVarText(d.value) ?? mapValue(d.value, MAPPERS.text);
    } else if (BG_PROPS.has(prop)) {
      nv = mapValue(d.value, MAPPERS.background);
    } else if (isBorderProp(prop)) {
      nv = mapValue(d.value, MAPPERS.border);
    } else if (SHADOW_PROPS.has(prop) && prop !== 'filter') {
      nv = mapValue(d.value, MAPPERS.shadow);
    } else {
      relevant = false;
    }
    if (!relevant) continue;
    // url() relativo: este archivo vive en otra carpeta que los <style> de las
    // páginas, no se puede copiar tal cual (se ajusta a mano en dark.css).
    if (nv === null && /url\(/.test(d.value)) continue;
    decls.push({ prop, group: propGroup(prop), changed: nv !== null, text: `${prop}: ${nv ?? d.value}${important}` });
  }
  return decls;
}

function prefixSelector(sel) {
  sel = sel.trim();
  if (sel.includes('[data-theme')) return null;
  if (/^(html|:root)(?![\w-])/.test(sel)) return sel.replace(/^(html|:root)/, PREFIX);
  return `${PREFIX} ${sel}`;
}

function chainOf(node) {
  const chain = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') {
      if (/keyframes$/i.test(p.name) || p.name === 'font-face') return null;
      chain.unshift(`@${p.name} ${p.params}`);
    }
  }
  return chain;
}

function processCss(css, label) {
  const root = postcss.parse(css);
  const items = [];
  root.walkRules((rule) => {
    const chain = chainOf(rule);
    if (!chain) return;
    const decls = mirrorDecls(rule);
    if (!decls.length) return;
    const sels = rule.selectors.map((s) => ({ raw: s, out: prefixSelector(s) })).filter((s) => s.out);
    if (!sels.length) return;
    items.push({ chain, decls, sels });
  });
  return { label, items };
}

// Segunda pasada (global): una declaración que NO cambia solo hace falta si
// alguna regla espejo que sí cambia esa misma propiedad puede pisarla, o sea si
// comparten alguna clase/id en el selector. Se descarta el resto.
function finalize(blocks) {
  const changedTokens = { text: new Set(), bg: new Set(), border: new Set(), shadow: new Set() };
  for (const b of blocks) for (const it of b.items) for (const d of it.decls) {
    if (!d.changed) continue;
    for (const s of it.sels) for (const t of tokensOf(s.raw)) changedTokens[d.group].add(t);
  }
  return blocks.map((b) => {
    const rules = [];
    for (const it of b.items) {
      const keep = it.decls.filter((d) => {
        if (d.changed) return true;
        const toks = it.sels.flatMap((s) => tokensOf(s.raw));
        if (!toks.length) return false; // solo etiquetas (a, button): sin espejo no pisa nada de más
        return toks.some((t) => changedTokens[d.group].has(t));
      });
      if (!keep.length) continue;
      rules.push({ chain: it.chain, text: `${it.sels.map((s) => s.out).join(',\n')} {\n  ${keep.map((d) => d.text).join(';\n  ')};\n}` });
    }
    return { label: b.label, rules };
  });
}

function render(blocks) {
  const lines = [
    '/* GENERADO por scripts/gen-dark-css.mjs -- no editar a mano.',
    ' * Versión oscura de los colores fijos del CSS del sitio y de los <style> de',
    ' * las páginas. Ajustes manuales: Assets/styles/dark.css (se carga después). */',
    '',
  ];
  for (const { label, rules } of blocks) {
    if (!rules.length) continue;
    lines.push(`/* ===== ${label} ===== */`);
    let openChain = [];
    for (const r of rules) {
      const same = JSON.stringify(r.chain) === JSON.stringify(openChain);
      if (!same) {
        for (let i = 0; i < openChain.length; i++) lines.push('}');
        openChain = r.chain;
        for (const c of openChain) lines.push(`${c} {`);
      }
      lines.push(r.text);
    }
    for (let i = 0; i < openChain.length; i++) lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

export function build() {
  const blocks = [];
  for (const f of CSS_FILES) {
    const p = path.join(ROOT, 'Assets/styles', f);
    blocks.push(processCss(fs.readFileSync(p, 'utf8'), `Assets/styles/${f}`));
  }
  const pagesDir = path.join(ROOT, 'pages');
  for (const f of fs.readdirSync(pagesDir).filter((x) => x.endsWith('.html')).sort()) {
    const html = fs.readFileSync(path.join(pagesDir, f), 'utf8');
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    if (!styles.length) continue;
    blocks.push(processCss(styles.join('\n'), `pages/${f} (<style>)`));
  }
  return render(finalize(blocks));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== css) {
      console.error('dark-auto.css está desactualizado: correr `node scripts/gen-dark-css.mjs`');
      process.exit(1);
    }
    console.log('dark-auto.css al día');
  } else {
    fs.writeFileSync(OUT, css);
    console.log(`dark-auto.css escrito (${css.split('\n').length} líneas)`);
  }
}
