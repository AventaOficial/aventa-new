# Documentación AVENTA

## Source of Truth

| Archivo | Descripción |
|---------|-------------|
| **[AVENTA_SOURCE_OF_TRUTH.md](./AVENTA_SOURCE_OF_TRUTH.md)** | **Canónico.** Estado REAL de sistemas, supply, moderación, money, autonomía y drift documental. Código/producción prevalecen sobre el resto de docs. |

Documentos activos en `docs/` (secundarios; si contradicen el SoT, gana el SoT):

| Archivo | Descripción |
|---------|-------------|
| [GUIA_AVENTA.md](./GUIA_AVENTA.md) | Estado, roadmap y checklist del día a día (puede estar desfasado vs SoT) |
| [hunter/supply-orchestration.md](./hunter/supply-orchestration.md) | Supply Router / Truth (alineado con código FASE 10) |
| [hunter/day-to-day-sources.md](./hunter/day-to-day-sources.md) | Fuentes Día a Día y flags |
| [HUNTER_INFRA_Y_ROADMAP.md](./HUNTER_INFRA_Y_ROADMAP.md) | Hunter infra histórica — **parcialmente obsoleta** (GHA worker es el camino real; ver SoT) |
| [CRON_EXTERNO_BOT.md](./CRON_EXTERNO_BOT.md) | Cómo configurar cron-job.org → `/api/cron/bot-ingest` |
| [FEEDBACK_Y_ROADMAP.md](./FEEDBACK_Y_ROADMAP.md) | Encuestas de beta, patrón de respuestas, qué toca ahora, filtros (AVENTA vs foros de ofertas consolidados) |
| [SISTEMAS_AVENTA.md](./SISTEMAS_AVENTA.md) | Mapa de sistemas (app por partes), notificaciones, referencia a propuestas archivadas |
| [SUPABASE_CONTEXTO.md](./SUPABASE_CONTEXTO.md) | Schema public, funciones, triggers y extensiones Supabase |
| [COMO_LLEVAR_AVENTA.md](./COMO_LLEVAR_AVENTA.md) | Cómo llevar el día a día (automátizar, simplificar, menos fricción) |
| [SISTEMA_SUBIR_OFERTA.md](./SISTEMA_SUBIR_OFERTA.md) | Flujo de subir oferta (parse URL, fotos, categoría) |
| [PARSE_OFFER_MELI_LA_GALERIA.md](./PARSE_OFFER_MELI_LA_GALERIA.md) | Fix galer�a `meli.la` / p�ginas social ML (parser + mobile) |
| [SYSTEMS/SYSTEM_offer_url_extraction.md](./SYSTEMS/SYSTEM_offer_url_extraction.md) | **Can�nico:** parse URL ? identidad ? im�genes ? success/partial; c�mo a�adir tiendas |
| [SYSTEMS/SYSTEM_mercadolibre_affiliate.md](./SYSTEMS/SYSTEM_mercadolibre_affiliate.md) | ML Afiliados: capability matrix + fail-closed ingest |
| [SYSTEMS/RESEARCH_affiliate_economic_intelligence.md](./SYSTEMS/RESEARCH_affiliate_economic_intelligence.md) | Research: Amazon+ML economic ingest evidence (FASE 1) |
| [SYSTEMS/AMAZON_EVIDENCE_HARVEST.md](./SYSTEMS/AMAZON_EVIDENCE_HARVEST.md) | Amazon MX export harvest checklist + NO-GO until IDs verified |
| [SYSTEMS/ARCHITECTURE_deal_intelligence_engine.md](./SYSTEMS/ARCHITECTURE_deal_intelligence_engine.md) | Deal Intelligence Engine � architecture audit (reuse Supply/DQE; no money) |
| [SYSTEMS/SYSTEM_deal_intelligence.md](./SYSTEMS/SYSTEM_deal_intelligence.md) | Deal Intelligence system contract (P0.1) |
| [SYSTEMS/ADR_price_memory_vs_observations.md](./SYSTEMS/ADR_price_memory_vs_observations.md) | ADR: evolve Price Memory; no new obs table yet |
| [SYSTEMS/ADR_deal_score_boundaries.md](./SYSTEMS/ADR_deal_score_boundaries.md) | ADR: Signals vs DQE vs Verifier vs votes |
| [SYSTEMS/ADR_price_observation_read_bridge.md](./SYSTEMS/ADR_price_observation_read_bridge.md) | ADR P0.2: SoT ? PriceObservation read-only adapters |
| [SYSTEMS/AUDIT_moderation_offer_card_p03.md](./SYSTEMS/AUDIT_moderation_offer_card_p03.md) | Audit P0.3: Moderation OS + Offer Card (pre-implementation) |
| [SYSTEMS/SYSTEM_economy.md](./SYSTEMS/SYSTEM_economy.md) | Economy: adapter, revisions, reconciliation (sin settlement) |
| [SYSTEMS/SYSTEM_payout_operations.md](./SYSTEMS/SYSTEM_payout_operations.md) | **Centro de Pagos** (owner + finance): 6 cajas, gates payee, lote, runbook, score de automatizaci�n |
| [SYSTEMS/SYSTEM_conversion_commission.md](./SYSTEMS/SYSTEM_conversion_commission.md) | Detalle Conversion + Commission (alias de economy) |
| [README.md](./README.md) | Este índice |

Las migraciones SQL están en `docs/supabase-migrations/`.

El resto de la documentación (auditorías, avisos, checklist técnico, comparativas, métricas, limpieza, modelo de votos, moderación, roadmap de producto, etc.) está archivada en **`archived/docs/`** para mantener `docs/` limpio.

