# ADR — SUPPLY CANDIDATE BOUNDARY

**Status:** Accepted  
**Date:** 2026-09-17  
**Implemented follow-up:** S2 RawObservation contract + ingest provenance (2026-09-17) — no `deal_candidates` table; no DDL.  
**Deciders:** Principal / Staff architecture (S1 post Forensic Audit #1)  
**Precedencia:** código vivo + `docs/AVENTA_SOURCE_OF_TRUTH.md` + ADRs Deal Intelligence > research aspiracional  
**Scope:** una sola decisión — dónde vive el Supply Candidate  
**Non-goals:** implementación, migraciones, Distribution C2, Rewards, Economy, Attribution, nuevo scorer, nueva queue, nueva Moderación

---

## Context

Aventa ya opera este camino:

```text
Community | Bot ingest | ML worker
  → IngestItem (+ quality pipeline)
  → offers.status = 'pending'
  → Moderation Focus (claim server-side / CAS)
  → approve | reject
  → [solo approve + flag] Distribution enqueue
```

Hechos del Audit #1 (no reauditoría):

- No existe `deal_candidates` persistido.
- No existe `canonical_products` persistido.
- No existe Raw Evidence store append-only.
- `offers.pending` es el candidato de facto y el **work item** de Focus.
- Existen: `IngestItem`, Supply registry, `product_fingerprint` UNIQUE parcial, Price Memory (`product_price_snapshots`), DealScore v1, DQE/Verifier, `findDuplicateOffer` + kinds (`pending_fresh|pending_stale|live|…`).
- Auto-publish OFF en production. Distribution C1 en WT; C2 abierto. Engine OFF.
- P0-A / P0-B cerrados — no modificar.

## Problem

Hay que fijar la frontera canónica del “candidato” de Supply Intelligence antes de construir RawEvidence, opportunity wiring o nuevos SourceAdapters.

Sin esta decisión:

- Risk de crear `deal_candidates` que duplique `offers.pending` y obligue a reescribir Focus.
- Risk de seguir tratando ticks de precio / fallos de source como filas `offers`.
- Risk de confundir **observation scale** (10M) con **candidate/moderation scale** (capacidad humana).

Pregunta única:

> ¿El work item que entra a Moderación es `offers.pending`, o una entidad pre-offer `deal_candidates` que luego materializa offer?

---

## Options

### Option A — `offers.pending`

```text
Source → IngestItem → intelligence (pre-insert)
  → offers.pending (+ provenance)
  → Moderation Focus
  → approve/reject
  → Distribution (solo post-approve)
```

RawEvidence / observations viven **fuera** de `offers` (entidad conceptual aparte).  
Solo lo que pasa gates de calidad se materializa como fila pending.

### Option B — `deal_candidates`

```text
Source → RawObservation → intelligence
  → deal_candidate
  → materialize offers.pending  (o Focus sobre candidates)
  → Moderation → Offer → approve → Distribution
```

Nueva lifecycle, nueva idempotencia, nueva integración con Moderación.

---

## Decision

**Option A — `offers.pending` es el Supply Candidate canónico (moderation work item).**

Complemento obligatorio (contrato, no tabla obligatoria en S1):

- **RawObservation / SourceEvent** como entidad conceptual separada para evidencia y price ticks.
- **No** introducir `deal_candidates` en esta fase.
- Evolución a Option B solo si se disparan triggers de escala medibles (sección Future evolution).

---

## Decision rationale

Evaluación por criterio (evidencia de sistema actual, no preferencia estética):

| # | Criterio | A | B | Ganador |
|---|----------|---|---|---------|
| 1 | Escalabilidad candidates→mods | Capada por throughput Focus + gates pre-insert | Buffer extra; Focus sigue necesitando materialize o rewrite | **A ahora** |
| 2 | Idempotencia | UNIQUE `product_fingerprint` + `findDuplicateOffer` ya en path insert | Nueva clave candidate + sync offer | **A** |
| 3 | Trazabilidad | Mejorable con RawObservation + `bot_meta`/provenance en offer | Mejor nativa si se construye bien | Empate → A + RawObs |
| 4 | Reprocessing | Re-score in-place en pending; re-insert bloqueado por fingerprint | Más fácil re-score sin tocar offers | **B** (diferido) |
| 5 | Dedup | Un activeish offer/producto (`amz:`/`ml:`) | Multi-candidate requiere política nueva vs UNIQUE | **A** (política actual) |
| 6 | Moderation integration | Focus ya lee `offers.pending` (P0-B) | Materialize layer o cambio Focus | **A** (no tocar P0-B) |
| 7 | UGC coexistence | Mismo work item; distinto author/provenance | Dos colas o materialize asimétrico | **A** |
| 8 | Machine discovery | Gates antes de insert; dupes → métrica no fila | Candidates huérfanos si materialize falla | **A** |
| 9 | Price observations | Ya Price Memory; no viven en candidate | B no resuelve 10M ticks | **A** + RawObs/PM |
| 10 | Multi-source | Primer insert gana; otros = duplicate + opportunity metric | Multi-candidate competencia | **A** hoy |
| 11 | Failure recovery | Cycle lock + skip/error stats; pending lifecycle 72h | Dual-state candidate↔offer | **A** |
| 12 | Data lifecycle | pending → approve/reject/timeout ya existe | Nueva máquina de estados | **A** |
| 13 | Storage growth | Solo candidatos que pasan gate entran a offers | Candidates + offers = doble crecimiento si se materializa todo | **A** |
| 14 | Query performance | Índices status/pending existentes | Join candidate→offer en Focus | **A** |
| 15 | Ops complexity | Menor | Mayor (dos lifecycles) | **A** |
| 16 | Migration complexity | Cero tablas nuevas para frontier | DDL + backfill + Focus wiring | **A** |
| 17–19 | Multi-merchant / 1M products / 10M obs | Observations ≠ candidates; PM + RawObs escalan aparte | `deal_candidates` no almacena 10M observations | **A** |
| 20 | Separar Supply de Offer | Offer draft = unidad publicable potencial; intelligence pre-insert | Separación más limpia en papel | **B aspiracional** / **A pragmático** |

### Por qué B no gana ahora

1. **P0-B consume `offers`.** Option B útil implica (i) reescribir Focus sobre `deal_candidates` (prohibido sin dependencia demostrada) o (ii) materializar a `pending` antes de claim. En (ii), el candidate de Moderación **sigue siendo** `offers.pending`; B solo añade un buffer pre-cola con dual-state (candidate sin offer, offer sin candidate, materialize fail, double-claim).
2. **Categoría errónea:** 10M price observations se resuelven con Price Memory / RawObservation append-only, no con una tabla de candidates. Mezclar “observation store” con “deal_candidates” recrea la confusión que el ADR de Price Memory ya rechazó.
3. **Política de dedupe actual:** un solo activeish (`pending|approved|published`) por fingerprint. “Múltiples candidates del mismo producto” contradice esa política hasta que se decida explícitamente competir variantes — eso es un cambio de producto, no un requisito de frontera S1.
4. **UGC y machine ya comparten el work item correcto:** Moderación decide publicabilidad de un draft. No deben compartir el store de observations; sí deben compartir la cola de decisión humana.

### Escala concreta

| Carga | Qué pasa con A | Qué pasaría con B ahora |
|-------|----------------|-------------------------|
| **1,000 cand/day** | Insert pending tras gates; Focus drena; fingerprint bloquea re-finds | Buffer innecesario; mismo Focus |
| **10,000 cand/day** | Cuello = moderación + `pending_stale` (72h), no el modelo de tabla. Mitigación: top-K / score gate **antes** de insert (ya hay verifier/DQE) | Candidates acumulan; hay que materializar ≤ capacidad Focus o reinventar claim |
| **100,000 cand/day** | **Prohibido** insertar 100k en `offers`. A exige drop/suppress pre-insert; solo ~capacidad cola entra. Si se ignorara el gate, offers se engorda de ruido — fallo operacional, no argumento a favor de B sin gate | B sin gate también explota; B con gate ≈ A + tabla extra |
| **1M products** | Identidad vía fingerprint + futura entity graph; no requiere `deal_candidates` | Idem |
| **10M observations** | `product_price_snapshots` / futuro tick store; **no** filas candidate | Meter observations en candidates es anti-patrón |
| **Duplicate observations** | No insert; kind + `supplyOpportunity` métrica; evidence en RawObs | Candidate update o nuevo row — hay que definir merge |
| **Source failure** | Stats por source/seed; ciclo no es all-or-nothing | Igual; más estados que reconciliar |
| **Candidate retry** | Re-evaluación pre-insert; cooldown post `auto_rejected_timeout` | Retry en candidate table |
| **Moderation reject** | Offer rejected; humano no bloquea reinsert (salvo timeout cooldown) | Hay que espejar reject a candidate |
| **Expiration** | Lifecycle pending >72h → `auto_rejected_timeout` | TTL en candidates + sync |
| **Price change** | Nueva observation → opportunity metric si live/pending existe; update pending es ops/mod path, no re-spam | Candidate rescore nativo (beneficio B diferido) |
| **Same product multi-merchant** | Fingerprints distintos (`amz:` vs `ml:`) = dos offers posibles (cross-market OK) | Igual necesita identity layer |
| **Same product multi-source same market** | Primer pending/live gana; resto duplicate | Multi-candidate solo si se cambia política |

**Conclusión de escala:** el control de volumen es el **gate pre-insert**, no la existencia de `deal_candidates`. B se justifica cuando se necesite **competencia multi-candidate** o **holding area con rescore masivo sin tocar offers** — triggers futuros, no S1.

---

## Consequences

### Positive

- Cero cambio a Focus / claim / CAS (P0-B intacto).
- Una sola idempotencia de publicación/moderación (`product_fingerprint`).
- UGC y machine convergen en el mismo work item humano.
- Menor superficie ops; sin dual-state candidate↔offer.
- Permite RawObservation sin forzar nueva cola de moderación.

### Negative

- `offers` sigue mezclando “draft publicable” con “candidato de intelligence que pasó gate”.
- Reprocess masivo de intelligence sobre no-insertados requiere RawObservation (obligatorio conceptualmente).
- No hay competencia multi-variant pre-moderation sin cambiar UNIQUE policy.
- A 100k/day discovery crudo, disciplina de gate es crítica (ya lo era).

### Operational

- Seguir midiendo `pending_stale`, duplicate kinds, supply opportunities.
- No interpretar “AUTO_APPROVE shadow” como publish.
- Provenance mínima en insert machine (`ingest source`, score version, evidence refs).

### Scaling

- Escalar observations ≠ escalar pending rows.
- Pending rows ≈ f(capacidad moderación, top-K).
- Trigger a B documentado abajo.

### Migration

- **S1:** ninguna migración.
- RawEvidence: contrato primero; DDL solo en fase posterior explícita.
- No backfill `deal_candidates`.

---

## Lifecycle (definitivo bajo Option A)

```text
SOURCE (adapter / community / worker)
  → SOURCE_EVENT / RAW_OBSERVATION   (evidencia; puede no crear offer)
  → NORMALIZE + ENTITY + PRICE/PROMO ANALYSIS
  → OPPORTUNITY + DealScore v1 + DQE/Verifier gates
  → [suppress | duplicate-metric | insert]
  → offers.pending                    ← CANDIDATE CANÓNICO / work item
  → Moderation Focus (server claim)
  → approve | reject | timeout
  → [approve] Distribution enqueue → … (fuera de Supply)
```

Invariantes:

- Supply **nunca** llama Telegram / Distribution delivery.
- DealScore **nunca** aprueba ni publica.
- Economy / Rewards / Attribution **no** viven en el candidate.

---

## Idempotency model

Identidades conceptuales (no inventar PK SQL aún):

| Entidad | Identidad estable | Notas |
|---------|-------------------|--------|
| **Source event** | `(source_id, source_event_id)` o `(source_id, fetch_url, fetched_at_bucket, payload_hash)` | Un fetch/ciclo/página |
| **Observation** | `(marketplace, merchant_product_id \| fingerprint, observed_at_bucket, price_hash)` | Tick de precio/disponibilidad; Price Memory puede colapsar a daily |
| **Candidate (moderation)** | `offers` row con `product_fingerprint` ∈ `amz:*\|ml:*` UNIQUE entre pending\|approved\|published | **Una** unidad activa por producto strong-id |
| **Offer (post-decision)** | Misma row; status cambia | No segunda entidad |

**Amazon + ML + community del “mismo” producto físico:**

- Cross-marketplace: fingerprints distintos → hasta dos candidates (amz vs ml) — correcto hasta entity resolution P1+.
- Same marketplace multi-source: **un** pending/live; otros → `duplicate` + optional `supplyOpportunity` si precio mejor; RawObservation conserva que source B también lo vio.
- Community vs machine: misma regla fingerprint; author/provenance distinguen origen; no segunda cola.

`product_fingerprint` **no** es identidad de observation ni de source event — solo de candidate/offer activeish.

---

## Raw Evidence model

**Pertenencia:** **C) Source event / RawObservation** — **no** A (deal_candidate), **no** B-only-on-candidate.

Contrato conceptual (sin storage obligatorio en S1):

```text
RawObservation
  source_id
  source_event_id
  url
  observed_at
  raw_payload_ref          // inline pequeño o pointer object storage / hash
  fetch_metadata           // status, latency, redirect hops count, content-type
  parser_version
  normalization_version
  evidence_hash
  provenance               // worker run id, seed id, profile
  processing_status        // received|normalized|scored|suppressed|inserted|error
  linked_offer_id?         // nullable; set solo si insert pending/approved
  linked_fingerprint?
```

Reglas:

- Append-only lógicamente (no destruir evidencia).
- Puede existir **sin** offer (majority path a escala).
- No inventar Redis/S3/Kafka en S1: primero columnas/`bot_meta` + snapshots existentes; DDL dedicado cuando volumen o compliance lo exijan.
- SSRF: todo fetch sigue `fetchUrlSafety` / allowlists; raw URL no implica fetch interno libre.

---

## Deduplication model

1. **Pre-insert (lote):** dedupe Hunter/Supply candidates.
2. **Insert:** `findDuplicateOffer` + UNIQUE parcial fingerprint.
3. **Kinds:** `pending_fresh` / `pending_stale` / `live` / `expired` / `timeout_cooldown` — diagnóstico de cola, no segundo algoritmo.
4. **Reject humano:** no bloquea re-descubrimiento (política actual).
5. **Timeout auto:** cooldown 72h alineado.
6. **Mejor precio en dupe:** métrica `supplyOpportunity` — no auto-replace sin decisión de producto.

---

## DealScore (sin nuevo scorer)

| Pregunta | Respuesta bajo A |
|----------|------------------|
| ¿Cuándo se ejecuta? | En intelligence **pre-insert** (y opcional refresh read-only en UI Focus) |
| ¿Candidate u offer? | Sobre el draft que será / es `offers.pending` |
| ¿Qué versión se registra? | `DealScore.version` (`DEAL_SCORE_VERSION`) + reasons/evidence en provenance/`bot_meta` |
| ¿Recálculo? | Re-run determinista con mismos inputs; no borra RawObservation |
| ¿Puede publicar? | **No.** Solo priorización / telemetría. Approve = `moderate-offer` servidor |

ADR `ADR_deal_score_boundaries.md` permanece vigente.

---

## Moderation integration

```text
Supply → offers.pending → Moderation Focus (claim CAS) → moderate-offer
```

- No Focus sobre otra tabla.
- No claim client-side authority.
- No segunda Moderación.
- UGC y machine: mismo claim path; filtros Focus pueden distinguir `bot_meta`/author sin cambiar ownership model.

---

## Failure model

| Fallo | Comportamiento |
|-------|----------------|
| Source/API 403 | Skip source; otras fuentes continúan; RawObs status=error |
| Normalize/parse fail | No insert offer; evidencia retenida si existe |
| Duplicate | No insert; métrica |
| Insert race UNIQUE | Tratar como duplicate |
| Moderación reject | Status rejected; Supply no publica |
| Pending stale 72h | auto_rejected_timeout + cooldown |
| Distribution fail | Fuera de Supply (C2); no retroacción a candidate boundary |

---

## Retention model

| Dato | Retención conceptual |
|------|----------------------|
| RawObservation | Corto-medio (p.ej. 30–90d raw); agregados/price memory más largos |
| offers pending | Hasta decisión o timeout 72h |
| offers approved/published | Lifecycle producto |
| rejected | Retener para cooldown/auditoría según políticas existentes |
| DealScore artifacts | Con offer provenance o 180d si se externalizan |

---

## Security

- P0-A `projectRefs` intacto.
- Fetches: allowlist + `fetchUrlSafety`; no SSRF por URL de usuario.
- Worker secrets ≠ app user JWT.
- Raw payload no se sirve público.
- Service role solo en paths server/cron existentes.
- Candidate no contiene secrets de affiliate beyond URL ya normalizada por paths actuales.

---

## Future evolution

Revisitar Option B **solo si** se cumple al menos uno, medido:

1. Necesidad de producto de **multi-candidate competition** (variantes/sellers) incompatible con UNIQUE actual.
2. Rescore batch de >N oportunidades/hora **sin** poder expresarlas como pending sin contaminar Focus.
3. Materialize rate deseada << discovery rate y el holding area no puede ser “suppress pre-insert” + RawObs.

Hasta entonces: **A + RawObservation + gates**.

---

## Final check

| Guardrail | Cumple |
|-----------|--------|
| No modifica P0-A | Sí |
| No modifica P0-B | Sí |
| No mezcla Distribution C2 | Sí |
| No Rewards / Economy / Attribution | Sí |
| No delivery Telegram | Sí |
| No nuevo scorer | Sí |
| No nueva queue | Sí |
| No nueva Moderación | Sí |
| No migración en S1 | Sí |

---

## Siguiente paso exacto (post-ADR)

**S2 (docs/contrato only hasta aprobación humana del ADR):** especificar `RawObservation` contract TypeScript + mapping a stores existentes (`bot_meta`, worker payload, `product_price_snapshots`) **sin DDL aplicado**, y definir el gate pre-insert “qué merecen `offers.pending`” usando DealScore/DQE/Verifier ya existentes.

No SourceAdapters nuevos. No `deal_candidates` DDL. No Production. No Distribution.
