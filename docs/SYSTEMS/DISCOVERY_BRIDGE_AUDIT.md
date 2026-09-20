# DISCOVERY_BRIDGE_AUDIT — BRIDGE-01

## Source real

- Autoridad de discovery ML: `workers/mercadolibre-worker` → ingest `ExternalWorkerCandidate` (`lib/bots/ingest/externalWorker.ts`).
- Contratos auxiliares: `discoverMercadoLibre.ts`, `mlApiLegacy.ts`, Hunter/Supply — **no** son el port de entrada del bridge.
- Output estable consumido: `ExternalWorkerCandidate` (url, title, discountPrice, originalPrice, canonicalUrl, cardDiscountSource, signals.*, pdpBlocked).

## Input type real

`MercadoLibreWorkerDiscoveryCandidate` — espejo estructural ACL (sin importar `lib/bots/ingest`, frontera Caza).

## Output esperado

`DealDiscoverySource` → `DealCandidateDraft` vía `createMercadoLibreWorkerDiscoverySource` / `mapMercadoLibreWorkerCandidateToDealDraft`.

## Campos reutilizables

| Campo | Origen | Destino Caza |
|---|---|---|
| product ID | `wid` / path `MLM*` / `/p/` / `/up/` | `externalProductId` + `mercadolibre_mx:pid:…` |
| URL | `canonicalUrl ?? url` | `url` normalizada por `identity.ts` |
| title | `title` | `title` |
| current price | `discountPrice` | `currentPrice` |
| reference | `originalPrice` (obligatorio) | `referencePrice` |
| currency | implícita MXN worker | `MXN` |
| provenance | `cardDiscountSource` + `signals.*` | `DealEvidence` (mapeo fail-closed) |
| sourceDetail | diagnóstico | no autoridad |

## Campos que requieren transformación

- Provenance → `DealEvidence` (badge_reconstructed → reject; card_strikethrough → moderate; pdp+source_explicit → strong).
- Identity: Aventa fingerprint `ml:` ≠ Caza `mercadolibre_mx:pid|url:` — transformación explícita, sin segunda identidad global.
- `discountPercent` worker: **no** autoridad; Caza recalcula claim vía `evidence.ts` / `price.ts`.

## Autoridades existentes (no tocar)

- `identity.ts`, `evidence.ts`, `price.ts`, `scoring.ts`, `affiliate.ts`, `AffiliateMappingResolver`, `CazaPipelineRunner`.

## Posibles duplicaciones (prohibidas)

- Nuevo scraper / HTTP / Playwright / price engine / affiliate generator / money path.

## Archivos que deben tocarse

- `lib/cazaOfertas/integrations/mercadoLibreWorkerBridge.ts` (+ index)
- `tests/cazaOfertas/mercadoLibreWorkerBridge.contract.test.ts`
- `scripts/caza-bridge-ml-canary.ts`
- export barrel `lib/cazaOfertas/index.ts` / `integrations/`

## Archivos que NO deben tocarse

- `CazaPipelineRunner` (sin cambios estructurales)
- `lib/rewards/`, `lib/economy/`, `lib/payout/`, settlement
- `vercel.json`, crons productivos
- workers/mercadolibre-worker (discovery authority)

## Riesgos

- `card_strikethrough` + seller/availability/category defaults → score ~64 → grade REJECT (&lt; 70). Monetización requiere evidencia PDP fuerte **o** mejora futura de señales de seller/categoría desde el worker (sin inventar).
- URL sin `wid`/MLM → identity `url:` (determinista).
- Sin mapping affiliate → discover/persist OK, publish monetizable NO.

## Diseño propuesto (implementado)

```
ExternalWorkerCandidate batch (ya descubierto)
  → ACL mapMercadoLibreWorkerCandidateToDealDraft
  → createMercadoLibreWorkerDiscoverySource (DealDiscoverySource)
  → CazaPipelineRunner (sin cambios)
  → AffiliateMappingResolver
  → Telegram outbox
```

Bounded: `MAX_DISCOVERY_PER_RUN` / page size; batch oversized → fail-closed vacío.
