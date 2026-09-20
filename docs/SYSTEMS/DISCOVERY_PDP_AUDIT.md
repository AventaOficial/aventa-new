# DISCOVERY_PDP_AUDIT — DISCOVERY-03

**Fecha:** 2026-09-20  
**Contexto:** BRIDGE-02 staging → 3/3 score 64 REJECT (`card_strikethrough` → moderate)  
**Alcance:** Solo auditoría. Sin implementación. Sin commit / push / deploy.

---

## VEREDICTO

### **BLOCKED**

No por falta de extractor PDP ni por pérdida en el bridge.

**Causa raíz:** el discovery existente **sí intenta PDP**, pero en el artefacto real usado por BRIDGE-02 (`scripts/_smoke-gate-v2-discovery.json`) el `qualityGate` reporta:

| Métrica | Valor |
|--------|------:|
| `pdpAttempts` | 12 |
| `pdpSuccess` | **0** |
| `pdpBlocked` | **12** |
| `pdpFailed` | 0 |
| candidatos con `cardDiscountSource=pdp` | **0 / 15 (0%)** |
| candidatos con `card_strikethrough` | **15 / 15 (100%)** |

Los 12 intentos PDP cayeron en **`account-verification`** (anti-bot / muro de login). Tras el bloqueo, el pipeline **cae a card-only de forma explícita** (no silenciosa) y acepta ingest con tachado de card.

Eso es coherente con **S5.5** (`docs/SYSTEMS/S55_REAL_ML_WORKER_DRY_RUN.md`): mismo patrón 12/12 PDP blocked.

La infraestructura de extracción PDP **ya existe** (`extractPdpEvidence.mjs` + `enrichCandidate`). Lo que **no** está disponible en este entorno de ejecución es HTML PDP real. Un cambio pequeño en Caza/bridge **no** produce evidencia strong. Desbloquear PDP de forma fiable puede requerir trabajo de sesión/anti-bot más allá de un parche localizado trivial → **BLOCKED** para el objetivo “PDP strong → GOOD_DEAL” hasta que `pdpSuccess > 0` con evidencia real.

---

## Respuestas exactas (1–12)

### 1. ¿El worker YA visita PDP?

**Sí.** En `discoverMercadoLibreCandidates` (`workers/mercadolibre-worker/src/ml.mjs`):

- Fase 1: cards (barato).
- Fase sticky (si hay seeds `group=sticky`): PDP directo.
- Fase 2–3: shortlist → `enrichCandidate(page, …)` → `page.goto` al producto → `extractMercadoLibrePdpEvidence(html)`.

### 2. ¿En qué condiciones?

- Mientras `qualityGate.pdpAttempts < pdpBudget`.
- `pdpBudget` = `pdpMax` explícito, o por defecto `min(maxItems, shortlist.length)`.
- Smoke: `SMOKE_PDP_MAX` default 6 (BRIDGE smoke file usó **12**).
- Worker prod: `WORKER_PDP_MAX` (opcional); si no, auto.
- Sticky Playwright en worker está **desaconsejado** en frío (`index.mjs`: sticky vía server API; PDP sticky frío → verification).

### 3. ¿Qué % del smoke obtiene PDP evidence?

**0%.**  
`cardDiscountSource=pdp`: 0/15.  
Telemetry: `pdpSuccess=0`, `pdpBlocked=12`.

### 4. ¿Qué hace que termine como `card_strikethrough` y no `pdp`?

1. Card tiene tachado real → `candidateFromCard` marca `cardDiscountSource='card_strikethrough'`.
2. PDP se intenta; si `enriched.blocked` / path `account-verification|login|registration|/gz/` → `pdpOk=false`, `pdpBlocked++`.
3. Si `!pdpOk` y hay tachado de card → se acepta con `evidenceSource='card_strikethrough'` (fallback consciente).
4. Solo si PDP aporta `originalPrice > discountPrice` se setea `cardDiscountSource='pdp'` + `originalPriceProvenance='source_explicit'`.

En el smoke: paso 2 falló siempre → todos salen como card.

### 5. ¿Existe fallback silencioso PDP → card?

**Fallback sí; silencioso no.**

- Log: `[worker] pdp_blocked=…`
- Telemetry: `qualityGate.pdpBlocked`
- Comentario en código: “Sin PDP: tachado de card puede seguir; badge solo no.”

**Hueco de señal:** el candidato aceptado por fallback **no** lleva `pdpBlocked: true` en el payload (en smoke: `undefined`). Solo el batch `discovery.qualityGate` lo refleja. Caza no distingue “PDP nunca intentado” vs “PDP bloqueado → card”.

### 6. ¿Hay timeout?

**Sí.**

| Sitio | Timeout |
|-------|---------|
| `page.goto` listing/PDP | 20_000 ms |
| `waitForSelector` precio/muro | 8_000 ms |
| waits fijos post-nav | ~400–1500 ms |
| smoke `page.setDefaultTimeout` | `SMOKE_TIMEOUT_MS` (default 45_000) |
| worker `WORKER_TIMEOUT_MS` | default 45_000 (page) |

Timeout de selector **no** inventa precio; continúa y clasifica blocked / no price.

### 7. ¿Hay bloqueo por concurrencia?

**No.** Un solo `page` Playwright; PDP es **secuencial** (no `Promise.all` de PDPs). El cuello no es race de concurrencia; es muro anti-bot por navegación.

### 8. ¿Existe límite de PDP por batch?

**Sí — `pdpBudget` / `pdpMax`.**

- Smoke file: `pdpBudget=12`, `shortlistSize=16`, `maxItems=15`.
- Tras agotar budget, el resto de shortlist solo puede entrar si ya es sticky-PDP o si tiene card tachado elegible **sin** nuevo PDP.

### 9. ¿El smoke omite PDP a propósito?

**No.** Smoke pasa `pdpMax: SMOKE.pdpMax` y en el artefacto BRIDGE-02 se intentaron 12 PDPs. No es un modo “card-only”.

### 10. ¿Se extrae PDP y se pierde en worker → ingest → ExternalWorkerCandidate?

**No en este run.** No hubo PDP success que perder.

Cuando sí hay éxito, el worker setea `cardDiscountSource='pdp'` y signals `source_explicit`; `toParsedMeta` / `preserveMachinePriceProvenance` **conservan** `cardDiscountSource` machine (no se inventa ni se downgradea desde client).

**Sub-caso de sub-etiquetado** (si PDP current OK pero sin original PDP, y card tenía tachado):

```text
working.cardDiscountSource permanece 'card_strikethrough'
evidenceSource = 'pdp'  (campo interno, se borra antes del payload)
signals.currentPriceProvenance = 'source_explicit'
```

El payload hacia Aventa puede seguir diciendo `card_strikethrough` aunque el current vino de PDP. Eso **sub-etiqueta** frente a Caza (moderate, no strong). Hoy es irrelevante mientras `pdpSuccess=0`.

### 11. ¿Qué necesita Caza para evidence strong/verified?

En `mapEvidenceFromProvenance` (`lib/cazaOfertas/integrations/mercadoLibreWorkerBridge.ts`):

```text
cardDiscountSource === 'pdp'
AND originalPriceProvenance ∈ { source_explicit, listing_card }
→ evidenceQuality: strong
→ priceConfidence: verified
→ historicalConfidence: store_reference_price
```

Con seller/availability/category defaults del bridge, eso ≈ **score 75 → GOOD_DEAL**.

`card_strikethrough` solo → moderate/reported → ≈ **64 → REJECT**.

### 12. ¿Se puede producir sin scraping adicional?

**Sí, en diseño:** mismo Playwright + `extractPdpEvidence` + pipeline V2.  
**No, en la práctica actual:** 0 HTML PDP usable por `account-verification`.  
No hace falta segundo scraper; hace falta que la visita PDP existente **deje de bloquearse** (o una fuente PDP ya existente fuera de Playwright worker — p.ej. sticky server API — si se demuestra que entrega los mismos campos sin inventar).

---

## 1. CURRENT FLOW

```text
seeds (ofertas_hub, lightning, …)
  → warmMercadoLibreSession (/ofertas)
  → Fase 1: extractCards → candidateFromCard
       (card_strikethrough | badge_reconstructed)
  → shortlist (score nominal + bonus tachado)
  → Fase 2: enrichCandidate (goto PDP) [hasta pdpBudget]
       → extractMercadoLibrePdpEvidence(html)
       → blocked? → pdpBlocked++ / pdpOk=false
       → success + original? → cardDiscountSource=pdp + source_explicit
       → success sin original + card tachado? → conserva card_strikethrough
  → gate workerCandidateEligibleForIngest
  → ExternalWorkerCandidate[] (+ discovery.qualityGate)
  → (opcional) POST ingest → preserveMachinePriceProvenance
  → Caza bridge → DealEvidence → score
```

---

## 2. PDP EXTRACTION EXISTENTE

| Pieza | Path | Rol |
|-------|------|-----|
| Extractor HTML | `workers/mercadolibre-worker/src/extractPdpEvidence.mjs` | structured meta → JSON-LD → DOM `ui-pdp-price`; detecta blocked |
| Nav + wrap | `ml.mjs` → `enrichCandidate` | goto + wait + HTML + fields |
| Fixtures unit | `scripts/dry-run-pdp-fixtures.mjs` | prueba extractor **sin red** |
| Orquestación | `discoverMercadoLibreCandidates` | budget + fallback + payload |

El extractor **funciona** sobre HTML PDP real/fixture. El fallo observado es **acceso** (redirect a verification), no regex ausente.

---

## 3. CARD-ONLY FALLBACK

Condiciones (`ml.mjs` ~1040–1051):

- `!pdpOk`
- y `cardDiscountSource === 'card_strikethrough'` con original > current
- → acepta ingest con evidencia card
- badge-only sin PDP → **reject** (`badge_nominal_insufficient`)

Diseño consciente: supply Aventa puede vivir de card; **Caza publish** exige más.

---

## 4. DATA LOSS POINTS

| Punto | ¿Pérdida? | Notas |
|-------|-----------|--------|
| PDP blocked → no fields | N/A | No había datos PDP |
| `evidenceSource` borrado del payload | Intencional | Campo interno shortlist |
| `pdpBlocked` no en candidate | **Sí (señal)** | Telemetry solo en `discovery.qualityGate` |
| PDP current + original de card | **Sub-etiqueta** | Puede quedar `card_strikethrough` en payload |
| ingest `preserveMachinePriceProvenance` | No downgrade machine | No inventa upgrade |
| Bridge Caza | No inventa strong | Mapea card → moderate |

**Conclusión:** BRIDGE-02 no “perdió” PDP en el bridge; el discovery **nunca emitió** `cardDiscountSource=pdp`.

---

## 5. LIMITS / TIMEOUTS

| Control | Origen | Smoke BRIDGE-02 |
|---------|--------|-----------------|
| `maxItems` | SMOKE_MAX_ITEMS / WORKER_MAX_ITEMS | 15 |
| `perSeedMax` | SMOKE_PER_SEED_MAX / WORKER_MAX_PER_SEED | 8 |
| `shortlistMax` | SMOKE_SHORTLIST_MAX | 20 (size real 16) |
| `pdpMax` / budget | SMOKE_PDP_MAX / WORKER_PDP_MAX | 12 |
| `minDiscountPercent` | 18 | 18 |
| goto / selector | 20s / 8s | — |

---

## 6. FLAGS

| Flag | Efecto |
|------|--------|
| `SMOKE_PDP_MAX` / `WORKER_PDP_MAX` | Cupo PDP |
| `WORKER_DISCOVERY_ONLY` / `--dry-run` | Sin POST |
| `SMOKE_*` caps | Smoke READ-ONLY |
| Sticky seeds Playwright | Evitados en worker boot si hay endpoint server; comentario anti-verification |
| `pdpBlocked` en candidate | Tipo existe en ingest; **no poblado** en fallback del smoke |

---

## 7. EVIDENCE CONTRACT (Caza)

| Worker `cardDiscountSource` | Provenance original | Bridge → DealEvidence | Score típico* |
|----------------------------|---------------------|----------------------|---------------|
| `pdp` | `source_explicit` / `listing_card` | strong / verified / store_reference | ~75 GOOD_DEAL |
| `card_strikethrough` | `listing_card` | moderate / reported / store_reference | ~64 REJECT |
| `badge_reconstructed` | — | reject bridge | — |

\*Con defaults bridge: seller `unknown`, availability `unknown`, category `other`, promotion true.

Autoridades a **no** tocar para “arreglar” esto: `scoring.ts` thresholds, inventar evidence, money path.

---

## 8. GAP ANALYSIS

```text
[EXISTE] Extractor PDP + enrichCandidate + labels pdp/source_explicit
[EXISTE] Fallback card documentado + gate badge-only
[EXISTE] Bridge ACL fail-closed
[FALLA]  Acceso PDP en runtime: 100% account-verification (smoke = S5.5)
[GAP]    Candidate no propaga pdpBlocked=true en fallback
[GAP]    Posible sub-etiqueta si PDP current sin original PDP
[NO GAP] Pérdida en ingest/bridge del run BRIDGE-02
```

Gap que bloquea publicación Caza: **`pdpSuccess == 0`**, no el score umbral en abstracto.

---

## 9. MINIMAL ARCHITECTURAL FIX (solo diseño — NO implementar aún)

Orden recomendado (sin bajar thresholds Caza, sin scraper nuevo):

1. **DISCOVERY-04 — Session / anti-bot (worker-local)**  
   Medir y reducir `pdpBlocked` con la infra Playwright existente (warm más robusto, pacing, persistencia de storage state, menos PDPs seguidos, retry 1× solo si no verification). Éxito = `pdpSuccess ≥ 1` en smoke con `cardDiscountSource=pdp` real.

2. **Señalización**  
   En fallback card tras blocked: setear `pdpBlocked: true` en `ExternalWorkerCandidate` para ops/Caza (observabilidad; no inventa strong).

3. **Etiquetado honesto post-PDP** (solo si success parcial)  
   Si current es PDP-verified y original es tachado de card: documentar/contractualizar label (p.ej. `pdp` + `originalPriceProvenance=listing_card`) **sin inventar original**.

4. **Re-canary BRIDGE-02**  
   Solo cuando el smoke tenga ≥1 candidato `pdp` + `source_explicit` reales.

Si (1) no logra `pdpSuccess > 0` sin infra nueva (proxies / browser farm / etc.) → permanece **BLOCKED** y se evalúa fuente server sticky ya existente — sin segundo scraper DOM.

---

## 10. FILES THAT WOULD CHANGE (futuro, si se desbloquea)

- `workers/mercadolibre-worker/src/ml.mjs` (sesión, pacing, `pdpBlocked` en payload, etiquetado post-PDP)
- Posible: `workers/mercadolibre-worker/src/index.mjs` (flags de sesión)
- Tests/smoke reports; re-run `smoke-gate-v2-discovery.mjs`
- Opcional observabilidad bridge: leer `pdpBlocked` (sin relajar evidence)

---

## 11. FILES THAT MUST NOT CHANGE

- `lib/cazaOfertas/scoring.ts` / thresholds  
- `lib/cazaOfertas/evidence.ts` (inventar historial)  
- Bridge para fabricar strong desde card  
- Affiliate / rewards / economy / payout / settlement  
- `vercel.json`, crons, deploy  
- Nuevo Playwright crawler / HTTP client / segundo `extractPdp*`  

---

## 12. EXPECTED IMPACT (si PDP real vuelve)

| Antes (card) | Después (pdp + source_explicit) |
|--------------|----------------------------------|
| score ~64 REJECT | score ~75 GOOD_DEAL |
| prepared/published 0 | elegible a PREPARE/PUBLISH si mapping FOUND |
| BRIDGE-02 honest fail-closed | canary staging con Telegram posible sin inventar |

---

## 13. RISKS

- Tratar “bajar threshold” como fix → publica evidencia débil (prohibido).  
- Inventar `pdp` / `source_explicit` en fixture → fraude de contrato.  
- Anti-bot arms race: cambios de sesión pueden ser frágiles.  
- Aumentar `pdpMax` sin bajar block rate → más verification, mismo 0% success.  
- Confundir sticky server API con evidencia Caza sin mapear provenance con rigor.

---

## 14. RECOMMENDED NEXT STEP

1. **No tocar Caza scoring ni bridge evidence grades.**  
2. Abrir **DISCOVERY-04**: experimento acotado en worker para bajar `pdpBlocked` y demostrar ≥1 candidato real con `cardDiscountSource=pdp` + `originalPriceProvenance=source_explicit` en un nuevo `_smoke-gate-v2-discovery.json`.  
3. Si eso falla sin infra nueva → mantener **BLOCKED** y documentar alternativas de fuente ya existentes (sticky server), no Caza.  
4. Solo entonces re-ejecutar BRIDGE-02 staging.

---

## Evidencia de archivo (BRIDGE-02 input)

`scripts/_smoke-gate-v2-discovery.json` → `discovery.qualityGate`:

```json
{
  "pdpAttempts": 12,
  "pdpSuccess": 0,
  "pdpBlocked": 12,
  "pdpFailed": 0,
  "acceptedForIngest": 15
}
```

`sourceDetail` de candidatos: `worker:playwright:card|seed:…` (no `…:pdp|…`).

---

## Clasificación final

| Dimensión | Estado |
|-----------|--------|
| Extractor PDP en repo | Existe |
| Pipeline labels → ExternalWorkerCandidate | Existe |
| Pérdida en ingest/bridge (este run) | No |
| Acceso runtime a HTML PDP | **Fallido 100% (account-verification)** |
| ¿Caza puede publicar con solo card? | No (by design) |

### **BLOCKED**

Infraestructura de extracción: suficiente.  
Fuente PDP efectiva en el entorno actual: **insuficiente**.  
Siguiente trabajo: desbloquear PDP con herramientas existentes o declarar bloqueo operativo — **no** implementar todavía.
