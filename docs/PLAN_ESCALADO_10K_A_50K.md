# Plan de escalado 10k -> 50k (AVENTA)

Fecha: 27-03-2026
Horizonte: 8 semanas
Objetivo: sostener 10,000 usuarios/mes en el mes 1 y quedar listo para 50,000 usuarios/mes en el mes 2.

## 1) SLOs objetivo

Mes 1:

- p95 feed home < 800ms
- error rate API < 1%
- p95 votos/publicación < 1s

Mes 2:

- p95 feed home < 600ms
- error rate API < 0.5%
- picos 400-700 concurrentes sin caída total

## 2) Semana a semana

### Semana 1-2 (estabilizar 10k)

- Cache de lectura en feed.
- Dashboard de métricas con crecimiento semanal.
- Monitoreo diario de integridad.
- Pruebas de carga base (lectura + interacción ligera).

### Semana 3-4 (writes intensivos)

- Desacoplar procesamiento de eventos/votos en background (cola).
- Idempotencia en endpoints de escritura.
- Rate limits adaptativos por endpoint.

### Semana 5-6 (camino a 50k)

- Precomputación incremental de ranking.
- Optimización de queries calientes con EXPLAIN ANALYZE.
- Reducción de payload en APIs más usadas.

### Semana 7-8 (hardening final)

- Pruebas de picos y ráfagas.
- Ajuste de degradación controlada en picos.
- Runbook de incidentes con tiempos de respuesta.

## 3) Checklist de capacidad (Go/No-Go)

- [ ] Build y tests contrato en verde
- [ ] Integridad sin fallos críticos 7 días seguidos
- [ ] Feed y votos bajo SLO en stress test
- [ ] Alertas configuradas y probadas
- [ ] Runbook documentado y validado por owner

## 4) Métricas mínimas a revisar diario

- p95 `/api/feed/home`
- p95 `/api/votes`
- 5xx total y por endpoint
- CPU/Connections en DB
- `growth_weekly_pct` (crecimiento 7d vs 7d anterior)

