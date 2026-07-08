#!/usr/bin/env node
// Mueve una o más issues de Jira a un estado. Uso:
//   node scripts/jira-move.mjs <KEY> <progress|done|todo> [KEY2 ...]
// Ej: node scripts/jira-move.mjs A113-135 progress
// Requiere las variables de .jira.env en el entorno.

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
if (!TOKEN || !EMAIL) { console.error("Falta JIRA_EMAIL/JIRA_API_TOKEN."); process.exit(1); }
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

const TARGET = (process.argv[3] || "progress").toLowerCase();
const KEYS = [process.argv[2], ...process.argv.slice(4)].filter(Boolean);
if (!KEYS.length) { console.error("Falta la clave de la issue (ej. A113-135)."); process.exit(1); }

const MATCHERS = {
  progress: /(curso|progress|proceso|haciendo)/i,
  done: /(finaliz|hecho|done|listo|complet|terminad|cerrad)/i,
  todo: /(por hacer|to ?do|pendiente|backlog)/i,
};

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function move(key) {
  const re = MATCHERS[TARGET] || MATCHERS.progress;
  const { ok, json } = await api(`/rest/api/3/issue/${key}/transitions`);
  if (!ok || !json?.transitions?.length) { console.log(`✗ ${key}: sin transiciones disponibles`); return; }
  const t = json.transitions.find((tr) => re.test(tr.to?.name || tr.name || ""));
  if (!t) {
    console.log(`✗ ${key}: no hay transición hacia "${TARGET}". Disponibles: ${json.transitions.map(x => x.to?.name).join(", ")}`);
    return;
  }
  const res = await api(`/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: t.id } }) });
  console.log(res.ok ? `✓ ${key} → ${t.to?.name}` : `✗ ${key}: ${res.status} ${res.text}`);
}

for (const k of KEYS) await move(k);
