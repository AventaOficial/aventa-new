# Plan de stress test y capacidad (10k -> 50k)

Fecha: 27-03-2026  
Objetivo: medir capacidad real antes de escalar tráfico.

## 1) Escenarios de simulación

### Escenario A (10k/mes controlado)

- concurrentes objetivo: 80-140
- tráfico: 80% lectura, 15% votos/eventos, 5% publicación
- duración: 20 min
- meta:
  - p95 `/api/feed/home` < 800ms
  - error rate global < 1%

### Escenario B (crecimiento medio)

- concurrentes objetivo: 140-220
- tráfico: 70% lectura, 20% votos/eventos, 10% publicación
- duración: 30 min
- meta:
  - p95 `/api/feed/home` < 900ms
  - p95 `/api/votes` < 1s
  - error rate global < 1.5%

### Escenario C (pico tipo viral)

- concurrentes objetivo: 250-400
- tráfico: 65% lectura, 25% votos/eventos, 10% publicación
- duración: 10 min de ráfaga + 20 min recuperación
- meta:
  - mantener disponibilidad sin caída total
  - backlog de cola de eventos no creciente de forma indefinida

### Escenario D (objetivo mes 2 -> 50k/mes)

- concurrentes objetivo: 400-700
- tráfico: mezcla real + picos de escritura
- duración: 45 min
- meta:
  - p95 feed < 600-700ms (con cache estable)
  - error rate < 0.5-1%
  - operación recuperable con runbook

## 2) Endpoints críticos para testear

- Lectura:
  - `GET /api/feed/home?type=trending&limit=12`
  - `GET /api/feed/home?type=for-you&limit=12` (sin auth para carga pública)
  - páginas `/`, `/oferta/:id`
- Escritura:
  - `POST /api/events` (view/share/outbound)
  - `POST /api/track-view`
  - `POST /api/track-outbound`
  - `POST /api/votes`
  - `POST /api/offers` (solo en escenarios controlados)

## 3) Comandos sugeridos (autocannon)

> Ejecutar desde local contra staging/preview para no contaminar producción.

### Feed home (lectura)

```bash
npx autocannon -c 120 -d 60 -p 10 "https://TU_DOMINIO/api/feed/home?type=trending&limit=12"
```

### Ráfaga de eventos (escritura ligera)

```bash
npx autocannon -c 100 -d 45 -m POST -H "Content-Type: application/json" -b "{\"offer_id\":\"UUID_VALIDO\",\"event_type\":\"view\"}" "https://TU_DOMINIO/api/events"
```

### Votos (escritura)

```bash
npx autocannon -c 60 -d 45 -m POST -H "Content-Type: application/json" -b "{\"offerId\":\"UUID_VALIDO\",\"value\":2}" "https://TU_DOMINIO/api/votes"
```

## 4) Semáforo Go/No-Go (operativo)

Usar `/operaciones` + endpoint `GET /api/admin/go-no-go`:

- GO (verde):
  - integridad en verde,
  - alertas configuradas,
  - cola de escrituras sin acumulación.
- GO con atención (amarillo):
  - fallos menores o backlog moderado.
- NO-GO (rojo):
  - integridad en rojo o cola fallando/acumulando fuerte.

## 5) Runbook básico en pico

1. Revisar `/operaciones` y semáforo Go/No-Go.
2. Si cola crece: ejecutar `Procesar cola`.
3. Si error rate sube: aumentar temporalmente cache de feed.
4. Si p95 no baja: activar límites más estrictos (`RATE_LIMIT_*`).
5. Documentar incidente y ajustar plan de semana siguiente.

