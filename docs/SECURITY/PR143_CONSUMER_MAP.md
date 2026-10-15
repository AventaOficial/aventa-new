# PR #143 — mapa de consumidores (cierre)

Migraciones en `docs/supabase-migrations/20261015_*` y `20261016_*`.

## Autorización de staff

| Mecanismo | Fuente de verdad | App |
|-----------|------------------|-----|
| Rutas `/api/admin/*` | `user_roles` | `lib/server/requireAdmin.ts`, `requireUsersLogs.ts` |
| `admin_mark_payout_status` | `user_roles` (`owner`, `admin`) | RPC legacy; no usada desde Next hoy |
| Seed / sync | `20261016_staff_roles_profile_sync.sql` | Copia `profiles.role` staff → `user_roles` sin borrar filas |

`profiles.role` puede quedar desactualizado; no usarlo solo para autorización nueva.

## Vistas con `security_invoker = true`

| Vista | Consumo en app |
|-------|----------------|
| `ofertas_ranked_general` | Feed home, categorías, tienda, for-you |
| `public_profiles_view` | **Sin cambio en #143** — join autor en feed, comentarios, moderación |
| `user_roles_effective` | Staging legacy; invoker + RLS en `user_roles` |
| `daily_system_metrics` | `service_role` en `/api/admin/daily-system-metrics`, owner command |
| `v_payouts_pending` | Solo `service_role` (staff vía API server) |
| `v_affiliate_revenue_by_user` | Sin `.from()` en app; revocado a `service_role` |

## RPC: EXECUTE solo `service_role`

`admin_table_samples`, `admin_snapshot_upsert`, `admin_moderation_queue`, `admin_moderation_sla`, `admin_liabilities_buckets`, `admin_payouts_summary`, `analytics_campaigns`, `push_coverage`, `aventa_mark_expired`, `debug_is_admin_for`.

Si un panel llamaba estas RPC con JWT de usuario, debe pasar por rutas Next con `service_role` o reimplementarse.

## Verificación manual (staging)

1. Feed público carga ofertas y autores.
2. Moderación: cola y aprobar oferta (moderator+).
3. Owner: métricas diarias y command center.
4. Usuario sin rol: no ejecuta RPC admin (error esperado).

## Producción

Comparar `to_regclass` de cada objeto antes de aplicar. No asumir paridad con staging (`AVENTA_SCHEMA_PARITY.md`).
