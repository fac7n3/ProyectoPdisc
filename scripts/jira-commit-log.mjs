#!/usr/bin/env node
// Vincula commits con subtareas de Jira: si el mensaje del commit referencia
// una o más claves (ej. "A113-140"), esas subtareas se pasan a Finalizada.
// Commits sin referencia NO tocan Jira. Lo invoca .githooks/post-commit.
// NUNCA debe romper el commit (siempre sale con código 0).

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "A113";

const DONE_RE = /(listo|hecho|done|finaliz|complet|terminad|cerrad)/i;
const KEY_RE = new RegExp(`${PROJECT_KEY}-\\d+`, "gi");

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function log(msg) {
  process.stderr.write(`[jira-commit-log] ${msg}\n`);
}

async function api(path, options = {}) {
  const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function markDone(key) {
  // Avanza el issue hacia un estado "completado" (hasta 4 saltos de workflow).
  for (let hop = 0; hop < 4; hop++) {
    const { ok, json } = await api(`/rest/api/3/issue/${key}/transitions`);
    if (!ok || !json?.transitions?.length) return false;
    let t = json.transitions.find((tr) => DONE_RE.test(tr.to?.name || tr.name || ""));
    if (!t) t = json.transitions[json.transitions.length - 1];
    const already = DONE_RE.test(t.to?.name || "");
    await api(`/rest/api/3/issue/${key}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: t.id } }),
    });
    if (already) return true;
  }
  return false;
}

async function main() {
  if (!TOKEN || !EMAIL || TOKEN.includes("REEMPLAZAR")) {
    log("Falta JIRA_API_TOKEN/JIRA_EMAIL en .jira.env — se omite.");
    return;
  }
  if (process.env.JIRA_SKIP === "1") {
    log("JIRA_SKIP=1 — se omite este commit.");
    return;
  }

  // No actuar durante un rebase/merge en curso.
  const gitDir = git("rev-parse --git-dir");
  if (
    gitDir &&
    (existsSync(join(gitDir, "rebase-merge")) ||
      existsSync(join(gitDir, "rebase-apply")))
  ) {
    log("Rebase en curso — se omite.");
    return;
  }

  const subject = git("log -1 --pretty=%s");
  const body = git("log -1 --pretty=%b");
  const message = `${subject}\n${body}`;

  if (/\[no-jira\]/i.test(subject)) {
    log("Commit marcado con [no-jira] — se omite.");
    return;
  }

  // Buscar claves de subtarea referenciadas (ej. A113-140).
  const keys = [...new Set((message.match(KEY_RE) || []).map((k) => k.toUpperCase()))];

  if (keys.length === 0) {
    log("Commit sin referencia a subtarea (ej. " + PROJECT_KEY + "-140) — Jira no se toca.");
    return;
  }

  for (const key of keys) {
    const done = await markDone(key);
    log(done ? `✓ ${key} → Finalizada` : `⚠ ${key}: no se pudo cerrar (revisar workflow/permiso)`);
  }
}

main();
