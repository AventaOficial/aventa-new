# CAZAOFERTASSS — FASE 3.2 (TRACKING & ATTRIBUTION READINESS)

Estado: **readiness** — sin adapters Amazon/ML, sin parsers CSV/XLSX, sin scraping,
sin cron, sin DDL production, sin deploy.

Contexto: FASE 3.1 confirmó que Mercado Libre Afiliados **no** expone API/CSV/webhook
público documentado. Esta fase prepara la cadena de reconciliación para cuando
exista una fuente oficial.

## Objetivo

```
publication
  → TrackingIdentity / trackingLabel
  → affiliate link (marcadores de red)
  → provider report (futuro)
  → revenue event (ledger FASE 3)
  → AttributionCandidate
  → métricas derivadas (nullable)
```

## Arquitectura

| Capa | Archivo | Autoridad |
|------|---------|-----------|
| TrackingIdentity | `tracking/identity.ts` | Identidad determinista pub↔label |
| Registry | `tracking/registry.ts` | Resolve `trackingLabel → identities` |
| AttributionCandidate | `tracking/attributionCandidate.ts` | KNOWN/UNKNOWN/AMBIGUOUS/CONFLICT |
| Publication metrics | `tracking/publication.ts` + `tracking/metrics.ts` | Nullable; derivadas del ledger |
| Provider report port | `revenue/providerReport.ts` | Contrato Raw→normalized→attribution |
| Manual import readiness | `revenue/manualImport.ts` | Envelope CSV/XLSX/JSON/API sin parser |

Provider-specific logic **fuera** del dominio hasta documentación oficial.

## Tracking model

`TrackingIdentity`:

- provider
- trackingLabel
- publicationId
- publicationRevision
- channel
- campaign
- experiment? (opcional)
- identityKey determinista

Invariantes:

- Una publication puede tener **múltiples** observations (labels/campañas).
- Un tracking label pertenece a una campaña (campo `campaign`).
- Replay de la misma `identityKey` ⇒ duplicate, no mutación.
- Título / producto / tiempo **no** son identidad.

## Attribution model

| Status | Significado |
|--------|-------------|
| KNOWN | Exactamente una publication para el label (o varias observations de la misma pub) |
| UNKNOWN | Sin label, o label no registrado |
| AMBIGUOUS | Mismo label ligado a ≥2 publicationIds distintos |
| CONFLICT | Prior attribution de `providerExternalReference` ≠ publication resuelta por tracking |

Nunca inferir KNOWN por proximidad temporal o producto.

## Metrics

Campos nullable: clicks, orders, approvedOrders, units, grossSales, commission,
approvedCommission, cancelledCommission.

- UNKNOWN ⇒ **null**, nunca 0.
- Derivadas desde ledger + attributions ATTRIBUTED.
- No mutan publication history ni el ledger (append-only).

## Provider / manual import

- `RawProviderRevenueRecord` ≡ contrato FASE 3 `RawRevenueRecord`.
- `ProviderReportReconciliationPort` stub fail-closed.
- `ManualImportSourcePort` acepta formatos declarados; parser no registrado ⇒ reject.
- Registrar un formato (`acknowledgeManualImportFormatSupport`) **no** implementa el parser.

## Qué falta para activar un provider

1. Schema oficial del reporte (FASE 3.1 blockers).
2. Parser que proyecte a `RawProviderRevenueRecord`.
3. Adapter bajo `revenue/providers/<name>/` (fuera del core).
4. Canary staging + credenciales env-only.

## Relación con FASE 3

Ledger, ingest, attribution append-only y reconcile **permanecen**.  
FASE 3.2 añade el índice de tracking y candidatos de atribución más ricos
(AMBIGUOUS/CONFLICT) sin cambiar la semántica append-only del money path Caza.
