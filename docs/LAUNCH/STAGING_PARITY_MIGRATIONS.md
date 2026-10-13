# Paridad de esquema staging ↔ producción

Inventario de solo lectura del 2026-10-13 (`pg_class`, esquema `public`).
Producción `mkgsrpsuvedwwlzmzmzh`, staging `oojshofrpbfwsiypcecr`.
Ninguna migración de esta lista se aplicó en esta fase. Las marcadas «verificada» se ejecutaron
en staging dentro de `BEGIN … ROLLBACK` y se confirmó después que staging no cambió.

## En producción y no en staging (bloquea pruebas de staging)

Orden recomendado (dependencias primero). Todas son idempotentes (`IF NOT EXISTS`, `REVOKE`/`GRANT`).

| # | Archivo (`docs/supabase-migrations/`) | Objetos | Estado |
|---|---|---|---|
| 1 | `mercadolibre_oauth_tokens.sql` | `mercadolibre_oauth_tokens` | verificada |
| 2 | `20260907_hunter_source_health.sql` | `hunter_source_health` | verificada |
| 3 | `20260908_hunter_shadow_cycles.sql` | `hunter_shadow_cycles` | verificada |
| 4 | `20260908_ingest_cycle_locks.sql` | `ingest_cycle_locks` | verificada |
| 5 | `20260912_hunter_shadow_outcomes.sql` | `hunter_shadow_outcomes` | sin verificar (requiere 3) |
| 6 | `20261010_operational_control.sql` | `operational_controls`, `operational_control_audit` | verificada |
| 7 | `20261013_offer_performance_metrics_versioned.sql` | vista materializada + RPC de refresco | verificada (vista, índice y `REFRESH CONCURRENTLY`) |
| 8 | `20261013_function_search_path_hardening.sql` | `search_path` + grants de 2 funciones | verificada |

Economía (fuera de alcance mientras el dinero siga congelado; aplicar solo con la fase económica):

| # | Archivo | Objetos | Estado |
|---|---|---|---|
| E1 | `20260830_rewards_v1_monetary_hardening.sql` | `reward_clawback_adjustments` + RPCs de pago | sin verificar |
| E2 | `20260916_economy_adapter_revisions_reconciliation.sql` | `affiliate_commission_revisions`, `affiliate_reconciliation_runs`, `affiliate_reconciliation_findings` | sin verificar |
| E3 | `20260930_pending_settlement_reversal_recovery.sql` | RPC de reversos (ya existe en staging) | — |

Sin migración y sin uso en código: `offer_quality_checks` (0 filas en producción). No se versiona;
decidir si se elimina en producción en una fase posterior.

## Solo en staging (no bloquea)

Objetos legados que producción ya no tiene: `ofertas`, `votos`, `offer_fingerprints`, `coupons`,
`coupon_events`, `coupon_links`, `coupon_interactions`, `caza_*`, `distribution_*`, `affiliate_clicks`,
`affiliate_configs`, `affiliate_events`, `affiliate_programs`, `site_settings*`, vistas de compatibilidad
(`ofertas_*`, `offers_legacy_compat_v`, `votes_norm`, `user_roles_effective`, …). No se migran a producción.
Los cupones existen en staging pero no en producción: el módulo queda oculto (`COUPONS_MODULE_AVAILABLE = false`).

## Diferencias de grants detectadas

- `list_pending_settlement_reversal_commissions(integer)`: anon y authenticated tienen EXECUTE en ambos
  entornos aunque la migración del 2026-09-30 pretendía solo service_role. Sin exposición real: las tablas
  que lee tienen RLS sin políticas. Corrige la migración #8.
- `offer_performance_metrics`: en producción anon/authenticated solo tienen MAINTAIN, sin SELECT.
  `/admin/metrics` en modo «all» lee la vista con el cliente del navegador y por eso falla en producción.
  Requiere una ruta de servidor; no se cambia en esta fase.
