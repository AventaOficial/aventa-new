# Eliminación del modelo staff y consolidación en Team OS

**Fecha de revalidación:** 2026-10-18  
**Estado:** Corte DB aplicado en staging y producción. `user_roles` conserva únicamente `owner` en ambos entornos. En staging se retiraron las políticas legacy basadas en `profiles.role`, se normalizaron esos valores a `user` y se deshabilitaron las mutaciones legacy de roles.

## 1. Objetivo

- **Team OS** (`team_memberships` + catálogo de permisos en `lib/team/permissions`) es la única fuente de verdad para colaboradores.
- **`user_roles`** se conserva para la autoridad global `owner`.
- No se elimina físicamente la tabla `user_roles` en esta fase.

## 2. Mapa de dependencias (clasificación A / B / C)

| Área | Antes | Clase | Estado actual |
|------|-------|-------|---------------|
| `requireAdmin` / moderación API | roles staff legacy | C | permisos Team OS en código |
| `requireOwner` / Founder OS | `user_roles.owner` | B | sin cambio: owner global |
| `/api/admin/team` y `/api/admin/staff-roles` | CRUD de `user_roles` | A | retiradas con 410 Gone |
| `TeamRolesPanel` | UI staff duplicada | A | eliminada |
| Middleware `/admin` | rol staff | C | solo `isPlatformOwner` |
| Middleware `/equipo` | rol staff | C | `team_memberships` + `equipoTeamAccess` |
| `app/equipo` StaffShell | lectura client-side de roles | C | usa `GET /api/equipo/context` |
| `requireStaff` / `/api/staff/*` | roles staff | C | membresías + leads donde corresponde |
| RLS staff policies | `user_roles` con moderator/admin/analyst | C | migradas a `team_os_has_permission(...)` en ambos entornos |
| Funciones SQL de moderación | `user_roles` con moderator/admin | C | usan membresías activas Team OS |
| RPCs legacy para modificar roles | CRUD staff | A | deshabilitadas en staging; endpoints de app retirados |
| `profiles.role` sync | seed legacy | A | normalizada a `user`; script histórico convertido en no-op |
| MCP / machine clients | checks de owner | B | se conserva la verificación de `owner` |

## 3. Correspondencia de roles

| Rol legacy | Team OS | Tratamiento |
|------------|---------|-------------|
| `moderator` | `moderation / moderator` | membresía ACTIVE verificada y fila legacy retirada en staging/prod |
| `marketing` | `growth / growth_member` | mapeo idempotente disponible; no había filas a retirar en el corte verificado |
| `finance` | `finance / finance_viewer` | mapeo idempotente disponible; no había filas a retirar en el corte verificado |
| `analyst` | `operations / operations_member` | mapeo idempotente disponible; no había filas a retirar en el corte verificado |
| `admin` | — | retirado de `user_roles`; perfiles legacy normalizados a `user`, sin asignación implícita de permisos Team OS |
| `gerente` | — | no se asigna automáticamente; no se observó ninguna fila de este rol al verificar staging/prod |
| `owner` | proyección `withPlatformOwner` | permanece en `user_roles` |

Migración de datos original: `docs/supabase-migrations/20261017_staff_roles_to_team_memberships.sql`.

## 4. Cambios de código y DB

- `lib/server/platformOwner.ts` — autoridad global owner.
- `lib/server/collaboratorAuth.ts` — permisos por membresía ACTIVE.
- `lib/server/requireAdmin.ts` — moderación/métricas/finanzas vía Team OS; operaciones sensibles solo owner.
- `lib/team/moderation/access.ts` — sin bypass de roles staff legacy.
- `lib/staff/equipoTeamAccess.ts`, `membershipNav.ts`, `legacyStaffMapping.ts`.
- `lib/server/middlewareRoleGate.ts` — middleware y helpers de test.
- `app/admin/team/page.tsx` — gestión de membresías Team OS.
- `app/api/admin/team/route.ts` y `app/api/admin/staff-roles/route.ts` — mutaciones legacy retiradas.
- `app/api/equipo/context/route.ts` y `app/equipo/components/StaffShell.tsx` — contexto del hub Team OS.
- `app/admin/AdminShell.tsx` — solo owner para `/admin`.
- `docs/supabase-migrations/20261018_team_os_rls_policy_cutover.sql` — función de permisos y RLS.
- `docs/supabase-migrations/20261018_team_os_legacy_auth_functions_production.sql` — funciones de producción.
- `docs/supabase-migrations/STAGING_20261018_team_os_legacy_role_rpc_shutdown.sql` — funciones y RPCs legacy exclusivos de staging.
- `docs/supabase-migrations/20261018_remove_mapped_legacy_moderators.sql` — retiro idempotente de moderadores ya mapeados.
- `docs/supabase-migrations/STAGING_20261018_profile_role_legacy_cutover.sql` — reemplaza políticas de `profiles.role`, acota `is_staff` a Owner/moderación y retira la fuente de roles antigua.
- `docs/supabase-migrations/20261016_staff_roles_profile_sync.sql` — histórico convertido en no-op para evitar reinsertar grants legacy.

## 5. Contrato de permisos DB

| Capacidad | Permiso Team OS |
|-----------|-----------------|
| Leer cola de ofertas | `moderation.offers.read` |
| Decidir ofertas / control de calidad | `moderation.offers.decide` |
| Reportes de ofertas | `moderation.reports.read` |
| Métricas de moderación | `moderation.metrics.read` |
| Operaciones / analista | `operations.overview.read` |
| Marketing / distribución | `growth.overview.read` |
| Finanzas de solo lectura | `finance.overview.read` |
| `/admin` y cambio de estado de pagos | Solo `user_roles.owner` |

La función RLS `team_os_has_permission(text)` permite únicamente permisos incluidos en la allowlist y membresías con estado `ACTIVE`. La función interna que acepta un user id tiene ejecución revocada a `PUBLIC`, `anon` y `authenticated`; las políticas llaman a la función sin parámetro de identidad, basada en `auth.uid()`.

## 6. Verificaciones de DB completadas (2026-10-18)

- Staging: **0** políticas RLS con referencias directas a `user_roles`.
- Producción: **0** políticas RLS con referencias directas a `user_roles`.
- Staging: las dos cuentas con rol legacy `moderator` tenían membresía ACTIVE equivalente y ambas siguen autorizadas por Team OS; después se retiraron las dos filas legacy.
- Producción: las dos cuentas con rol legacy `moderator` tenían membresía ACTIVE equivalente y ambas siguen autorizadas por Team OS; después se retiraron las dos filas legacy.
- Producción: `user_roles` conserva solo una fila `owner`.
- Staging: `user_roles` conserva solo dos filas `owner`; el resto de los roles globales legacy se eliminó tras migrar RLS.
- Staging: `profiles.role` contiene únicamente `user` (25 perfiles); se retiró el trigger que obligaba a conservar un perfil `admin`.
- Staging: **0** políticas RLS detectadas que dependan de `profiles.role`, `es_admin`, `es_mod_a`, `es_mod_b`, `es_lider` o el helper genérico `is_staff`.
- Staging: `is_staff(uid)` autoriza solo Owner o permiso `moderation.offers.decide`; se verificó que miembros activos de otros equipos no pasan ese control.
- Staging: el RPC `admin_set_user_admin` ya no puede mutar perfiles y su ejecución está revocada a `PUBLIC`, `anon` y `authenticated`; `current_role()` solo devuelve `owner` o `user`.
- Producción: las funciones SQL que aún leen `user_roles` lo hacen solo para verificar `owner` (incluyendo el RPC de estado de payout). Los helpers de moderación ya consultan Team OS.
- Se comprobó que un permiso no permitido por la allowlist (por ejemplo `finance.payout.approve`) no se concede ni al owner a través del helper de Team OS.

**Limitación de la prueba:** son verificaciones SQL de políticas, membresías y helpers; no equivalen a un smoke test HTTP con JWT real para cada ruta de moderación.

## 7. Pendientes explícitos

1. **Barrido estático completo de aplicación:** se revalidaron archivos clave (`ModerationPendingPanel`, `useModerationFocusQueue`, `OperacionesPageContent`, `TrabajoPageContent` y `useOperationsPayload`), pero no afirmo que un escaneo exhaustivo de cada archivo del repositorio haya quedado probado en este paso.
2. **Smoke tests autenticados:** las comprobaciones de SQL/RLS/helpers no sustituyen requests HTTP con JWT real para cada ruta de moderación y operaciones.
3. **Sesiones activas:** la suspensión de una membresía bloquea la siguiente petición autorizada por Team OS; no hay step-up adicional en ese gate.

## 8. Criterio de cierre operativo

- [x] No hay UI para agregar roles staff legacy.
- [x] APIs de staff legacy retiradas (410 Gone).
- [x] Gestión de colaboradores por Team OS.
- [x] Políticas RLS staff migradas en staging y producción.
- [x] Funciones legacy de moderación migradas; payout status sigue siendo solo owner.
- [x] Filas `moderator` retiradas tras verificar membresías ACTIVE equivalentes.
- [x] Producción: `user_roles` solo conserva `owner`.
- [x] Staging: `user_roles` conserva únicamente `owner`; perfiles antiguos ya no conservan `admin` en `profiles.role`.
- [ ] Completar un barrido estático de todo el repositorio y smoke tests autenticados por ruta.

## 9. Usos permitidos de `user_roles` tras el corte

- `lib/server/platformOwner.ts`, `requireOwnerSession.ts`, `lib/team/authz/platformRole.ts`.
- Seeds y MCP únicamente para comprobaciones de owner.
- Las políticas RLS y funciones de negocio no deben conceder permisos por `admin`, `moderator`, `analyst`, `marketing`, `finance` o `gerente`.
