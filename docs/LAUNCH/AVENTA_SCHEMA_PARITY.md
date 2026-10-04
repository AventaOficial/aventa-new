# Paridad de schema: staging vs producción

Fecha: 2026-10-04, alrededor de 19:26 UTC.
Producción: `mkgsrpsuvedwwlzmzmzh`. Staging: `oojshofrpbfwsiypcecr`.
Método: `pg_class` en `public` y `maintenance`, `relkind` in (`r`,`v`,`m`,`p`). No se igualaron los schemas.

| | Producción | Staging |
|---|---|---|
| Relaciones | 88 | 130 |
| Huella md5 del inventario | `0aae9aa93fd86f4cf323f6d9194c88f5` | `03fbd5ec25233a3daf8074fccaca6422` |

No se copió staging hacia producción ni al revés.

## Solo en producción (13)

Estas tablas existen en el proyecto que sirve el sitio. Staging no las tiene. No bloquean el lanzamiento del sitio público. Sí hacen que un test de staging no represente esas superficies.

- `affiliate_commission_revisions`
- `affiliate_reconciliation_findings`
- `affiliate_reconciliation_runs`
- `community_offers`
- `hunter_shadow_cycles`
- `hunter_shadow_outcomes`
- `hunter_source_health`
- `ingest_cycle_locks`
- `mercadolibre_oauth_tokens`
- `offer_performance_metrics`
- `offer_price_snapshots`
- `offer_quality_checks`
- `reward_clawback_adjustments`

Clasificación: **required para paridad de pruebas**, no para igualar a ciegas. No se crearon en staging en esta pasada.

## Solo en staging (55)

Catálogo legado y experimentos. **Obsolete para producción.** No copiar.

`admin_kpi_daily`, `affiliate_clicks`, `affiliate_configs`, `affiliate_events`, `affiliate_programs`, `affiliate_verifications`, `caza_affiliate_mappings`, `caza_deal_candidates`, `caza_publications`, `caza_revenue_events`, `community_members`, `coupon_events`, `coupon_interactions`, `coupon_links`, `coupons`, `deal_alert_subscriptions`, `distribution_brands`, `distribution_destinations`, `distribution_events`, `distribution_publications`, `event_types`, `fx_rates`, `merchants`, `moderation_log`, `my_rank`, `ofertas`, `ofertas_author_compat`, `ofertas_scores`, `ofertas_scores_mv`, `offer_fingerprints`, `offer_interactions`, `offer_scores`, `offer_vote_counts`, `offer_vote_stats`, `offers_legacy_compat_v`, `offers_normalized`, `payouts`, `promotion_requests`, `push_subscriptions`, `site_settings`, `site_settings_active`, `site_settings_current_json`, `site_settings_latest`, `stores`, `top_helpers_day`, `top_helpers_week`, `ui_events`, `ui_events_rejects`, `user_roles_effective`, `user_roles_from_profiles_v`, `user_roles_tbl`, `v_affiliate_revenue_by_user`, `v_payouts_pending`, `votes_norm`, `votos`.

## Cron

| Job | Producción | Staging | Clasificación |
|---|---|---|---|
| `offers-lifecycle-v2` `17 * * * *` | Activo. Primera corrida automática 19:17 UTC, `succeeded`. | Activo (job 8). | Intencional y alineado. |
| `aventa_expire_offers` cada 5 min, `SELECT public.aventa_mark_expired()` | No existe. | Activo. | **Peligroso en staging, ausente en producción.** No se desactivó. No se porta a producción. |
| Retención de `ui_events`, `cron.job_run_details`, `realtime.messages` | No están en `cron.job` de producción. | Activos. | Staging-only. No son el lifecycle de ofertas. |

## Objetos de lanzamiento presentes en ambos

`offers`, `ofertas_ranked_general`, `offer_health_state`, `offer_lifecycle_runs`, `offer_events`, `moderation_logs`, `user_roles`, `profiles`, `team_memberships`, `creator_rewards`, `reward_outbound_clicks`, `payout_intents`.

En staging, un `DELETE` privilegiado sobre `offer_events` abortó con `append-only evidence table public.offer_events: DELETE is not allowed`. En producción, los triggers `trg_evidence_no_delete` están en las tablas de evidencia y dinero listadas en la matriz de cierre.
