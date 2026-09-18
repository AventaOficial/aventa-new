# FINAL REPORT — ECONOMY ARCHITECTURE COMPATIBILITY AUDIT

**Fecha:** 2026-09-16  
**Modo:** Architectural audit only. **Sin código, migraciones, tablas, deploy ni money writes.**  
**Clasificación de evidencia:** CONFIRMED (código/migraciones) · DERIVED · UNKNOWN · UNSUPPORTED

---

## 1. Executive Result

Aventa **ya tiene** una Economy Foundation compatible *en forma* con un modelo tipo cashback marketplace (pending ≠ confirmed ≠ reward ≠ withdrawal), pero **no está lista para money path**.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Conservar foundation 20260916? | **SÍ** |
| ¿Activar settlement ahora? | **NO** |
| ¿Bloqueo #1 money? | **Sin evidencia económica oficial cableada** (Amazon export desconocido; ML NOT_CONNECTED) |
| ¿Bloqueo #2 money? | **Join click_id ↔ conversión provider no es 1:1 confiable** (Amazon Tracking ID agregado; ML sin sub-id) |
| ¿Double-entry ahora? | **UNJUSTIFIED** |
| ¿Shadow 30–60 días sin pagar? | **Diseñable** sobre foundation actual + adapters fail-closed → observations |

**Veredicto:** la arquitectura correcta es **observation + revision + reconciliation primero**; liquidación a ledger/rewards solo después de shadow match rates aceptables y evidencia Amazon real.

---

## 2. Current Architecture

### CURRENT SYSTEM (CONFIRMED)

```
[Click LIVE]
  user → POST /api/track-outbound
    → offer_events (volumen SoT)
    → reward_outbound_clicks (click_id SoT attribution)

[Economy Foundation — no settlement]
  affiliate_conversions
  affiliate_commissions (ledger_entry_id = null by design)
  affiliate_economic_events (append-only)
  affiliate_commission_revisions (append-only amount history)
  affiliate_reconciliation_runs / findings

[Legacy / parallel money path — gated OFF]
  affiliate_ledger_entries (mutable row SoT for manual/CSV)
  creator_rewards / reward_payouts / ledger_settlements
  commission_pools / commission_allocations
```

**Boundary:** `ECONOMIC_LEDGER_BOUNDARY.settlementEnabled = false` (`lib/economy/types.ts`).  
**Adapters:** registry vacío → `notConnectedAdapter`. ML provider `economicIngestAllowed: false`.

### CURRENT SOURCE OF TRUTH

| Dominio | SoT | Notas |
|---------|-----|-------|
| Click volume | `offer_events` outbound | No mezclar con clicks |
| Click attribution | `reward_outbound_clicks` | |
| Network conversion/commission | `affiliate_*` cuando se ingeste | Hoy sin ingest live |
| Effective commission $ | **DERIVED** `effectiveCommission()` | gross + revisions |
| Platform booked revenue (ops) | `affiliate_ledger_entries` | Mutable; path legacy |
| Creator balance | Filas `creator_rewards` | No double-entry |
| Estimated EPC×clicks | **DERIVED** owner estimates | ≠ confirmed |

### CURRENT STATE MACHINE (foundation)

Conversions: `received → pending → confirmed|rejected`; `confirmed → reversed`  
Commissions: `reported → pending → approved|rejected`; `approved → reversed`  
Attribution on conversion: `attributed|unattributed|unresolved`  
Revisions: `recorded → superseded|reversed`; kinds delta/replacement  

### CURRENT MONEY BOUNDARY

Foundation **no** escribe ledger/rewards/payouts.  
Rewards/pools requieren `REWARDS_PROGRAM_ACTIVE` / `COMMISSION_PROGRAM_ACTIVE` + `MONEY_PATH_FROZEN` unfrozen. Defaults: **OFF / frozen**.

---

## 3. Current State Machine (target vs Aventa)

| Estado deseado | ¿Existe? | Dónde | Quién | Append-only? | Reversible? | Money write? | Provider evidence? |
|----------------|----------|-------|-------|--------------|-------------|--------------|-------------------|
| CLICKED | Sí | `reward_outbound_clicks` | track-outbound | Insert | N/A | No | No |
| ATTRIBUTED (click) | Sí | click row + meta | server | Insert | N/A | No | No |
| CONVERSION_DETECTED | Sí schema | `affiliate_conversions` | ingest (no live) | + events | vía status | No (boundary) | **Required** |
| COMMISSION_PENDING | Sí | commission `pending`/`reported` | ingest | + events | sí | No | **Required** |
| COMMISSION_CONFIRMED | Sí | `approved` | ingest/status | + events | → reversed | No | **Required** |
| REWARD_ELIGIBLE | Parcial | rewards engine (OFF) | processLedger | — | — | **Would** | Needs attributed commission |
| REWARD_AVAILABLE | Sí schema | `creator_rewards.AVAILABLE` | holds cron | mutable | clawback | **Would** | — |
| WITHDRAWAL / PAID | Sí schema | `reward_payouts` | admin SPEI | — | clawback path | **Would** | — |
| REJECTED / CANCELLED | Sí | conversion/commission/rewards | ingest/admin | events / status | — | No / void | Prefer provider |
| REFUNDED / PARTIAL | Parcial | via **revisions** not named refund | revision ingest | append | sí | No | **Required** |
| REVERSED | Sí | status + revision kind | ingest | append | history kept | No in foundation | **Required** |
| ADJUSTED | Sí | revision kinds | ingest | append | sí | No | **Required** |
| DUPLICATE / ORPHAN / UNRESOLVED | Sí findings + attribution_status | recon / conversion | recon job | findings | ack/resolve | No | Compare sets |

**Hueco semántico:** no hay estados explícitos `REWARD_ELIGIBLE` en foundation; el puente commission→reward está **deliberadamente cortado**.

---

## 4. Economic Boundaries

| Concepto | ¿Separado? | Dónde |
|----------|------------|-------|
| 1. order value | Sí | `order_amount_cents` on conversion |
| 2. qualifying value | **Parcial / UNKNOWN** | no columna dedicada; puede vivir en `raw_reference` |
| 3. estimated commission | **Mezcla riesgo** | owner `estimatedEconomy` / EPC — no en foundation |
| 4. confirmed commission | Sí | `affiliate_commissions` + effective() |
| 5. platform share | Legacy | pools / ledger — no foundation |
| 6. user reward | Separado | `creator_rewards` (path OFF) |
| 7. pending user liability | Sí schema | VALIDATING/PENDING rewards |
| 8. available balance | Derived sum | AVAILABLE rewards |
| 9. withdrawn | Sí | PAID + payouts |
| 10. actual cash received | **Parcial** | ledger `paid` / external_ref — manual SoT |

**Mezcla peligrosa a documentar (no arreglar ahora):**  
`affiliate_ledger_entries` actúa como “truth contable de import” **y** input a rewards — distinto del foundation `affiliate_commissions`. Dos mundos.

---

## 5. Attribution Audit

```
user → session(JWT) → click_id → tagged URL → [provider] → conversion
```

| Join | Clasificación |
|------|----------------|
| user ↔ click_id | **EXACT** (si autenticado) |
| click_id ↔ tagged link | **EXACT** (Aventa construye URL) |
| Amazon `?tag=` Tracking ID ↔ click_id | **UNSUPPORTED** 1:1 (agregado por canal) |
| Amazon `ascsubtag` ↔ click_id | **PROBABLE** si reporte lo devuelve; **UNSUPPORTED** como política Associates (research: no end-user subtag) |
| ML `tag`/`matt_*` ↔ click_id | **UNSUPPORTED** (adapter no inyecta sub-id; `supportsSubId: false`) |
| ML tag ↔ creator profile | **PROBABLE** (legacy CSV) — no es click-level |
| click_id ↔ conversion row | **EXACT** solo si ingest setea `click_id` FK; hoy **UNSUPPORTED** live |

**No asumir join 1:1 provider↔click.** Diseño correcto: `attribution_status` ∈ {attributed, unattributed, unresolved}.

---

## 6. Amazon Compatibility

| Capacidad futura | Estado |
|------------------|--------|
| Consumir Orders/Earnings export | **UNKNOWN** schema exacto (sin archivo real en repo) |
| Adapter report → normalized events | **BLOCKED** hasta harvest real |
| Stable `external_conversion_id` / commission id | **UNKNOWN** |
| Dedupe `(source,network,external_*)` | **CONFIRMED** unique en schema |
| Revisions / reversals | **CONFIRMED** schema; semantics Amazon **UNKNOWN** |
| Reconciliation vs expected | **CONFIRMED** finding types; inputs **BLOCKED** |
| Creators API as commission truth | **UNSUPPORTED** (política Aventa) |

**Futuro adapter necesita (sin implementar):** raw blob → schema validate → external IDs → dedupe → normalize conversion/commission → revision on delta → recon.  
Dependencias: raw export **UNKNOWN**; política subtag **CONFIRMED conflict** con Rewards adapter actual.

---

## 7. Mercado Libre Compatibility

| Requisito | Estado |
|-----------|--------|
| Permanecer NOT_CONNECTED | **CONFIRMED** |
| No seller orders as affiliate truth | **CONFIRMED** (refuse) |
| No inventar conversions | **CONFIRMED** fail-closed |
| Economic ingest | **UNSUPPORTED** by official affiliate API (per research/capability matrix) |

Arquitectura actual **puede** quedarse NOT_CONNECTED sin contaminar foundation (registry vacío + provider refuse).

---

## 8. LetyShops Invariants (comportamiento público observable)

*Referencia solo de UX/reglas públicas — **no** asume backend interno.*

| Invariante | Aventa |
|------------|--------|
| pending ≠ available | **Sí** (rewards statuses) / foundation pending≠approved |
| estimated ≠ confirmed | **Parcial** (estimates separados; riesgo de UI confusión) |
| order ≠ commission | **Sí** (tablas distintas) |
| commission ≠ reward | **Sí** (boundary + tablas) |
| reward ≠ withdrawal | **Sí** (rewards vs payouts) |
| reversal preserves history | **Sí** foundation (events + revisions); ledger path **Parcial** (status mutate) |
| refunds affect economics | **Parcial** (revisions; no estado “refunded” nombrado) |
| confirmation delayed | **Sí** (pending states) |
| merchant/network = economic authority | **Sí** (diseño); **No** operativo hasta provider connected |

---

## 9. Ledger Audit

| Pregunta | Dictamen |
|----------|----------|
| ¿`affiliate_ledger_entries` append-only? | **No** (mutable status) |
| ¿Foundation events/revisions append-only? | **Sí** |
| ¿Balances materializados SoT? | **No** (sumas derivadas) |
| ¿Double-entry necesario ahora? | **UNJUSTIFIED** |
| ¿Antes de money? | **FUTURE** opcional; no bloquea shadow |
| Evolución correcta | Observation foundation = SoT de red; ledger platform solo para cash booked **después** de confirm; rewards derivados de commission atribuida + política |

**NECESSARY BEFORE MONEY:** bridge explícito commission(approved+attributed) → reward con idempotencia — **no** double-entry completo.  
**NECESSARY NOW:** nada de ledger write.

---

## 10. Reconciliation Audit

Finding types **CONFIRMED** en código:

`MATCHED | MISSING_INTERNAL | MISSING_EXTERNAL | AMOUNT_MISMATCH | STATUS_MISMATCH | CURRENCY_MISMATCH | DUPLICATE | ORPHAN`

Puede comparar expected vs observed **sin money writes** — **CONFIRMED**.  
Falta: sets “provider observed” reales (Amazon) y definición de expected (clicks? attributed only?).

Mapeo a lenguaje pedido:

| Pedido | Equivalente Aventa |
|--------|-------------------|
| MISSING_CONVERSION | MISSING_INTERNAL / EXTERNAL (entity_kind=conversion) |
| MISSING_COMMISSION | idem commission |
| REVERSED | status + revision; finding STATUS/AMOUNT |

---

## 11. Shadow Economy Design (conceptual)

```
REAL CLICK (LIVE)
  → REAL ATTRIBUTION (click_id)
  → PROVIDER OBSERVATION (Amazon report / ML if ever)
  → SHADOW conversion row (source=csv_import|api)
  → SHADOW commission + revisions
  → SHADOW reward projection (computed, NOT written to creator_rewards)
  → RECONCILIATION findings only
```

**30–60 días sin pagar:** settlementEnabled=false; no payout RPCs; shadow reward = métrica en summary jsonb / findings.

**Métricas:**

- attribution match rate (click_id filled / conversions)
- conversion match rate (provider vs internal)
- commission error (amount mismatch rate)
- reversal rate
- pending duration (occurred_at → confirmed)
- reconciliation mismatch rate
- duplicate / orphan rate
- estimated_reward_shadow vs confirmed_commission_share

---

## 12. Gap Matrix

| Capability | Current Aventa | Amazon | ML | Required Before Money |
|------------|----------------|--------|-----|------------------------|
| Click identity | GREEN | — | — | GREEN |
| Link tagging | GREEN | GREEN (tag) | GREEN (tag/matt) | GREEN |
| Click↔conversion join | YELLOW | YELLOW/RED (subtag policy) | RED | YELLOW→policy |
| Conversion ingest | YELLOW (schema, no live) | UNKNOWN (export) | RED NOT_CONNECTED | GREEN ingest |
| Commission + revision | GREEN schema | UNKNOWN semantics | RED | GREEN |
| Reconciliation | GREEN engine | BLOCKED inputs | N/A | GREEN with data |
| Settlement bridge | RED OFF | — | — | YELLOW design |
| Rewards/payouts | YELLOW schema OFF | — | — | GREEN after shadow |
| Provider authority | fail-closed GREEN | UNKNOWN file | RED OK | Amazon evidence |
| Fraud/dedupe uniques | GREEN | UNKNOWN | — | GREEN |

---

## 13. Security / Fraud

**CONFIRMED:** uniques externos; RLS service_role on foundation; IP/UA hash on clicks; money freeze; no public economic ingest API.

**Gaps:** economic_events sin FK; ledger grants legacy UNKNOWN; estimated revenue en CEO no marcado siempre como non-settlement en UI (riesgo de confusión ops).

---

## 14. Money Safety

| Control | Estado |
|---------|--------|
| settlement | OFF |
| rewards program | OFF default |
| commission program | OFF default |
| money path freeze | frozen default prod |
| SUPPLY WRITE | OFF unless explicit |
| DI settlement | OFF |
| Foundation → ledger | null ledger_entry_id |

**Esta auditoría no escribe dinero.**

---

## 15. What NOT to Build

1. Seller ML API as affiliate truth  
2. Creators API as commission SoT  
3. Auto-settle from Amazon rows alone  
4. Double-entry ledger ahora  
5. Nueva tabla GOLDEN/economy “v2” paralela  
6. Inventar ML economic API  
7. Activar rewards/payouts/settlement  
8. Tratar estimated EPC como confirmed commission  
9. Asumir arquitectura interna LetyShops  

---

## 16. Remaining Unknowns

1. Schema real Orders/Earnings Amazon Associates MX (archivo de esta cuenta)  
2. Stable external IDs y columnas de reversal en ese export  
3. Si `ascsubtag` aparece en reportes y es usable bajo ToS  
4. Qualifying value vs order value en reportes  
5. Migraciones 20260916 aplicadas en prod DB  
6. Grants runtime de `affiliate_ledger_entries`  

---

## 17. Exact Next P0

**P0 — Amazon Associates Evidence Capture (read-only, no parser, no ingest)**

Acción única verificable:

1. Desde la cuenta Amazon Associates MX de Aventa, descargar **un** Orders report y **un** Earnings report del periodo reciente (CSV/XLSX/TXT — el formato que el portal ofrezca).  
2. Guardarlos **fuera del repo público** (o en vault ops) y registrar en `docs/SYSTEMS/AMAZON_EVIDENCE_HARVEST.md` únicamente:  
   - nombre de archivo / formato  
   - lista de **nombres de columnas** (sin PII de compradores)  
   - si aparece Tracking ID, subtag/ascsubtag, order id, commission, status, return/reversal  
3. Clasificar cada campo: usable para `external_*_id` / status / amount / **UNKNOWN**.

**Éxito:** deja de ser UNKNOWN el schema; desbloquea diseño del adapter sin money.  
**No hacer en ese P0:** parser, insert a `affiliate_*`, settlement, rewards.

---

## 18. STOP

Auditoría completa. Sin implementación.  
Conservar foundation; shadow antes que money; evidencia Amazon es el cuello de botella informativo.
