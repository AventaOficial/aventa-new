# Findings — HSE-06A

## Flujo actual Plaza (código + datos)

```
Usuario auth
  → POST /api/plaza/requests (status=pending)
  → [moderación approve: MISSING en repo]
  → GET lista approved (hoy: [])
  → CTA «Ayudar a cazar» → /?upload=1&title=…
  → oferta publicada (si ocurre) SIN vínculo a request
  → sin notify / sin resolution UI
```

Discussions: paralelo pending→approved, sin thread replies.  
Avisos: `/api/announcements` (fuera de demanda).

## Hallazgos clave

1. **Infra sí, uso Plaza no** (0/0).  
2. **Respuestas a solicitudes: imposible de medir** — modelo ausente.  
3. **Request→offer→click: NO OBSERVED CONNECTION.**  
4. **RESOLUTION = UNKNOWN.**  
5. Contexto **beta privada / sin activos** explica liquidez nula mejor que “hipótesis refutada”.  
6. No arreglar nada en esta fase (documentado solamente).

## Mapa vs HSE-04 (`docs/hse/demand/`)

| Tema HSE-04 | Verdict vs Plaza E3 |
|---|---|
| Demanda explícita en producto | **UNKNOWN** / vacío — no SUPPORT de tracción |
| Community help | **UNKNOWN** — sin interactions; schema débil → **WEAK** compatibilidad solo de intención de UI |
| Cold start | **WEAK SUPPORT** estructural (loop incompleto); demanda>capacidad **NO OBSERVED** (0 demanda) |
| Quality de respuestas | **UNKNOWN** |
| Trust | **UNKNOWN** |
| Resolution | **UNKNOWN** (CONFIRMADO: no hay señal confiable) |
| Demand → offer connection | **CONTRADICTION** a “ya conecta” — **NO OBSERVED**; compatible con HSE-04 “MISSING” |

Leyenda: SUPPORT / WEAK SUPPORT / CONTRADICTION / UNKNOWN según brief.

## Oportunidades / unknowns (NO implementar)

- Instrumentar reply + request_id (futuro)  
- Moderación approve path  
- Métricas request lifecycle  
- No confundir offers supply-side con validación demand hunting
