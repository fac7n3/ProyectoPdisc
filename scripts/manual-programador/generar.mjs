#!/usr/bin/env node
// Genera el "Manual del programador" (docs/manual-programador/) a partir de
// contenido.mjs y del código REAL del repo: cada bloque se busca en su archivo
// por un texto de inicio, así que si el código cambia, alcanza con volver a
// correr este script para que el manual muestre la versión nueva.
//
//   node scripts/manual-programador/generar.mjs
//
// Salidas:
//   docs/manual-programador/MANUAL-PROGRAMADOR.md   (para leer en GitHub)
//   docs/manual-programador/manual-programador.html (para importar a Google Docs:
//     Drive → Nuevo → Subir archivo, y "Abrir con Documentos de Google")
//
// Si un texto de inicio ya no aparece en su archivo, el script falla diciendo
// cuál: es la señal de que ese bloque del manual quedó viejo.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meta, secciones, inventario } from './contenido.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'manual-programador');
const MAX_LINEAS = 30;

// ---------------------------------------------------------------------------
// Bloques de código
// ---------------------------------------------------------------------------

const LENGUAJES = {
  '.js': 'js', '.mjs': 'js', '.ts': 'js',
  '.sql': 'sql', '.css': 'css', '.html': 'html', '.json': 'json',
};
const PREFIJO_NOTA = { js: '// ▶', sql: '-- ▶', css: '/* ▶', html: '<!-- ▶', json: '// ▶' };
const CIERRE_NOTA = { css: ' */', html: ' -->' };

function coincide(linea, patron) {
  return patron instanceof RegExp ? patron.test(linea) : linea.includes(patron);
}

function buscar(lineas, patron, desde, archivo) {
  for (let i = desde; i < lineas.length; i++) if (coincide(lineas[i], patron)) return i;
  throw new Error(`${archivo}: no se encontró ${patron} (desde la línea ${desde + 1}). El código cambió: actualizá contenido.mjs.`);
}

/** Deja afuera strings y comentarios de línea para contar llaves. */
function sinStrings(linea) {
  return linea
    .replace(/\\./g, '')
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
    .replace(/\/\/.*$/, '');
}

function finPorLlaves(lineas, inicio, archivo) {
  let profundidad = 0;
  let abrio = false;
  for (let i = inicio; i < lineas.length; i++) {
    for (const c of sinStrings(lineas[i])) {
      if (c === '{') { profundidad++; abrio = true; }
      else if (c === '}') profundidad--;
    }
    if (abrio && profundidad <= 0) return i;
  }
  throw new Error(`${archivo}: el bloque de la línea ${inicio + 1} no cierra sus llaves.`);
}

/** Comillas balanceadas antes de un comentario final: si no, el "//" está dentro de un string. */
function quitarComentarioFinal(linea, marca) {
  const idx = linea.indexOf(` ${marca} `);
  if (idx < 0) return linea;
  const antes = linea.slice(0, idx);
  for (const q of ["'", '"', '`']) if ((antes.split(q).length - 1) % 2) return linea;
  return antes.replace(/\s+$/, '');
}

/** Saca los comentarios originales del código (los internos del equipo). */
function limpiarComentarios(filas, lenguaje) {
  const salida = [];
  let enBloque = false;
  for (const fila of filas) {
    if (fila.tipo !== 'codigo') { salida.push(fila); continue; }
    const t = fila.texto.trim();
    if (lenguaje === 'js' || lenguaje === 'css') {
      if (enBloque) { if (t.includes('*/')) enBloque = false; continue; }
      if (t.startsWith('/*')) { if (!t.includes('*/')) enBloque = true; continue; }
      if (lenguaje === 'js' && t.startsWith('//')) continue;
      if (lenguaje === 'js') fila.texto = quitarComentarioFinal(fila.texto, '//');
    } else if (lenguaje === 'sql') {
      if (t.startsWith('--')) continue;
      fila.texto = quitarComentarioFinal(fila.texto, '--');
    } else if (lenguaje === 'html') {
      if (enBloque) { if (t.includes('-->')) enBloque = false; continue; }
      if (t.startsWith('<!--')) { if (!t.includes('-->')) enBloque = true; continue; }
    }
    salida.push(fila);
  }
  return salida;
}

function sangria(texto) {
  return texto.match(/^\s*/)[0];
}

/**
 * Arma un bloque a partir de su especificación:
 *   { archivo, desde, hasta?, lineas?, max?, sigue?, saltear?: [{de, a, motivo}], notas?: [[patron, texto]] }
 * `desde`/`hasta`/patrones: texto que la línea contiene, o una RegExp. Sin
 * `hasta` ni `lineas`, en JavaScript el bloque termina donde cierran sus llaves.
 * Devuelve { archivo, lenguaje, inicio, fin, filas: [{tipo, texto}] }.
 */
export function armarBloque(spec) {
  const ruta = join(ROOT, spec.archivo);
  const lineas = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const lenguaje = LENGUAJES[extname(spec.archivo)] || 'txt';

  const inicio = buscar(lineas, spec.desde, 0, spec.archivo);
  let fin;
  if (spec.hasta) fin = buscar(lineas, spec.hasta, inicio + 1, spec.archivo);
  else if (spec.lineas) fin = Math.min(inicio + spec.lineas - 1, lineas.length - 1);
  else if (lenguaje === 'js') fin = finPorLlaves(lineas, inicio, spec.archivo);
  else throw new Error(`${spec.archivo}: el bloque "${spec.desde}" necesita "hasta" o "lineas".`);

  // Índices (del archivo) a omitir y notas a insertar arriba de una línea.
  const omitidas = new Map(); // índice -> motivo (solo el primero lo muestra)
  for (const s of spec.saltear || []) {
    const de = buscar(lineas, s.de, inicio, spec.archivo);
    const a = buscar(lineas, s.a, de + 1, spec.archivo);
    if (a > fin) throw new Error(`${spec.archivo}: "saltear" ${s.de} termina fuera del bloque.`);
    for (let i = de; i < a; i++) omitidas.set(i, i === de ? s.motivo : null);
  }
  const notas = new Map(); // índice -> [texto]
  for (const [patron, texto] of spec.notas || []) {
    const i = buscar(lineas, patron, inicio, spec.archivo);
    if (i > fin) throw new Error(`${spec.archivo}: la nota "${patron}" cae fuera del bloque.`);
    if (!notas.has(i)) notas.set(i, []);
    notas.get(i).push(texto);
  }

  let filas = [];
  for (let i = inicio; i <= fin; i++) {
    for (const texto of notas.get(i) || []) filas.push({ tipo: 'nota', texto, indice: i });
    if (omitidas.has(i)) {
      const motivo = omitidas.get(i);
      if (motivo !== null) filas.push({ tipo: 'omitido', texto: `… (se omiten líneas: ${motivo})`, indice: i });
      continue;
    }
    filas.push({ tipo: 'codigo', texto: lineas[i], indice: i });
  }

  filas = limpiarComentarios(filas, lenguaje);

  // La nota y el "omitido" toman la sangría de la línea de código que sigue.
  for (let k = 0; k < filas.length; k++) {
    if (filas[k].tipo === 'codigo') continue;
    const siguiente = filas.slice(k + 1).find((f) => f.tipo === 'codigo' && f.texto.trim());
    filas[k].sangria = siguiente ? sangria(siguiente.texto) : '';
  }

  // Sin líneas en blanco repetidas ni en los bordes.
  filas = filas.filter((f, k) => !(f.tipo === 'codigo' && !f.texto.trim() && (k === 0 || !filas[k - 1].texto.trim())));
  while (filas.length && filas[filas.length - 1].tipo === 'codigo' && !filas[filas.length - 1].texto.trim()) filas.pop();

  // Recorte por largo (las notas no cuentan).
  const max = spec.max || MAX_LINEAS;
  let codigo = 0;
  const recortadas = [];
  for (const f of filas) {
    if (f.tipo === 'codigo') codigo++;
    if (codigo > max) {
      recortadas.push({ tipo: 'omitido', texto: '… (el bloque sigue en el archivo)', sangria: '' });
      break;
    }
    recortadas.push(f);
  }
  if (spec.sigue && codigo <= max) recortadas.push({ tipo: 'omitido', texto: '… (el bloque sigue en el archivo)', sangria: '' });

  // Quitar la sangría común.
  const sangrias = recortadas.filter((f) => f.tipo === 'codigo' && f.texto.trim()).map((f) => sangria(f.texto).length);
  const comun = sangrias.length ? Math.min(...sangrias) : 0;
  for (const f of recortadas) {
    if (f.tipo === 'codigo') f.texto = f.texto.slice(Math.min(comun, sangria(f.texto).length));
    else f.sangria = (f.sangria || '').slice(comun);
  }

  const ultimo = [...recortadas].reverse().find((f) => f.indice !== undefined);
  return {
    archivo: spec.archivo,
    lenguaje,
    inicio: inicio + 1,
    fin: (ultimo?.indice ?? fin) + 1,
    filas: recortadas,
  };
}

export function textoDeFila(f, lenguaje) {
  if (f.tipo === 'codigo') return f.texto;
  const abre = PREFIJO_NOTA[lenguaje] || '// ▶';
  const cierra = CIERRE_NOTA[lenguaje] || '';
  const texto = f.tipo === 'omitido' ? f.texto : `${f.texto}`;
  return `${f.sangria}${f.tipo === 'omitido' ? abre.replace('▶', '').trimEnd() + ' ' : abre + ' '}${texto}${cierra}`;
}

// ---------------------------------------------------------------------------
// Inventario de archivos (Anexo A)
// ---------------------------------------------------------------------------

function listar(dir, filtro) {
  const ruta = join(ROOT, dir);
  if (!existsSync(ruta)) return [];
  return readdirSync(ruta).filter(filtro).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

function filasInventario(dir, filtro, descripciones, { faltante = 'Sin descripción todavía.' } = {}) {
  return listar(dir, filtro).map((nombre) => {
    const clave = `${dir}/${nombre}`;
    const desc = descripciones[clave];
    if (!desc) console.warn(`Aviso: falta la descripción de ${clave} en contenido.mjs (inventario).`);
    return [clave, desc || faltante];
  });
}

export function armarInventario() {
  const d = inventario.descripciones;
  const pruebas = listar('js', (n) => n.endsWith('.test.mjs'));
  const pruebasNube = listar('supabase/functions/_tests', (n) => n.endsWith('.test.mjs'));
  const migraciones = listar('db/schema', (n) => n.endsWith('.sql')).map((n) => {
    const [num, ...resto] = basename(n, '.sql').split('_');
    return [num, resto.join(' ')];
  });
  return [
    { h: 2, t: 'A.1 Páginas (carpeta pages/ y raíz)' },
    { tabla: { cabecera: ['Archivo', 'Qué es'], filas: [['index.html', d['index.html']], ...filasInventario('pages', (n) => n.endsWith('.html'), d)] } },
    { h: 2, t: 'A.2 Código JavaScript (carpeta js/)' },
    { tabla: { cabecera: ['Archivo', 'Qué hace'], filas: filasInventario('js', (n) => n.endsWith('.js'), d) } },
    { h: 2, t: 'A.3 Pruebas automáticas' },
    { p: `Hay ${pruebas.length} archivos de prueba en \`js/\` y ${pruebasNube.length} en \`supabase/functions/_tests/\`. Cada uno se llama igual que el archivo que prueba, terminado en \`.test.mjs\` (por ejemplo, \`cart-totals.test.mjs\` prueba \`cart-totals.js\`). Se corren todos juntos con \`npm test\`.` },
    { lista: [...pruebas.map((n) => `js/${n}`), ...pruebasNube.map((n) => `supabase/functions/_tests/${n}`)] },
    { h: 2, t: 'A.4 Estilos (carpeta Assets/styles/)' },
    { tabla: { cabecera: ['Archivo', 'Qué define'], filas: filasInventario('Assets/styles', (n) => n.endsWith('.css'), d) } },
    { h: 2, t: 'A.5 Funciones en la nube (carpeta supabase/functions/)' },
    { tabla: { cabecera: ['Función', 'Qué hace'], filas: filasInventario('supabase/functions', (n) => !n.startsWith('_') && !n.includes('.'), d) } },
    { h: 2, t: 'A.6 Herramientas (carpeta scripts/)' },
    { tabla: { cabecera: ['Archivo', 'Para qué sirve'], filas: filasInventario('scripts', (n) => n.endsWith('.mjs'), d) } },
    { h: 2, t: 'A.7 Cambios de la base de datos (carpeta db/schema/)' },
    { p: `Cada archivo es una "migración": un cambio a la base de datos, numerado en el orden en que se aplicó. Hoy hay ${migraciones.length}. El nombre del archivo ya dice qué cambia (está en una mezcla de español e inglés técnico, se respeta tal cual).` },
    { tabla: { cabecera: ['Nº', 'Qué cambia'], filas: migraciones } },
  ];
}

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------

function armarIndice(todas) {
  return todas.map((s) => ({
    titulo: s.titulo,
    hijos: s.partes.filter((p) => p.h === 2).map((p) => p.t),
  }));
}

// ---------------------------------------------------------------------------
// HTML para Google Docs
// ---------------------------------------------------------------------------

export function esc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function enLinea(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<span class="cin">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

const ESTILOS = `
body{font-family:Arial;font-size:11pt}
p{margin:0 0 6pt 0}
h1{font-family:Montserrat;font-size:15pt;font-weight:bold}
h2{font-family:Montserrat;font-size:12pt;font-weight:bold}
h3{font-family:Montserrat;font-size:12pt;font-weight:normal}
h4{font-family:Montserrat;font-size:11pt;font-weight:normal;font-style:italic}
.portada{text-align:center;font-family:Montserrat}
.cod{font-family:'Courier New';font-size:9pt}
.cin{font-family:'Courier New';font-size:10pt;color:#1f3460}
.nota{color:#15803d;font-weight:bold}
.omit{color:#6b7280;font-style:italic}
.arch{font-size:9pt;color:#4a5568;font-weight:bold}
td.caja{background-color:#f3f4f6;border:1px solid #d1d5db;padding:6pt}
th{background-color:#e8edf6;border:1px solid #9aa5b8;padding:4pt;text-align:left}
td.t{border:1px solid #9aa5b8;padding:4pt;vertical-align:top}
`;

function htmlBloque(b, explicacion) {
  const filas = b.filas.map((f) => {
    const linea = esc(textoDeFila(f, b.lenguaje));
    if (f.tipo === 'nota') return `<span class="nota">${linea}</span>`;
    if (f.tipo === 'omitido') return `<span class="omit">${linea}</span>`;
    return linea;
  }).join('\n');
  let html = `<p class="arch">Archivo: ${esc(b.archivo)} (líneas ${b.inicio} a ${b.fin})</p>\n`;
  html += `<table style="border-collapse:collapse;width:100%"><tr><td class="caja"><pre class="cod">${filas}</pre></td></tr></table>\n`;
  if (explicacion) html += `<p><b>En palabras simples:</b> ${enLinea(explicacion)}</p>\n`;
  return html;
}

function htmlTabla({ cabecera, filas }) {
  const cab = cabecera ? `<tr>${cabecera.map((c) => `<th>${enLinea(c)}</th>`).join('')}</tr>` : '';
  const cuerpo = filas.map((f) => `<tr>${f.map((c) => `<td class="t">${enLinea(c)}</td>`).join('')}</tr>`).join('\n');
  return `<table style="border-collapse:collapse;width:100%">${cab}\n${cuerpo}</table>\n`;
}

function htmlParte(p) {
  if (p.h) return `<h${p.h}>${enLinea(p.t)}</h${p.h}>\n`;
  if (p.p) return `<p>${enLinea(p.p)}</p>\n`;
  if (p.lista) return `<ul>${p.lista.map((i) => `<li>${enLinea(i)}</li>`).join('')}</ul>\n`;
  if (p.pasos) return `<ol>${p.pasos.map((i) => `<li>${enLinea(i)}</li>`).join('')}</ol>\n`;
  if (p.tabla) return htmlTabla(p.tabla);
  if (p.pre) return `<table style="border-collapse:collapse;width:100%"><tr><td class="caja"><pre class="cod">${esc(p.pre)}</pre></td></tr></table>\n`;
  if (p.bloque) return htmlBloque(armarBloque(p.bloque), p.explicacion);
  throw new Error(`Parte desconocida: ${JSON.stringify(p).slice(0, 80)}`);
}

export function generarHtml(todas, indice = todas) {
  let h = `<html><head><meta charset="utf-8"><title>${esc(meta.titulo)}</title><style>${ESTILOS}</style></head><body>\n`;
  h += `<p class="portada" style="font-size:28pt"><b>${esc(meta.proyecto)}</b></p>\n`;
  h += `<p class="portada" style="font-size:18pt">${esc(meta.subtitulo)}</p>\n`;
  h += `<p class="portada" style="font-size:12pt">${esc(meta.bajada)}</p>\n`;
  h += `<p class="portada">versión ${esc(meta.version)}</p>\n<p class="portada">${esc(meta.fecha)}</p>\n`;
  h += `<h1>Hoja de control</h1>\n`;
  for (const t of meta.hojaDeControl) {
    if (t.titulo) h += `<p><b>${enLinea(t.titulo)}</b></p>\n`;
    h += htmlTabla(t);
  }
  h += `<h1>Índice</h1>\n<ol>`;
  for (const s of armarIndice(indice)) {
    h += `<li><b>${enLinea(s.titulo)}</b>`;
    if (s.hijos.length) h += `<ul>${s.hijos.map((x) => `<li>${enLinea(x)}</li>`).join('')}</ul>`;
    h += `</li>`;
  }
  h += `</ol>\n`;
  for (const s of todas) {
    h += `<h1>${enLinea(s.titulo)}</h1>\n`;
    for (const p of s.partes) h += htmlParte(p);
  }
  return `${h}</body></html>\n`;
}

// ---------------------------------------------------------------------------
// Markdown para GitHub
// ---------------------------------------------------------------------------

function mdCelda(t) {
  return String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function mdTabla({ cabecera, filas }) {
  const cab = cabecera || filas[0].map(() => ' ');
  let m = `| ${cab.map(mdCelda).join(' | ')} |\n| ${cab.map(() => '---').join(' | ')} |\n`;
  for (const f of filas) m += `| ${f.map(mdCelda).join(' | ')} |\n`;
  return `${m}\n`;
}

function mdParte(p) {
  if (p.h) return `${'#'.repeat(p.h + 1)} ${p.t}\n\n`;
  if (p.p) return `${p.p}\n\n`;
  if (p.lista) return `${p.lista.map((i) => `- ${i}`).join('\n')}\n\n`;
  if (p.pasos) return `${p.pasos.map((i, k) => `${k + 1}. ${i}`).join('\n')}\n\n`;
  if (p.tabla) return mdTabla(p.tabla);
  if (p.pre) return `\`\`\`\n${p.pre}\n\`\`\`\n\n`;
  if (p.bloque) {
    const b = armarBloque(p.bloque);
    let m = `**Archivo:** \`${b.archivo}\` (líneas ${b.inicio} a ${b.fin})\n\n\`\`\`${b.lenguaje === 'js' ? 'javascript' : b.lenguaje}\n`;
    m += `${b.filas.map((f) => textoDeFila(f, b.lenguaje)).join('\n')}\n\`\`\`\n\n`;
    if (p.explicacion) m += `**En palabras simples:** ${p.explicacion}\n\n`;
    return m;
  }
  throw new Error(`Parte desconocida: ${JSON.stringify(p).slice(0, 80)}`);
}

function generarMd(todas) {
  let m = `# ${meta.proyecto} — ${meta.subtitulo}\n\n_${meta.bajada}_\n\nVersión ${meta.version} · ${meta.fecha}\n\n`;
  m += `> Archivo generado con \`node scripts/manual-programador/generar.mjs\`. No editar a mano: el texto vive en \`scripts/manual-programador/contenido.mjs\` y el código sale de los archivos reales.\n\n`;
  m += `## Hoja de control\n\n`;
  for (const t of meta.hojaDeControl) {
    if (t.titulo) m += `**${t.titulo}**\n\n`;
    m += mdTabla(t);
  }
  m += `## Índice\n\n`;
  armarIndice(todas).forEach((s, k) => {
    m += `${k + 1}. **${s.titulo}**\n`;
    for (const x of s.hijos) m += `   - ${x}\n`;
  });
  m += '\n';
  for (const s of todas) {
    m += `## ${s.titulo}\n\n`;
    for (const p of s.partes) m += mdParte(p);
  }
  return m;
}

// ---------------------------------------------------------------------------

export function todasLasSecciones() {
  return [...secciones, { titulo: 'Anexo A. Inventario de archivos del proyecto', partes: [...inventario.intro, ...armarInventario()] }];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
const todas = todasLasSecciones();
mkdirSync(OUT_DIR, { recursive: true });
const html = generarHtml(todas);
const md = generarMd(todas);
writeFileSync(join(OUT_DIR, 'manual-programador.html'), html);
writeFileSync(join(OUT_DIR, 'MANUAL-PROGRAMADOR.md'), md);
const bloques = todas.flatMap((s) => s.partes).filter((p) => p.bloque).length;
console.log(`Manual generado: ${bloques} bloques de código, HTML ${(html.length / 1024).toFixed(0)} KB, Markdown ${(md.length / 1024).toFixed(0)} KB.`);
}
