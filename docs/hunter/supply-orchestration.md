# Supply Orchestration (FASE 10)

Many sources → one `IngestItem` → one quality pipeline.

Community es source de primera clase. No hay segundo pipeline.

## Contrato canónico

`IngestItem` (`lib/bots/ingest/types.ts`) es el candidato.

`SupplyCandidate` es una **vista** de orquestación. Siempre lleva `ingestItem`.

## Pipeline

SOURCE → NORMALIZED CANDIDATE (`IngestItem`) → enrichment / Price Intel (ingest existente) → Deal Qualification → dedupe (`dedupeHunterCandidates`) → Deal Verifier → Autonomous Shadow → pending.

El router **no inserta, no publica, no toca rewards, no salta verifier**.

## Registry

`lib/hunter/supply/registry.ts` envuelve `HUNTER_SOURCES` y añade:

- `community` (always on)
- `affiliate_feed` (NOT_CONFIGURED)
- `partner` (NOT_CONFIGURED)

Home Depot / Soriana no se registran como collectables.

## Community vs POST /api/offers

FASE 10.1: `POST /api/offers` evalúa con `evaluateCommunitySubmission` (qualification → verifier → Autonomous shadow) y **siempre** inserta `pending`.

Reputación / whitelist owner ya no cambian el status. No auto-publish. No rewards. No scrape en el POST.

El router de FASE 10 sigue siendo dry-run de orquestación; no inserta.

## Affiliate ≠ supply

`classifyOfferMonetization` no rechaza. Publisher gate intacto.

## Universos

`supplyTruth` (FASE 10.2, `hunter_supply_runs`) ≠ `supplyOrchestration` (memoria) ≠ source health ≠ dealQualification ≠ autonomousPct ≠ communityQuality.

Supply Truth: qué produjo cada source. Source health: ¿está viva? Shadow: qué habría decidido Autonomous.

Métrica principal: **verified deal contribution**, no raw candidate count.

## Flags

Day-to-Day OFF. Auto-publish OFF. Legacy auto-approve OFF. Autonomous SHADOW ONLY.
