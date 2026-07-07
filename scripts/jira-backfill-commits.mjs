#!/usr/bin/env node
// Backfill: crea una Tarea en Jira por cada commit desde una fecha dada
// (default 2026-06-01), la asigna a Facundo y la marca como completada.
// Uso:  node scripts/jira-backfill-commits.mjs [YYYY-MM-DD]
// Requiere las variables de .jira.env cargadas en el entorno.

import { execSync } from "node:child_process";

const SINCE = process.argv[2] || "2026-06-01";
const LIMIT = process.env.JIRA_LIMIT ? Number(process.env.JIRA_LIMIT) : Infinity;
const START = process.env.JIRA_START ? Number(process.env.JIRA_START) : 0;

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "A113";
const ISSUE_TYPE = process.env.JIRA_ISSUE_TYPE || "Tarea";
const ASSIGNEE_ID =
  process.env.JIRA_ASSIGNEE_ID || "712020:10ca33f5-3c2d-4c01-a4a3-f00365cbee8b";

const DONE_RE = /(listo|hecho|done|finaliz|complet|terminad|cerrad)/i;

if (!TOKEN || !EMAIL || TOKEN.includes("REEMPLAZAR")) {
  console.error("Falta JIRA_API_TOKEN/JIRA_EMAIL en el entorno (.jira.env).");
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* sin cuerpo */ }
  return { ok: res.ok, status: res.status, json, text };
}

function getCommits() {
  // Formato con separador poco frecuente para evitar colisiones.
  const raw = git(
    `log --since=${SINCE} --reverse --pretty=format:%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1e`
  );
  return raw
    .split("\x1e")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, subject] = line.split("\x1f");
      const files = git(`diff-tree --no-commit-id --name-only -r --root ${hash}`)
        .split("\n")
        .filter(Boolean);
      return { hash, short, author, date, subject, files };
    });
}

function buildDescription(c) {
  const paragraphs = [
    `Commit: ${c.hash}`,
    `Autor: ${c.author}`,
    `Fecha: ${c.date}`,
    c.files.length
      ? `Archivos (${c.files.length}): ${c.files.join(", ")}`
      : "Sin archivos modificados",
    "Registro académico generado automáticamente desde el historial de git.",
  ];
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

async function markDone(key) {
  // Avanza el issue hacia un estado "completado" (hasta 4 saltos).
  for (let hop = 0; hop < 4; hop++) {
    const { ok, json } = await api(`/rest/api/3/issue/${key}/transitions`);
    if (!ok || !json?.transitions?.length) return false;
    const transitions = json.transitions;
    // 1) ¿Hay una transición directa a un estado "done"?
    let t = transitions.find((tr) => DONE_RE.test(tr.to?.name || tr.name || ""));
    // 2) Si no, avanzar por la última disponible (suele ser la más progresada).
    if (!t) t = transitions[transitions.length - 1];
    const already = DONE_RE.test(t.to?.name || "");
    await api(`/rest/api/3/issue/${key}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: t.id } }),
    });
    if (already) return true;
  }
  // Verificar estado final
  const { json } = await api(`/rest/api/3/issue/${key}?fields=status`);
  return DONE_RE.test(json?.fields?.status?.name || "");
}

async function main() {
  const end = LIMIT === Infinity ? undefined : START + LIMIT;
  const commits = getCommits().slice(START, end);
  console.log(`Procesando ${commits.length} commits desde ${SINCE} (offset ${START}).\n`);

  const created = [];
  const failed = [];

  for (const [i, c] of commits.entries()) {
    const n = `${i + 1}/${commits.length}`;
    const summary = `[${c.short}] ${c.subject}`.slice(0, 250);
    const payload = {
      fields: {
        project: { key: PROJECT_KEY },
        issuetype: { name: ISSUE_TYPE },
        summary,
        description: buildDescription(c),
        assignee: { id: ASSIGNEE_ID },
      },
    };

    const res = await api("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.log(`✗ ${n}  ${c.short}  ERROR ${res.status}: ${res.text}`);
      failed.push({ commit: c.short, error: res.text });
      continue;
    }

    const key = res.json.key;
    const done = await markDone(key);
    console.log(
      `✓ ${n}  ${c.short}  → ${key}  ${done ? "[completada]" : "[NO se pudo completar]"}  ${c.subject}`
    );
    created.push({ commit: c.short, key, done });
    await new Promise((r) => setTimeout(r, 200)); // gentil con la API
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Creadas: ${created.length}`);
  console.log(`Completadas: ${created.filter((x) => x.done).length}`);
  console.log(`Fallidas: ${failed.length}`);
  if (failed.length) console.log(failed);
}

main().catch((e) => {
  console.error("Fallo general:", e);
  process.exit(1);
});
