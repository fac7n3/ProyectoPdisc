#!/usr/bin/env node
// Registro académico: crea una Tarea en Jira por cada commit.
// Lo invoca el hook .githooks/post-commit. NUNCA debe romper el commit
// (siempre sale con código 0, incluso ante errores).

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "A113";
const ISSUE_TYPE = process.env.JIRA_ISSUE_TYPE || "Tarea";
const ASSIGNEE_ID =
  process.env.JIRA_ASSIGNEE_ID || "712020:10ca33f5-3c2d-4c01-a4a3-f00365cbee8b";

const DONE_RE = /(listo|hecho|done|finaliz|complet|terminad|cerrad)/i;

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function log(msg) {
  // A stderr para no contaminar posibles pipes; git lo muestra igual.
  process.stderr.write(`[jira-commit-log] ${msg}\n`);
}

async function markDone(key, authHeader) {
  // Avanza el issue hacia un estado "completado" (hasta 4 saltos de workflow).
  for (let hop = 0; hop < 4; hop++) {
    const listRes = await fetch(`${BASE_URL}/rest/api/3/issue/${key}/transitions`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });
    if (!listRes.ok) return false;
    const { transitions } = await listRes.json();
    if (!transitions?.length) return false;
    let t = transitions.find((tr) => DONE_RE.test(tr.to?.name || tr.name || ""));
    if (!t) t = transitions[transitions.length - 1];
    const already = DONE_RE.test(t.to?.name || "");
    await fetch(`${BASE_URL}/rest/api/3/issue/${key}/transitions`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ transition: { id: t.id } }),
    });
    if (already) return true;
  }
  return false;
}

async function main() {
  // 1) Sin credenciales reales → omitir en silencio amable.
  if (!TOKEN || !EMAIL || TOKEN.includes("REEMPLAZAR")) {
    log("Falta JIRA_API_TOKEN/JIRA_EMAIL en .jira.env — se omite el registro.");
    return;
  }

  // 2) Escape de emergencia por variable de entorno.
  if (process.env.JIRA_SKIP === "1") {
    log("JIRA_SKIP=1 — se omite este commit.");
    return;
  }

  // 3) No spamear durante un rebase/merge en curso.
  const gitDir = git("rev-parse --git-dir");
  if (
    gitDir &&
    (existsSync(join(gitDir, "rebase-merge")) ||
      existsSync(join(gitDir, "rebase-apply")))
  ) {
    log("Rebase en curso — se omite.");
    return;
  }

  const subject = git("log -1 --pretty=%s") || "(commit sin mensaje)";

  // 4) Permitir saltear un commit puntual con [no-jira] en el mensaje.
  if (/\[no-jira\]/i.test(subject)) {
    log("Commit marcado con [no-jira] — se omite.");
    return;
  }

  const fullHash = git("log -1 --pretty=%H");
  const shortHash = git("log -1 --pretty=%h");
  const body = git("log -1 --pretty=%b");
  const author = git("log -1 --pretty=%an");
  const date = git("log -1 --pretty=%cI");
  const branch = git("rev-parse --abbrev-ref HEAD");
  const files = git("diff-tree --no-commit-id --name-only -r --root HEAD")
    .split("\n")
    .filter(Boolean);

  const summary = `[${shortHash}] ${subject}`.slice(0, 250);

  const paragraphs = [
    `Commit: ${fullHash}`,
    `Rama: ${branch}`,
    `Autor: ${author}`,
    `Fecha: ${date}`,
    body ? `Detalle: ${body}` : null,
    files.length
      ? `Archivos (${files.length}): ${files.join(", ")}`
      : "Sin archivos modificados",
  ].filter(Boolean);

  const description = {
    type: "doc",
    version: 1,
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };

  const payload = {
    fields: {
      project: { key: PROJECT_KEY },
      issuetype: { name: ISSUE_TYPE },
      summary,
      description,
      assignee: { id: ASSIGNEE_ID },
    },
  };

  const auth = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      log(`Error HTTP ${res.status}: ${text}`);
      return;
    }
    const data = JSON.parse(text);
    const done = await markDone(data.key, `Basic ${auth}`);
    log(
      `✓ Tarea ${done ? "creada y completada" : "creada"}: ${data.key} → ${BASE_URL}/browse/${data.key}`
    );
  } catch (err) {
    log(`Fallo al conectar con Jira: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

main();
