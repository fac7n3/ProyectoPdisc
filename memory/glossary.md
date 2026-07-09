# Glosario — Baradero Local (Proyecto-Pdisc)

Diccionario de términos, roles, herramientas y códigos internos del proyecto.
Complementa a `CLAUDE.md` (memoria rápida) — acá va el detalle completo.

## Roles de usuario (`app_role`)
| Rol | Significado |
|-----|-------------|
| `cliente` | Comprador final |
| `vendedor` | Dueño de un comercio local, publica productos (requiere aprobación admin + CUIT válido) |
| `repartidor` | Repartidor de pedidos (agregado en migración 11, planeado — no operativo aún en frontend) |
| `admin` | Administrador de la plataforma, aprueba vendedores |

El rol se lee del **JWT** (`app_metadata.role`), no de una tabla aparte consultada en cada request.

## Códigos de tareas (roadmap → Jira)
| Prefijo | Significado |
|---------|-------------|
| `F0-XX` | Fase 0 del roadmap (fundaciones: DB, precios, seguridad básica) |
| `F1-XX` | Fase 1 (seguridad: XSS, advisors, CUIT, headers) |
| `A113-XXX` | Clave de subtarea en Jira (tablero A113, baraderolocal.atlassian.net) |
| `M1` | Milestone 1 = Fase 0 (padre `A113-134`) + Fase 1 (padre `A113-153`) |

Ver tablero completo y estado de subtareas en `docs/ROADMAP.md` y Jira A113.

## Herramientas / stack
| Término | Qué es |
|---------|--------|
| **Supabase** | Backend (Postgres + Auth + Google OAuth + Storage + RLS). Project ID: `otzhdwuaffcplrveuadc` |
| **RLS** | Row Level Security — políticas de Postgres que restringen filas por usuario (ej. `seller_id = auth.uid()`) |
| **Vite 8** | Bundler, proyecto multipágina (`pages/*.html`) |
| **Vercel** | Hosting. Proyecto `proyectopdisc`, team `baradero-local`. Deploy automático en cada push a `main` |
| **Jira** | Tracking de progreso. Credenciales en `.jira.env` (gitignoreado) |

## Convenciones no obvias
| Término | Detalle |
|---------|---------|
| `dist/` | Se versiona en git (no está en `.gitignore`) — hay que rebuildear y commitear tras cambios de frontend |
| Precios | PESOS enteros en todo el sistema, sin centavos (migrados de `price_cents` en migración 12) |
| `seller_id` | Debe setearse explícitamente al insertar productos (`supabase.auth.getUser()`) — la RLS lo exige, no hay default |
| Commit → Jira | Incluir la clave `A113-XXX` en el mensaje de commit cierra esa subtarea automáticamente (hook `post-commit`) |
| Umbral de commit | Commitear + pushear cuando el cambio supere ~150 líneas |

## Scripts de tooling
| Script | Qué hace |
|--------|----------|
| `scripts/jira-move.mjs <KEY> <progress\|done\|todo>` | Cambia estado de una subtarea en Jira |
| `scripts/jira-create-subtasks.mjs` | Crea el tablero de un milestone en Jira |
| `scripts/jira-commit-log.mjs` | Hook `post-commit`: cierra subtareas referenciadas en el commit |

## Ver también
- `CLAUDE.md` (raíz del repo) — progreso actual, decisiones de producto, estado de M1
- `docs/CONTEXTO-PROYECTO.md` — contexto largo del proyecto
- `docs/ROADMAP.md` — plan completo F0–F11 (fuente de verdad)
