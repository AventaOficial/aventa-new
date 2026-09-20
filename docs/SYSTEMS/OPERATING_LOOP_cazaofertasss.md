# CAZAOFERTASSS — Daily Operating Loop (FASE 3.3)

Documento operativo. **No cron. No horarios hardcodeados en código.**

## Principio

Medir el negocio aunque el revenue oficial esté UNKNOWN.
No inventar conversiones ni comisiones.

## Loop sugerido

### 1) Apertura (ej. ~08:00 local — orientación)

- Revisar pipeline outbox: `PREPARED`, `SENDING`, `FAILED`, retries
- Revisar canary/allowlist Telegram si aplica staging
- Confirmar que no hay escritura a money path Aventa

### 2) Durante el día

- Discovery → evidence → scoring → affiliate eligibility
- Prepare/publish vía outbox
- Registrar business events (`DEAL_*`, `DEAL_PUBLISHED`)
- Tracking registry al publicar (FASE 3.2)

### 3) Cierre de día

- Construir `CazaDailySnapshot` para la fecha UTC
- Funnel derivado de la ventana del día
- Publication performance:
  - top clicks (si hay evidencia)
  - sin clicks / revenue UNKNOWN con actividad
- Quality: rejected, stale evidence, affiliate eligibility failures
- Revenue panel: known / pending / unknownSignalCount (unknown monto = null)

### 4) Acciones de crecimiento (humanas)

- Doblar categorías ganadoras
- Pausar/retirar publicaciones muertas
- Corregir fallas de evidencia/afiliado
- **No** rankear por revenue si commission es UNKNOWN

## Señales vs dinero

| Señal ops | ¿Es money? |
|-----------|------------|
| CLICK / ATTRIBUTION_* / ORDER_* events | No |
| COMMISSION ops event | No (correlación) |
| Ledger `AffiliateRevenueEvent` FASE 3 | Sí (provider evidence) |
| Aventa rewards/payouts | Prohibido |
