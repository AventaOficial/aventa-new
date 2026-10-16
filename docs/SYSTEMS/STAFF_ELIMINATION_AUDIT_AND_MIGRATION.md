# Eliminación del modelo staff y consolidación en Team OS

**Fecha:** 2026-10-17  
**Estado:** Implementación en código (pendiente aplicar SQL en staging/prod y retirar filas staff legacy en `user_roles` tras verificación).

## 1. Objetivo

- **Team OS** (`team_memberships` + catálogo de permisos en `lib/team/permissions`) es la única fuente de verdad para **colaboradores**.
- **`user_roles`** se conserva solo para **`owner`** (autoridad global del fundador).
- No se elimina físicamente la tabla `user_roles` en esta fase.

## 2. Mapa de dependencias (clasificación A / B / C)

| Área | Antes | Clase | Después |
|------|--------|-------|---------|
| `requireAdmin` / moderación API | `user_roles` moderator/admin | **C** | `requireCollaboratorPermission` + permisos Team OS |
| `requireOwner` / Founder OS | `user_roles.owner` | **B** | Sin cambio (owner) |
| `/api/admin/team` POST/PATCH staff | `user_roles` CRUD | **A** | **410** — usar `/admin/team` TeamManagementClient |
| `TeamRolesPanel` | UI staff | **A** | Eliminado |
| Middleware `/admin` | rol staff | **C** | Solo `isPlatformOwner` |
| Middleware `/equipo` | rol staff | **C** | `team_memberships` + `equipoTeamAccess` |
| `app/equipo` StaffShell | `user_roles` cliente | **C** | `GET /api/equipo/context` |
| `requireStaff` / `/api/staff/*` | `user_roles` | **C** | Membresías + leads para gerencia |
| RLS / SQL migraciones históricas | `user_roles` en policies | **C** | Documentado; revisar en fase DB (no auto-cambiado) |
| `profiles.role` sync | seed legacy | **A** | No usar para auth nueva (`PR143_CONSUMER_MAP`) |
| Moderación UI filtros moderadores | `user_roles` lectura cliente | **C** | **Residual** — migrar a API de membresías moderation |
| `operaciones/*`, hooks moderación | lectura `user_roles` | **C** | **Residual** — mismo criterio |
| MCP / machine clients | lectura owner | **B** | Owner en `user_roles` |

## 3. Correspondencia de roles (migración de datos)

| Rol staff (`user_roles`) | Team OS | Notas |
|--------------------------|---------|--------|
| `moderator` | `moderation` / `moderator` | Automático en SQL idempotente |
| `marketing` | `growth` / `growth_member` | Automático |
| `finance` | `finance` / `finance_viewer` | Automático |
| `analyst` | `operations` / `operations_member` | Automático |
| `admin` | — | **SKIP** — demasiado amplio; asignar leads por equipo manualmente |
| `gerente` | — | **SKIP** — usar `*_lead` en equipos relevantes o decisión owner |
| `owner` | Proyección `withPlatformOwner` | Permanece en `user_roles` |

Script: `docs/supabase-migrations/20261017_staff_roles_to_team_memberships.sql`

## 4. Cambios realizados en código

- `lib/server/platformOwner.ts` — owner bearer.
- `lib/server/collaboratorAuth.ts` — permisos por membresía ACTIVE.
- `lib/server/requireAdmin.ts` — moderación/métricas/finanzas vía Team OS; sensibles solo owner.
- `lib/team/moderation/access.ts` — sin bypass `user_roles` primero.
- `lib/staff/equipoTeamAccess.ts`, `membershipNav.ts`, `legacyStaffMapping.ts`.
- `lib/server/middlewareRoleGate.ts` — async middleware + helpers de test.
- `app/admin/team/page.tsx` — solo Team OS + herramientas contraseña gate.
- `app/api/admin/team/route.ts` — mutaciones staff **410**.
- `app/api/equipo/context/route.ts` — navegación hub `/equipo`.
- `app/equipo/components/StaffShell.tsx` — sin `user_roles` en cliente.
- `app/admin/AdminShell.tsx` — solo `owner` en `/admin`.
- Tests: `tests/server/collaboratorAuth.test.ts`, `middlewareRoleGate.test.ts` actualizados.

## 5. Permisos funcionales (referencia)

| Capacidad | Permiso Team OS |
|-----------|-----------------|
| Decidir ofertas (cola) | `moderation.offers.decide` |
| Métricas moderación | `moderation.metrics.read` |
| Operaciones / analista | `operations.overview.read` |
| Marketing hub | `growth.overview.read` |
| Finanzas lectura | `finance.overview.read` |
| `/admin` completo | Solo `user_roles.owner` (no membresía) |

## 6. Pruebas ejecutadas

```bash
npx vitest run tests/server/collaboratorAuth.test.ts tests/server/middlewareRoleGate.test.ts tests/team/teamModeration.test.ts tests/team/teamGate.test.ts tests/team/teamClosure.test.ts tests/team/teamShell.test.ts
```

**Resultado (local):** 6 archivos, 81 tests passed.

## 7. Riesgos y pendientes

1. **Aplicar migración SQL** en staging y validar que cada colaborador tiene membresía antes de borrar filas staff en `user_roles`.
2. **admin / gerente** sin equivalencia automática — decisión owner.
3. **RLS** en tablas que aún mencionan `user_roles` (moderator/admin) — alinear en migración DB separada.
4. **Residual cliente:** `ModerationPendingPanel`, `useModerationFocusQueue`, `operaciones/*` aún pueden leer `user_roles` para listados; no conceden permisos de escritura pero deben migrarse a consulta de `team_memberships`.
5. **Sesiones activas:** suspender membresía deja de autorizar en la siguiente petición API (no hay step-up en gate).

## 8. Criterio de cierre operativo

- [x] No hay UI para “agregar rol staff”.
- [x] APIs de moderación principales usan Team OS.
- [x] `/admin/team` solo Team OS.
- [ ] Producción: SQL aplicado + filas staff no-owner retiradas de `user_roles` tras checklist.
- [ ] Cero lecturas funcionales de `user_roles` excepto owner (residuales UI listadas arriba).

## 9. `user_roles` — usos permitidos tras migración

- `lib/server/platformOwner.ts`, `requireOwnerSession.ts`, `lib/team/authz/platformRole.ts`
- Seeds / MCP owner checks
- Políticas SQL legacy hasta actualización explícita
