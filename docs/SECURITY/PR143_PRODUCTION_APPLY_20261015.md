# PR #143 — aplicación en producción (2026-10-15)

Proyecto: `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas).

## Precheck (antes de SQL)

| Objeto | Existe en prod |
|--------|----------------|
| `ofertas_ranked_general` | sí |
| `daily_system_metrics` | sí |
| `user_roles` | sí |
| `offers_normalized`, `offers_legacy_compat_v`, `user_roles_effective` | no (omitido por migración idempotente) |
| `v_affiliate_revenue_by_user`, `v_payouts_pending` | no |
| `payouts`, `moderation_log` | no |
| `profiles.role` | **no** (staff solo en `user_roles`) |

`user_roles` en prod: 1 owner, 2 moderators (lectura 2026-10-15).

## Migraciones aplicadas (orden)

1. `pr143_prod_security_definer_hardening` — OK  
2. `pr143_prod_admin_payout_staff_auth` — OK (`user_roles` en función)  
3. `pr143_prod_staff_roles_profile_sync` — **falló** (`profiles.role` ausente)  
4. `pr143_prod_staff_roles_profile_sync_v2` — OK (no-op: sin columna `role`)  
5. `pr143_prod_affiliate_revenue_view_access` — OK (no-op: vista ausente)

## Post-check HTTP

- `GET https://aventaofertas.com/api/health` → 200, `feedViewOk: true`  
- `GET /api/feed/home?view=latest` → `success`, datos devueltos  

## Staging smoke (mismo día)

- Health staging 200, `offersCount` OK  
- Feed `latest` devuelve ofertas; `top` puede estar vacío si no hay votos en el periodo  
- SQL: `ofertas_ranked_general` 51 filas aprobadas/publicadas; moderación con pendientes  

## Código

Merge #146 en `master` (`22a079b`).
