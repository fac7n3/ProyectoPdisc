#!/usr/bin/env node
// Crea el tablero de las Fases 2 a 11 (M2 en adelante) en Jira, siguiendo
// el mismo patrón que scripts/jira-create-subtasks.mjs usó para M1:
// cada Fase = una Tarea padre; cada paso del roadmap = una Subtarea hija.
// Las subtareas se crean PENDIENTES y SIN ASIGNAR.
// Requiere las variables de .jira.env en el entorno (A113-167).

const BASE_URL = process.env.JIRA_BASE_URL || "https://baraderolocal.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "A113";

if (!TOKEN || !EMAIL) {
  console.error("Falta JIRA_EMAIL/JIRA_API_TOKEN en el entorno.");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

// --- Estructura de Fases 2-11 (docs/ROADMAP.md secciones 8-17) ---
const PHASES = [
  {
    summary: "Fase 2 · Compra: checkout, órdenes y pagos",
    subtasks: [
      "F2-01 · RPC create_order (SECURITY DEFINER, transaccional): revalida precios/stock, crea orders + order_items, descuenta stock, aplica cupón",
      "F2-02 · Conectar el checkout real (reemplazar el stub del carrito)",
      "F2-03 · Método de pago Simulado detrás de una interfaz PaymentProvider",
      "F2-04 · Método de pago Transferencia + comprobante (payment_proofs), el vendedor confirma",
      "F2-05 · Elegir retiro/envío en el checkout + calcular delivery_fee",
      "F2-06 · Historial de pedidos del cliente en perfil.html",
      "F2-07 · (Futuro) Provider MercadoPago (sandbox → real)",
    ],
  },
  {
    summary: "Fase 3 · Delivery y rol repartidor",
    subtasks: [
      "F3-01 · Onboarding del repartidor (registro/alta del rol, datos de contacto/vehículo)",
      "F3-02 · Panel del repartidor: ver pedidos disponibles y tomarlos",
      "F3-03 · Flujo de estados de deliveries: pendiente → asignado → en_camino → entregado",
      "F3-04 · Vista del cliente y del vendedor del estado del envío en tiempo real",
      "F3-05 · (Futuro) Ubicación/seguimiento del repartidor, zonas y tarifas por distancia",
    ],
  },
  {
    summary: "Fase 4 · Carrito robusto y favoritos",
    subtasks: [
      "F4-01 · Sincronizar carrito en la nube (user_carts) + merge local↔nube al loguear",
      "F4-02 · Manejo de producto/variante inactivo, eliminado o sin stock en el carrito",
      "F4-03 · Favoritos persistentes en DB (favorites); unificar las 2 implementaciones de wishlist",
    ],
  },
  {
    summary: "Fase 5 · Experiencia del vendedor",
    subtasks: [
      "F5-01 · Validación de CUIT (formato + dígito verificador) en el registro",
      "F5-02 · CRUD completo de productos: crear/editar/activar-desactivar",
      "F5-03 · Variantes de producto (talle/color/peso) con stock por variante",
      "F5-04 · Varias fotos por producto + subida a Supabase Storage (buckets ya existen)",
      "F5-05 · Ofertas: compare_at_price (precio tachado)",
      "F5-06 · Gestión de pedidos del vendedor: ver pedidos, confirmar pago, cambiar estado",
      "F5-07 · Estadísticas reales del dashboard desde orders",
      "F5-08 · Edición del perfil de la tienda (logo, descripción, dirección, horarios, zona)",
      "F5-09 · UI diferenciada del vendedor (dentro de la paleta azul, con acentos propios)",
    ],
  },
  {
    summary: "Fase 6 · Panel de administración",
    subtasks: [
      "F6-01 · Aprobar/rechazar comercios + validar CUIT + notificar resultado",
      "F6-02 · CRUD de categorías",
      "F6-03 · CRUD de cupones desde la UI",
      "F6-04 · Moderación: suspender productos/comercios; auditar comprobantes de pago; gestionar repartidores",
      "F6-05 · Métricas globales (usuarios, comercios, ventas, entregas)",
    ],
  },
  {
    summary: "Fase 7 · Social: reseñas y chat",
    subtasks: [
      "F7-01 · Reseñas y calificaciones (reviews) de productos y/o comercios; promedio en el catálogo",
      "F7-02 · Chat comprador-vendedor (conversations/messages) con contexto de producto",
      "F7-03 · Moderación básica de reseñas/mensajes (reportar, ocultar)",
    ],
  },
  {
    summary: "Fase 8 · Notificaciones",
    subtasks: [
      "F8-01 · Centro de notificaciones (notifications) + eventos clave (pedido creado/pagado/enviado/entregado)",
      "F8-02 · Canal Email (Supabase + Resend o similar) vía Edge Function",
      "F8-03 · Canal WhatsApp (API de WhatsApp Cloud o proveedor) para estados de pedido",
      "F8-04 · (Futuro) Notificaciones in-app/push cuando exista la app de celular",
    ],
  },
  {
    summary: "Fase 9 · UX/UI, identidad y PWA",
    subtasks: [
      "F9-01 · Sistema de diseño sobre la paleta azul actual: más contraste, calidez y personalidad",
      "F9-02 · PWA instalable: manifest, service worker, íconos, offline básico",
      "F9-03 · Home con destacados/ofertas reales desde la DB",
      "F9-04 · Accesibilidad (a11y): form/label, ARIA, foco, contraste AA",
      "F9-05 · Responsive mobile-first en todas las páginas",
      "F9-06 · Micro-interacciones, estados vacíos, skeletons, manejo de error consistente",
      "F9-07 · Optimizar el modal de producto (galería, variantes, reseñas)",
    ],
  },
  {
    summary: "Fase 10 · Calidad, testing y performance",
    subtasks: [
      "F10-01 · Checklist de testing manual por rol (cliente/vendedor/repartidor/admin) y flujo",
      "F10-02 · (Opcional) E2E de flujos críticos con Playwright / Claude in Chrome",
      "F10-03 · Performance: optimizar imágenes, lazy-load, code splitting, cache. Lighthouse ≥ 85 mobile",
      "F10-04 · Manejo de errores y estados de red consistentes",
      "F10-05 · SEO básico + Open Graph + favicon",
    ],
  },
  {
    summary: "Fase 11 · Deploy y lanzamiento",
    subtasks: [
      "F11-01 · Elegir hosting (Vercel/Netlify) + build de Vite multi-página",
      "F11-02 · Variables de entorno en prod + callbacks de Google OAuth para el dominio real",
      "F11-03 · Configurar Edge Functions (email/WhatsApp/pagos) en prod",
      "F11-04 · Dominio propio",
      "F11-05 · Checklist go-live: RLS activa, secretos seguros, buckets con políticas, backups",
      "F11-06 · Cargar comercios reales y datos de producción",
      "F11-07 · Documentación final: README, guía de usuario por rol, guía de deploy, doc técnica",
      "F11-08 · Limpieza: quitar mocks/seeds, console.log, código muerto; decidir versionado de dist/",
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

  console.log(`\nTotal subtareas creadas: ${created.length}`);
}

main().catch((e) => { console.error("Fallo general:", e); process.exit(1); });
