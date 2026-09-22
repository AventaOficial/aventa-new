# DocumentaciÃ³n AVENTA

## Source of Truth

| Archivo | DescripciÃ³n |
|---------|-------------|
| **[AVENTA_SOURCE_OF_TRUTH.md](./AVENTA_SOURCE_OF_TRUTH.md)** | **CanÃ³nico.** Estado REAL de sistemas, supply, moderaciÃ³n, money, autonomÃ­a y drift documental. CÃ³digo/producciÃ³n prevalecen sobre el resto de docs. |

Documentos activos en `docs/` (secundarios; si contradicen el SoT, gana el SoT):

| Archivo | DescripciÃ³n |
|---------|-------------|
| [GUIA_AVENTA.md](./GUIA_AVENTA.md) | Estado, roadmap y checklist del dÃ­a a dÃ­a (puede estar desfasado vs SoT) |
| [hunter/supply-orchestration.md](./hunter/supply-orchestration.md) | Supply Router / Truth (alineado con cÃ³digo FASE 10) |
| [SYSTEMS/RESEARCH_supply_intelligence_engine.md](./SYSTEMS/RESEARCH_supply_intelligence_engine.md) | Investigación científica Supply Intelligence Engine (2026-09-16) |
| [hunter/day-to-day-sources.md](./hunter/day-to-day-sources.md) | Fuentes DÃ­a a DÃ­a y flags |
| [HUNTER_INFRA_Y_ROADMAP.md](./HUNTER_INFRA_Y_ROADMAP.md) | Hunter infra histÃ³rica â€” **parcialmente obsoleta** (GHA worker es el camino real; ver SoT) |
| [CRON_EXTERNO_BOT.md](./CRON_EXTERNO_BOT.md) | CÃ³mo configurar cron-job.org â†’ `/api/cron/bot-ingest` |
| [FEEDBACK_Y_ROADMAP.md](./FEEDBACK_Y_ROADMAP.md) | Encuestas de beta, patrÃ³n de respuestas, quÃ© toca ahora, filtros (AVENTA vs Promodescuentos) |
| [SISTEMAS_AVENTA.md](./SISTEMAS_AVENTA.md) | Mapa de sistemas (app por partes), notificaciones, referencia a propuestas archivadas |
| [SUPABASE_CONTEXTO.md](./SUPABASE_CONTEXTO.md) | Schema public, funciones, triggers y extensiones Supabase |
| [COMO_LLEVAR_AVENTA.md](./COMO_LLEVAR_AVENTA.md) | CÃ³mo llevar el dÃ­a a dÃ­a (automÃ¡tizar, simplificar, menos fricciÃ³n) |
| [SISTEMA_SUBIR_OFERTA.md](./SISTEMA_SUBIR_OFERTA.md) | Flujo de subir oferta (parse URL, fotos, categorÃ­a) |
| [PARSE_OFFER_MELI_LA_GALERIA.md](./PARSE_OFFER_MELI_LA_GALERIA.md) | Fix galería `meli.la` / páginas social ML (parser + mobile) |
| [SYSTEMS/SYSTEM_offer_url_extraction.md](./SYSTEMS/SYSTEM_offer_url_extraction.md) | **Canónico:** parse URL → identidad → imágenes → success/partial; cómo añadir tiendas |
| [SYSTEMS/SYSTEM_mercadolibre_affiliate.md](./SYSTEMS/SYSTEM_mercadolibre_affiliate.md) | ML Afiliados: capability matrix + fail-closed ingest |
| [SYSTEMS/RESEARCH_affiliate_economic_intelligence.md](./SYSTEMS/RESEARCH_affiliate_economic_intelligence.md) | Research: Amazon+ML economic ingest evidence (FASE 1) |
| [SYSTEMS/AMAZON_EVIDENCE_HARVEST.md](./SYSTEMS/AMAZON_EVIDENCE_HARVEST.md) | Amazon MX export harvest checklist + NO-GO until IDs verified |
| [SYSTEMS/ARCHITECTURE_deal_intelligence_engine.md](./SYSTEMS/ARCHITECTURE_deal_intelligence_engine.md) | Deal Intelligence Engine — architecture audit (reuse Supply/DQE; no money) |
| [SYSTEMS/SYSTEM_deal_intelligence.md](./SYSTEMS/SYSTEM_deal_intelligence.md) | Deal Intelligence system contract (P0.1) |
| [SYSTEMS/ADR_price_memory_vs_observations.md](./SYSTEMS/ADR_price_memory_vs_observations.md) | ADR: evolve Price Memory; no new obs table yet |
| [SYSTEMS/ADR_deal_score_boundaries.md](./SYSTEMS/ADR_deal_score_boundaries.md) | ADR: Signals vs DQE vs Verifier vs votes |
| [SYSTEMS/ADR_price_observation_read_bridge.md](./SYSTEMS/ADR_price_observation_read_bridge.md) | ADR P0.2: SoT → PriceObservation read-only adapters |
| [SYSTEMS/AUDIT_moderation_offer_card_p03.md](./SYSTEMS/AUDIT_moderation_offer_card_p03.md) | Audit P0.3: Moderation OS + Offer Card (pre-implementation) |
| [SYSTEMS/SYSTEM_economy.md](./SYSTEMS/SYSTEM_economy.md) | Economy: adapter, revisions, reconciliation (sin settlement) |
| [SYSTEMS/SYSTEM_payout_operations.md](./SYSTEMS/SYSTEM_payout_operations.md) | **Centro de Pagos** (owner + finance): 6 cajas, gates payee, lote, runbook, score de automatización |
| [SYSTEMS/SYSTEM_conversion_commission.md](./SYSTEMS/SYSTEM_conversion_commission.md) | Detalle Conversion + Commission (alias de economy) |
| [README.md](./README.md) | Este Ã­ndice |

Las migraciones SQL estÃ¡n en `docs/supabase-migrations/`.

El resto de la documentaciÃ³n (auditorÃ­as, avisos, checklist tÃ©cnico, comparativas, mÃ©tricas, limpieza, modelo de votos, moderaciÃ³n, roadmap de producto, etc.) estÃ¡ archivada en **`archived/docs/`** para mantener `docs/` limpio.

