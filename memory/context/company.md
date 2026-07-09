# Contexto — Proyecto Baradero Local

## Qué es
E-commerce de comercio de proximidad para Baradero (Argentina). Objetivo: lanzamiento real.

## Herramientas
| Herramienta | Uso | Notas |
|-------------|-----|-------|
| Supabase | DB/Auth/Storage | Project ID `otzhdwuaffcplrveuadc` |
| Vercel | Hosting | Proyecto `proyectopdisc`, team `baradero-local`, deploy auto en push a `main` |
| Jira | Tracking | Tablero `A113` en `baraderolocal.atlassian.net` |
| GitHub | Repo | `fac7n3/ProyectoPdisc`, rama `main` |

## Procesos
| Proceso | Qué significa |
|---------|----------------|
| Empezar tarea | `node scripts/jira-move.mjs A113-XXX progress` |
| Terminar tarea | Incluir `A113-XXX` en el mensaje de commit (hook la cierra sola) |
| Umbral de commit | Pushear cuando el diff supere ~150 líneas |
| Actualizar contexto | Editar `CLAUDE.md` (raíz) al completar cada tarea |

Ver `memory/glossary.md` para el detalle de roles, términos técnicos y convenciones.
