# Plan de respuesta a incidentes — Baradero Local

> SOC 2 CC7.3–CC7.5 · ISO/IEC 27701 6.13 (incidentes de seguridad con datos personales)
> · Ley 25.326 art. 9 y Resolución AAIP 47/2018 (medidas de seguridad recomendadas).
> Versión 1.0 · 2026-11-02 · Simulacro anual (pendiente P-11).

## 1. Qué es un incidente

Cualquier evento que comprometa, o pueda comprometer, la confidencialidad, integridad o
disponibilidad de la plataforma o de datos personales. Ejemplos:

- Una policy RLS que deja ver datos de otra cuenta, un bucket privado accesible, un
  `SECURITY DEFINER` sin chequeo de rol.
- Un secreto expuesto (service role key, `MP_ACCESS_TOKEN`, `MP_CLIENT_SECRET`, token de
  Jira) en el repo, un log, un chat o una captura.
- Una cuenta de admin, de comercio o de infraestructura (GitHub, Supabase, Vercel, Google,
  Mercado Pago) usada por alguien que no es su dueño.
- Pagos marcados como cobrados sin serlo, o pedidos manipulados.
- El sitio o la base caídos o pausados por más de 1 hora; pérdida de datos.
- Un reporte externo de vulnerabilidad (`SECURITY.md`).

## 2. Roles

| Rol | Quién | Qué hace |
|---|---|---|
| Coordinador | Responsable de seguridad (P-08); mientras tanto, quien detecta el incidente hasta que otra persona del equipo lo tome | Decide, coordina, registra |
| Técnico | Quien conozca el área afectada | Contiene y corrige |
| Comunicación | Una persona del equipo | Avisos a usuarios, comercios y AAIP |

## 3. Severidad

| Nivel | Criterio | Tiempo para empezar a actuar |
|---|---|---|
| **Crítico** | Datos personales o financieros expuestos o alterados; secreto de producción expuesto; acceso de admin indebido; cobros falsos | Inmediato |
| **Alto** | Vulnerabilidad explotable sin evidencia de uso; caída total | < 4 horas |
| **Medio** | Vulnerabilidad que requiere condiciones raras; caída parcial | < 24 horas |
| **Bajo** | Mejora de seguridad sin riesgo inmediato | Siguiente tarea planificada |

## 4. Pasos

1. **Detectar y registrar.** Abrir una tarea en Jira (A113) marcada como incidente, con
   hora de detección, quién lo detectó y qué se vio. **No** pegar datos personales ni
   secretos en la tarea.
2. **Contener** (lo primero que sirva):
   - Secreto expuesto → **rotarlo ya** (Supabase: Settings → API / Edge Function secrets;
     Mercado Pago: credenciales de la app; Vercel: env vars + redeploy) y después
     limpiar donde quedó.
   - Cuenta comprometida → cerrar sus sesiones (Supabase Auth → usuario → sign out /
     ban), quitar el rol, cambiar contraseña y activar MFA.
   - Policy o función con hueco → migración que la cierre (probada en transacción) o, si
     urge, `revoke execute` / `alter policy ... using (false)` temporal.
   - Abuso de un endpoint → Vercel Firewall (modo ataque) o pausar la función.
   - Deploy roto → rollback a un deploy anterior desde Vercel.
3. **Investigar:** alcance (qué datos, cuántas personas, desde cuándo). Fuentes:
   `admin_audit_log` (append-only), logs de Auth, API y Postgres de Supabase (Logs
   Explorer; en plan Free solo 1 día: **exportarlos apenas se detecta**), logs de
   Vercel, historial de git, `error_logs`.
4. **Erradicar y recuperar:** corregir la causa, verificar con una prueba que el hueco ya
   no existe, restaurar datos desde backup si hace falta (POLITICAS-SEGURIDAD.md §5).
5. **Notificar** (sección 5).
6. **Cerrar:** informe breve en la tarea (causa, impacto, línea de tiempo, qué se cambió
   para que no vuelva a pasar) y actualizar la matriz de controles si corresponde.

## 5. Brecha de datos personales: notificación

La Ley 25.326 no fija un plazo cerrado de notificación, pero la AAIP lo recomienda
(Res. 47/2018) y el proyecto de nueva ley de datos personales y las buenas prácticas
internacionales (GDPR: 72 h) marcan el estándar. **Regla del proyecto:**

| A quién | Cuándo | Cómo |
|---|---|---|
| **Personas afectadas** | Sin demora, **dentro de las 72 horas** desde que se confirma que hubo acceso o pérdida de sus datos | Notificación en la plataforma + email de la cuenta |
| **AAIP** | Dentro de las 72 horas, si hay riesgo para los derechos de las personas | Formulario/canal vigente de la AAIP |
| **Comercios afectados** | Ídem, si se expusieron datos de su comercio o de sus clientes | Notificación + email |
| **Mercado Pago** | Si hay compromiso de credenciales o fraude de pagos | Canal de soporte de integradores |

El aviso a las personas dice, en lenguaje simple: qué pasó, qué datos, cuándo, qué
hicimos, qué les recomendamos hacer (por ejemplo, cambiar la contraseña) y cómo
contactarnos. Se registra fecha y contenido de cada aviso en la tarea del incidente.

## 6. Contactos útiles

- Supabase: soporte desde el dashboard (Support → New ticket).
- Vercel: dashboard → Help; Firewall en Project → Security.
- Mercado Pago: developers → Soporte.
- AAIP: argentina.gob.ar/aaip — Dirección Nacional de Protección de Datos Personales.
- CERT.ar (incidentes de seguridad en Argentina): cert.ar.
