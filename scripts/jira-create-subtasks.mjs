#!/usr/bin/env node
// Crea el tablero del Milestone 1 (Fases 0 y 1) en Jira:
// cada Fase = una Tarea padre; cada paso = una Subtarea hija.
// Las subtareas se crean PENDIENTES y SIN ASIGNAR.
// Requiere las variables de .jira.env en el entorno.

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "A113";

if (!TOKEN || !EMAIL) {
  console.error("Falta JIRA_EMAIL/JIRA_API_TOKEN en el entorno.");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

// --- Estructura del Milestone 1 ---
const PHASES = [
  {
    summary: "Fase 0 · Estabilización (que funcione de verdad)",
    subtasks: [
      "F0-01a · Conectar al Supabase real (MCP) y listar tablas, funciones y policies",
      "F0-01b · Comparar el esquema real vs db/schema/*.sql y documentar diferencias",
      "F0-02a · Agregar 'repartidor' al enum app_role (migración)",
      "F0-02b · Ajustar handle_new_user para mapear account_type='repartidor'",
      "F0-03a · validate_cart_prices: usar columnas reales price_cents y title",
      "F0-03b · validate_cart_prices: comparar precios en centavos y validar stock",
      "F0-04a · Alta de producto: setear seller_id = auth.uid()",
      "F0-04b · Alta de producto: convertir el precio ingresado a centavos",
      "F0-04c · Alta de producto: mapear category_id correctamente",
      "F0-04d · Probar alta de producto end-to-end (aparece en tienda y catálogo)",
      "F0-05a · Crear helper formatPrice() central",
      "F0-05b · Unificar visualización de precios en todas las páginas",
      "F0-06a · Quitar producto de prueba (PRODUCTO_PRUEBA/seedCartIfEmpty) del carrito",
      "F0-06b · Carrito: guardar siempre UUID real + price_cents",
      "F0-06c · initCartButtons: usar data-product-id en vez de texto del DOM",
      "F0-07a · Ordenar y volver idempotentes las migraciones SQL",
      "F0-07b · Documentar orden de ejecución en docs/RUN_LOCAL.md",
      "F0-08a · Diseñar migraciones del modelo de datos objetivo (variantes, imágenes, etc.) con RLS",
    ],
  },
  {
    summary: "Fase 1 · Seguridad",
    subtasks: [
      "F1-01a · Reemplazar innerHTML por DOM API en producto.js (anti-XSS)",
      "F1-01b · Reemplazar innerHTML por DOM API en comercio.js (anti-XSS)",
      "F1-01c · Reemplazar innerHTML por DOM API/escape en admin.js (anti-XSS)",
      "F1-01d · Auditar todo el código buscando innerHTML con datos de usuario",
      "F1-02a · Correr get_advisors (Supabase) y listar hallazgos de seguridad",
      "F1-02b · Resolver advisories críticos de RLS",
      "F1-03a · Test: un cliente no puede cambiar su role desde la consola",
      "F1-04a · Validación de CUIT (formato + dígito verificador)",
      "F1-04b · Validación de inputs (email, precios, longitudes) cliente y servidor",
      "F1-05a · Aplicar headers de seguridad en el hosting de producción",
    ],
  },
];

function adf(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
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
  try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function createIssue(fields) {
  const res = await api("/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.text}`);
  return res.json.key;
}

async function main() {
  const created = [];
  for (const phase of PHASES) {
    const parentKey = await createIssue({
      project: { key: PROJECT_KEY },
      issuetype: { name: "Tarea" },
      summary: phase.summary,
      description: adf("Fase del roadmap. Ver docs/ROADMAP.md. Sin asignar (planificación)."),
    });
    console.log(`\n📋 ${parentKey}  ${phase.summary}`);

    for (const st of phase.subtasks) {
      try {
        const key = await createIssue({
          project: { key: PROJECT_KEY },
          issuetype: { name: "Subtarea" },
          parent: { key: parentKey },
          summary: st,
          description: adf("Paso del roadmap (docs/ROADMAP.md). Al terminar, referenciar esta clave en el commit para cerrarla."),
        });
        console.log(`   ✓ ${key}  ${st}`);
        created.push({ key, summary: st });
      } catch (e) {
        console.log(`   ✗ FALLÓ  ${st}\n     ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Descubrir el workflow: estado y transiciones de la primera subtarea creada.
  if (created.length) {
    const k = created[0].key;
    const st = await api(`/rest/api/3/issue/${k}?fields=status`);
    const tr = await api(`/rest/api/3/issue/${k}/transitions`);
    console.log(`\n=== Workflow (según ${k}) ===`);
    console.log("Estado inicial:", st.json?.fields?.status?.name);
    console.log("Transiciones disponibles:");
    (tr.json?.transitions || []).forEach((t) =>
      console.log(`   id=${t.id}  "${t.name}"  → "${t.to?.name}"`)
    );
  }

  console.log(`\nTotal subtareas creadas: ${created.length}`);
}

main().catch((e) => { console.error("Fallo general:", e); process.exit(1); });
