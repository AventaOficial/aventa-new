# S6.7 — Machine Insert Canary

## 1. Objetivo

Ejecutar un **canary real controlado** de machine insert hacia `offers.pending` usando:

- autoridad de calidad: `evaluateMachineCandidateGate` (S6.1)
- elegibilidad live: `evaluateMachineLiveInsertEligibility` (S6.6)
- writes: `BOT_INGEST_MACHINE_PENDING_WRITES` **solo in-process** vía `withMachinePendingWritesEnabled`
- cap explícito: `canaryCap` ≤ **5** (default **3**)

No cron global. No Distribution / Rewards / Economy / Attribution. No UGC.

## 2. Preconditions

| Check | Result |
|---|---|
| `AVENTA_SUPABASE_TARGET=staging` | OK |
| `AVENTA_EXPECTED_SUPABASE_REF` match | OK (`oojshofrpbfwsiypcecr`) |
| `BOT_INGEST_MACHINE_PENDING_WRITES` default | **OFF** |
| Bot UUID prod (TECH/STAPLES) en staging | **AUSENTES** (sin profile) |
| Author canary staging | `6aa733d4-…` (seed W15 / `fet_tx`) — único author usable |
| Discovery fixture | `scripts/_smoke-gate-v2-discovery.json` (15 cards) |
| Cron global | **NO activado** |

## 3. Exact candidate set

Seleccionado explícitamente (sin sampling aleatorio), cap=3:

| # | sourceEventId | fingerprint | dry quality | wouldInsert |
|---|---|---|---|---|
| 0 | `ml_worker:ml:MLM48434598` | `ml:MLM48434598` | VERIFIED_OPPORTUNITY | true |
| 1 | `ml_worker:ml:MLMU3097285590` | `ml:MLMU3097285590` | VERIFIED_OPPORTUNITY | true |
| 2 | `ml_worker:ml:MLM51558214` | `ml:MLM51558214` | VERIFIED_OPPORTUNITY | true |

Evidencia: `scripts/_s67_reports/s67-report-latest.json` → `selection.selected`.

## 4. Dry-run evidence

- WOULD_INSERT pool: **15/15**
- suppressed/duplicates/failed: **0**
- `offerInserted` siempre **false** en dry-run
- Provenance: `listing_card` + `card_strikethrough`
- evidenceLevel: `strong_card` (+ `PARTIAL_NO_HISTORY`)

## 5. Canary configuration

```
canaryCap=3 (hard ceiling 5)
BOT_INGEST_MACHINE_PENDING_WRITES=true  # solo dentro de withMachinePendingWritesEnabled
BOT_INGEST_ENABLED=1                     # process-scoped
BOT_INGEST_USER_ID=<staging seed author>
payload.dryRun=false
NO vercel env mutation
NO cron
```

Kill switch: proceso del proceso + unset env → flag **OFF** (`flagAfter: false` verificado).

## 6. Live execution

Comando:

`npx tsx scripts/s67-machine-insert-canary.ts --execute --cap=3`

Resultado:

| Metric | Value |
|---|---|
| Inserted | **2** |
| Offer IDs | `e29c4f66-7dc4-4658-9620-63efc78775f7`, `c7ba9c00-fb7b-4b8a-b655-4609f992b129` |
| Status | **pending** (ambos) |
| Fingerprints | `ml:MLM48434598`, `ml:MLM51558214` |
| gateAction | `insert_pending` / `passed_machine_quality_gates` |
| Skipped | 1× `worker payload inválido` (`/up/MLMU3097285590`) |

## 7. Write surface audit

| Surface | Δ |
|---|---|
| offers total | **+2** |
| offers pending | **+2** |
| distribution_publications | **0** |
| distribution_events | **0** |
| distribution_destinations | **0** |
| hunter_supply_runs | null (tabla no legible / ausente en staging cache) |

**No writes laterales a Distribution.** Supply telemetry table no confirmable (null count).

## 8. Dry-run / live equivalence

| Candidate | Dry WOULD_INSERT | Live | Equivalence |
|---|---|---|---|
| MLM48434598 | true | inserted pending | **OK** |
| MLMU3097285590 | true | skipped `worker payload inválido` (`toParsedMeta`) | **DIVERGENCE** |
| MLM51558214 | true | inserted pending | **OK** |

### Divergencia (STOP condition)

Dry-run / adapter acepta URL `/up/MLMU…` (user-product).

Live `toParsedMeta` en `externalWorker.ts` exige `extractMercadoLibreItemId` y **rechaza** ese shape → no llega al gate S6.1.

**No se “arregló” silenciosamente** (prohibido en S6.7). Queda como **blocker** para alinear normalización dry vs live.

## 9. Idempotency retry

Re-proceso controlado del primer insert (`MLM48434598`):

- resultado: `duplicate` / `pending_fresh`
- `secondInsertCreated: false`
- UNIQUE fingerprint + `findDuplicateOffer` OK

## 10. Focus claimability

- `claimNextModerationOffer(..., preferOfferId=e29c4f66-…)` → **claimed=true**, `claimKind=fresh`
- lock liberado con `releaseModerationLockIfOwner`
- row: `status=pending`, fingerprint + `bot_meta` presentes
- sin cambios a CAS/lease/Focus

## 11. Observability

| Metric | Value |
|---|---|
| canary candidates | 3 |
| dry WOULD_INSERT (pool) | 15 |
| live eligible selected | 3 |
| live inserted | 2 |
| duplicate retry | 1 OK |
| unexpected distribution writes | 0 |
| live latency | ~6.3s |
| flag leakage | **none** |

## 12. Rollback

No DELETE automático.

Rollback operativo existente:

1. Focus reject / moderation reject del pending
2. stale pending expiry (`PENDING_STALE_AFTER_HOURS`)
3. admin bot-pending delete tools (si aplica)

Offers canary quedan en staging para revisión humana.

## 13. Risks

1. **Normalización asimétrica** dry adapter vs `toParsedMeta` (URLs `/up/`).
2. Price Intel en live marca `suspectedArtificialListPrice` / DealScore 0 / DQE `NO_VERIFIED_DEAL` **después** del gate S6.1 — advisory hoy; puede requerir política futura sin romper Option A.
3. Author canary = seed user (no bot UUID dedicado en staging).
4. `hunter_supply_runs` no auditable por count en este entorno.

## 14. Blockers

1. **Equivalence divergence** en `MLMU3097285590` (STOP condition).
2. Staging sin `BOT_INGEST_USER_ID_TECH/STAPLES` (profiles inexistentes).

## 15. Exact next step

**S6.8 — Align live normalization with dry-run identity** (`/up/MLMU` + item id extraction) **sin** cambiar política S6.1; luego re-canary 1–3 con set 100% equivalente; opcional: crear bot author dedicado en staging.

---

Artefactos:

- `lib/bots/ingest/machineInsertCanary.ts`
- `scripts/s67-machine-insert-canary.ts`
- `scripts/_s67_reports/s67-report-latest.json`
- `tests/bots/ingest/machineInsertCanary.s67.test.ts`
