# CAZAOFERTASSS — FASE 3 (AFFILIATE REVENUE INGESTION & RECONCILIATION)

Estado: **contrato provider-neutral + ledger append-only + atribución separada.**

Sin adapters reales Amazon/ML. Sin scraping. Sin cron. Sin producción.
Sin money path de Aventa.

Checkpoint base: `ce6365c` (FASE 0–2.1).

## Arquitectura

```
AffiliateRevenueSource          (port; stubs oficiales unsupported)
        ↓
RawRevenueRecord                (campos neutrales; payload opaco aparte)
        ↓
NormalizedRevenueEvent          (normalize.ts)
        ↓
Validation                      (validate.ts — reglas financieras)
        ↓
Identity / idempotency          (provider + externalReference + eventType)
        ↓
FinancialRevenueEvent           (ledger append-only — caza_revenue_events)
        ↓
Attribution (capa SEPARADA)     (caza_revenue_attributions)
        ↓
Reconciliation (derivada)       (reconcile.ts)
        ↓
Revenue metrics (derivadas)     (metrics.ts)
```

### Autoridad por capa

| Capa | Autoridad | Source-of-truth? |
|------|-----------|------------------|
| Source port | Cómo llega un lote; **no** interpreta CSV/API no documentados | no |
| Raw | Hecho reportado proyectado a contrato neutral | sí (auditoría de import) |
| Normalized | Tipado/moneda canónica MXN | no (proyección) |
| Validation | ¿el hecho es admisible al ledger? | no |
| Ledger financiero | Hechos económicos inmutables | **sí** |
| Attribution | ¿se conoce publication/deal? | **sí** (decisiones; UNKNOWN válido) |
| Reconciliation / metrics | Vistas derivadas recalculables | no |

## Idempotencia

```
eventId = provider + ":" + eventType + ":" + externalReference
```

Duplicado lógico ⇒ `append` retorna `{ duplicate: true }` sin mutar la fila.

**pending → approved:** nuevos eventos de **tipos distintos** (`ORDER` → `APPROVED_ORDER`), nunca UPDATE de status. Un único `COMMISSION` por `externalReference` (first-write-wins si el proveedor reenvía el mismo id con otro status).

## Reversals / cancellations

- `REVERSAL` / `CANCELLATION` = **nuevos** eventos compensatorios.
- Exigen `reversesEventId` / `reversesExternalReference`.
- Prohibido UPDATE/DELETE del hecho original (triggers SQL + contrato InMemory).

## Atribución a Telegram (posterior)

Cadena diseñada:

```
publicationIdentityKey
  → trackingLabel (embebido en affiliate URL)
  → aparece en reporte oficial del proveedor (cuando exista adapter)
  → RawRevenueRecord.trackingIdentifier
  → RevenueAttributionRecord → publicationId
```

Si el reporte no trae tracking, o no hay publicación con ese label ⇒ **UNKNOWN** / **UNMATCHED_TRACKING**. Nunca se inventa.

## Qué NO se conoce aún (sin reportes reales)

- Columnas exactas de exports Amazon Associates MX
- Columnas exactas de Mercado Libre Afiliados
- Endpoints oficiales de descarga automatizada
- Semántica exacta de IDs de comisión vs orden en cada red
- Latencia / ventanas de pending→approved por proveedor

## Qué falta para activar Amazon

1. Documentación oficial del formato de reporte (o API) confirmada.
2. Adapter `AffiliateRevenueSource` que mapee **ese** formato → `RawRevenueRecord`.
3. Credenciales staging (`CAZAOFERTAS_AMAZON_*`) por env var name only.
4. Canary de import staging + reconciliación sample.
5. Gate explícito; sin cron productivo hasta entonces.

## Qué falta para activar Mercado Libre

Igual que Amazon, con formato/credenciales ML Affilliates documentados.
`programmaticLinkGenerationAvailable` sigue `false` hasta evidencia oficial.

## Schema (caza_* only)

Migración: `docs/supabase-migrations/20260919_cazaofertas_revenue_ingestion.sql`

- Extiende `caza_revenue_events` (CANCELLATION, gross_amount, batch, product_*)
- `caza_revenue_import_batches`
- `caza_revenue_raw_records`
- `caza_revenue_attributions`

RLS enable + REVOKE anon/authenticated; GRANT service_role. Append-only triggers.

## Invariantes

1. Append-only en ledger, raw, batches, attributions.
2. Idempotencia `provider+externalReference+eventType`.
3. Attribution UNKNOWN no se “arregla” con heurísticas.
4. Métricas/reconciliación recalculables desde el ledger.
5. Cero imports a `lib/rewards|economy|commissions|dealAlerts|…`.
6. Cero escritura a tablas económicas Aventa.
7. Adapters oficiales = unsupported hasta formato documentado.

## Tests

`tests/cazaOfertas/revenueIngestion.contract.test.ts` (+ boundary scan del módulo).
