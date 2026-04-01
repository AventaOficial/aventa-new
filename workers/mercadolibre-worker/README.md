# Mercado Libre Worker

Worker externo para descubrir candidatos de Mercado Libre con `Playwright` y enviarlos a AVENTA sin cargar scraping pesado dentro de Vercel.

## Flujo

1. Lee URLs semilla desde `WORKER_ML_SEEDS`.
2. Abre Mercado Libre con navegador real.
3. Extrae candidatos con precio actual y precio original.
4. Envía un lote a `POST /api/cron/bot-ingest-candidates`.
5. AVENTA deduplica, normaliza y guarda en moderación.

## Variables

Ver `.env.example`.

Claves mínimas:

- `AVENTA_INGEST_ENDPOINT`
- `AVENTA_CRON_SECRET`
- `WORKER_ML_SEEDS`

## Uso local

```bash
npm install
npm run run:dry
```

## Producción

Puedes correrlo en Railway, Render o un VPS pequeño. La app principal no necesita importar nada de esta carpeta.

### Railway

Si el entorno normal de Railway falla por librerías del sistema de Chromium, usa Docker en esta misma carpeta.
El `Dockerfile` ya utiliza la imagen oficial de Playwright con dependencias del navegador incluidas.
