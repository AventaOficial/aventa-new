# AUDIT — P0.5 MSI Ingest Forensics + Moderation Intelligence

**Fecha:** 2026-09-16  
**Modo:** Forensic + design only. **Sin implementación de mapping MSI.**  
**Clasificación MSI bot:** `UNSUPPORTED` (código/fixtures actuales) · señal ML search `installments`: `UNKNOWN` (no consumida, no auditada en runtime)

---

## 1. RESULT (audit gate)

| Pregunta | Veredicto |
|----------|-----------|
| ¿Implementar MSI mapping bot ahora? | **NO** — no hay evidencia real leída en el pipeline |
| ¿Existe telemetría de moderación reusable? | **SÍ parcial** — `moderation_outcomes` + `moderation_logs` |
| ¿Nueva tabla ahora? | **NO** |

---

## 2. MSI FORENSIC FINDINGS

### Trace canónico

```
SOURCE (ml_api | ml_worker | amazon_* | env_urls | day-to-day)
  → adapter / parser
  → ParsedOfferMetadata     ← SIN campo MSI
  → enrichment / qualify
  → insertIngestedOffer     ← SIN msi_months / bank_coupon
  → offers.msi_months       ← queda null
```

Community (distinto):

```
ActionBar (MSI manual) → POST /api/offers → offers.msi_months (1–24)
```

### Respuestas 1–10

1. **Fuentes bot activas:** `ml_api`, `ml_worker`, `amazon_asin`/`amazon_paapi`, `env_urls`, retailers day-to-day (`walmart_mx`, `bodega_aurrera_mx`, `chedraui_mx`).
2. **Adapters:** `discoverMercadoLibreIngestItems`, worker `toParsedMeta`/`processExternalWorkerBatch`, PAAPI `normalizePaapiItem`, HTML `fetchParsedOfferMetadata`, retail `draftToIngestItem`.
3. **Meta pre-insert:** title, prices, image, store, signals de calidad/precio — **no MSI**.
4. **¿Source contiene MSI en lo que el código usa?** No tipado ni leído.
5. **¿Se pierde en parsing?** No se pierde: **nunca entra**.
6. **¿Normalization?** N/A — no hay campo.
7. **¿Insert?** Omite `msi_months` deliberadamente por ausencia de campo.
8. **¿Nunca en source (consumido)?** Sí, para el pipeline actual.
9. **Community reusable:** validadores `parseOfferEditMsiMonths` / Zod — **sí**; UI ActionBar — **no** como extractor.
10. **ML/Amazon sin scrape nuevo:** PAAPI **UNSUPPORTED**; ML items tipados **UNSUPPORTED**; ML search históricamente puede traer `installments` — **UNKNOWN** (repo no lo lee; no hay fixture/runtime audit).

### Clasificación

| Ámbito | Label |
|--------|-------|
| Bot write path MSI | **UNSUPPORTED** |
| Community write MSI | **SUPPORTED** |
| Validadores 1–24 | **SUPPORTED** |
| ML `installments` sin scrape | **UNKNOWN** |
| Amazon PAAPI MSI | **UNSUPPORTED** |

**Gate FASE 1:** no implementar mapping.

---

## 3. SOURCE → PARSER → INGEST TRACE (archivos)

| Etapa | Path |
|-------|------|
| Meta type | `lib/bots/ingest/fetchParsedOfferMetadata.ts` → `ParsedOfferMetadata` |
| Insert | `lib/bots/ingest/insertIngestedOffer.ts` |
| ML discover | `lib/bots/ingest/discoverMercadoLibre.ts` |
| Worker | `lib/bots/ingest/externalWorker.ts` + `workers/mercadolibre-worker/` |
| PAAPI | `lib/bots/ingest/amazonPaapi.ts` (o path hunter equivalente) |
| Doc gap P0.4 | `docs/SYSTEMS/RESEARCH_msi_ingest_gap_p04.md` |

---

## 4. MSI CAPABILITY

```
SUPPORTED          = community + moderation edit
PARTIALLY_SUPPORTED= (ninguno en bot hoy)
UNKNOWN            = ML search installments no consumido
UNSUPPORTED        = bot ingest end-to-end
```

Próximo único camino legítimo (futuro P0):  
capturar JSON **ya autorizado** de ML que contenga `installments`, tiparlo, mapear `quantity`→`msi_months` **solo si** `rate===0` (u otra regla documentada), validar 1–24, telemetría de rechazo. **Sin HTML scrape nuevo.**

---

## 5. MSI CHANGES

**Ninguno en código** (FASE 1 bloqueada por audit).

---

## 6. MODERATION TELEMETRY — EXISTING STATE

| Acción | `moderation_logs` | `moderation_outcomes` | Shadow | Focus console |
|--------|-------------------|----------------------|--------|---------------|
| claim | solo stale_reclaim | `decision=claim` + meta claim_kind/session | — | claim / stale_reclaim |
| approve | `approved` | `approve` + time_from_submission | HUMAN_APPROVED | approve |
| reject | `rejected` + reason | `reject` | HUMAN_REJECTED | reject |
| snooze | **NO** | `snooze` + minutes | HUMAN_SNOOZED | snooze |
| edit | `edited` + fields/changes/demoted | **NO** | **NO** | **NO** |
| skip | — | — | — | skip |

**Timers:**
- `claimLatencyMs`: in-memory only (`claimLatencyTracker`)
- `time_from_submission_ms`: created_at → decisión (no claim→decisión)
- Dwell mobile claim→edit→approve: **ausente**

---

## 7. CONTRACT — ModerationDecisionObservation (design only)

```ts
/**
 * Contrato canónico — NO persistido aún.
 * Materializable como VIEW/join de moderation_outcomes + moderation_logs + offers.
 */
type ModerationDecisionObservation = {
  // identity
  offer_id: string;
  source: string | null;          // bot_meta.source / profiles
  source_lane: 'community' | 'machine' | 'unknown';
  merchant: string | null;        // store
  brand: string | null;           // UNKNOWN if not in schema — omit until real column
  category: string | null;

  // product/economic (offer snapshot at decision — no affiliate $)
  price: number | null;
  original_price: number | null;
  discount_percent: number | null; // derived
  msi_months: number | null;
  coupon_present: boolean;
  bank_coupon_present: boolean;
  price_memory_available: boolean | null; // from bot_meta signals if present
  historical_low_available: boolean | null;
  dqe_score: number | null;               // from bot_meta if present
  verifier_result: string | null;         // if attached in meta — else null

  // moderation
  outcome: 'approve' | 'reject' | 'snooze' | 'claim'; // canonical outcomes vocab
  rejection_reason: string | null;
  edited_before_decision: boolean;        // join logs action=edited same offer/session window
  edited_fields: string[] | null;
  time_from_submission_ms: number | null; // already in outcomes
  time_from_claim_ms: number | null;      // NOT available today → null until instrumented
  moderator_id: string;
  decision_at: string;
};
```

**Labels canónicos (FASE 4) — no inventar “good/bad deal”:**

| Label | Derivación |
|-------|------------|
| `approved` | outcomes.approve |
| `rejected` | outcomes.reject |
| `snoozed` | outcomes.snooze |
| `edited` | logs.edited (no es outcome final) |
| `edited_then_approved` | edited log + later approve same offer_id |
| `claimed` | outcomes.claim (operativo, no quality label) |

Training futuro: `outcome` (+ `edited_then_approved`) como weak labels; nunca “great deal” sin criterio canónico.

---

## 8. SOURCE PERFORMANCE METRICS (design)

| Métrica | ¿Calculable hoy? | Fuente |
|---------|------------------|--------|
| candidates / pending by source | Parcial | offers + bot_meta.source |
| approved / rejected | Sí | moderation_outcomes |
| approval_rate | Sí | join outcomes × offers.source |
| edit_rate | Parcial | logs.edited / claims |
| price_correction_rate | Parcial | logs.edited metadata.changes.price |
| MSI_detection_rate (ingest) | **0 / N** bot hoy | offers.msi_months IS NOT NULL ∧ is_bot |
| bank_coupon_detection_rate | Parcial | offers.bank_coupon |
| duplicate_rate | Parcial | outcomes.is_duplicate / bot signals |
| avg DQE | Parcial | bot_meta.score |
| avg time_to_decision | Sí | time_from_submission_ms |
| CTR / conversion | **NO en este dataset** | attribution (fuera de alcance P0.5) |

**No dashboards en P0.5.**

---

## 9. GOLDEN_OFFERS (design only — no table)

**Entrada conceptual:**

- `outcome = approve`
- campos mínimos: price, title, offer_url, category?, image?
- `source_lane` conocido
- opcional: edited_fields vacío o conocido

**Campos futuros para comparación:**

```
bot_signals_at_ingest (bot_meta snapshot)
human_outcome
human_edits
later: clicks / conversions (otro sistema — no mezclar aquí)
```

---

## 10–12. TESTS / CI / PRODUCTION

N/A código nuevo. Sin deploy de mapping.

---

## 13–14. SAFETY

Sin mutaciones money/Supply/DI/DQE/Verifier/auto*. Delta = 0 por no-implementación.

---

## 15. REMAINING GAPS

1. Runtime audit de payload ML search/items por `installments` (read-only).
2. Snooze no escribe `moderation_logs`.
3. Edit no escribe `moderation_outcomes`.
4. No hay `time_from_claim_ms`.
5. Focus telemetry no durable.
6. Brand column / MSI bot: UNKNOWN/UNSUPPORTED.

---

## 16. EXACT NEXT P0

**P0.5b — Read-only ML installments probe**  
Script/fixture: capturar N respuestas reales de la API ML ya usada; documentar si `installments` aparece; solo entonces abrir P0.5c mapping mínimo a `msi_months`.

En paralelo opcional (no MSI): **P0.6 Moderation observation view** — SQL VIEW join outcomes+logs+offers sin nueva tabla de features.

---

## DETENTE

Audit completo. **Sin código de mapping MSI.**  
Artefacto: este documento.
