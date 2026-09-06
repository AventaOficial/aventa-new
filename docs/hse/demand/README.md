# HSE-04 — Demand Hunting Model

**Status:** RESEARCH COMPLETE — READY FOR REVIEW  
**Evidence ceiling:** E1 (hipótesis) + E3 (estado Plaza/Cazar en código vía HSE-03) + DOCUMENTED (alternativas públicas)  
**Scope:** investigación y modelado conceptual — **sin implementación**

## Disclaimer

Las solicitudes actuales de AVENTA fueron concebidas como **extra comunitario**. Este estudio **no** asume que deban convertirse en el corazón del producto.

La hipótesis de “expresar intención → sistema/comunidad encuentra oportunidades” es **vaga y no validada** (E1).

## VERDICT (resumen)

**C — EXPLORE**

Merece experimentación de bajo riesgo con usuarios (concierge / interpretación / relevancia).  
**No** hay evidencia suficiente para prototipo de producto (no D).  
No es NO GO: el gap vs grupos + alertas keyword es conceptualmente interesante.

Detalle: [SUCCESS_CRITERIA.md](./SUCCESS_CRITERIA.md) y sección final de este README.

## Documentos

| Archivo | Contenido |
|---|---|
| [DEMAND_MODEL.md](./DEMAND_MODEL.md) | Modelos A/B/C y cadena BUSCAR→…→NOTIFICAR |
| [USE_CASES.md](./USE_CASES.md) | 15+ casos de uso |
| [ACTOR_MODEL.md](./ACTOR_MODEL.md) | Comprador, hunter, comunidad, AVENTA |
| [TWO_SIDED_MODEL.md](./TWO_SIDED_MODEL.md) | 12 escenarios de dos lados |
| [COMPETITIVE_COMPARISON.md](./COMPETITIVE_COMPARISON.md) | vs Google, PD, retailers, grupos |
| [COLD_START.md](./COLD_START.md) | Liquidez y expectativas |
| [QUALITY_MODEL.md](./QUALITY_MODEL.md) | Señales de calidad (conceptual) |
| [INCENTIVES.md](./INCENTIVES.md) | Incentivos y riesgos |
| [TRUST_MODEL.md](./TRUST_MODEL.md) | Confianza en respuestas |
| [HCI_PSYCHOLOGY.md](./HCI_PSYCHOLOGY.md) | Psicología / carga cognitiva |
| [USER_JOURNEYS.md](./USER_JOURNEYS.md) | Journeys A–F |
| [METRICS.md](./METRICS.md) | Métricas hipotéticas |
| [EXPERIMENTS.md](./EXPERIMENTS.md) | Experimentos de bajo riesgo |
| [SUCCESS_CRITERIA.md](./SUCCESS_CRITERIA.md) | Criterios antes de producto |
| [MOAT_ANALYSIS.md](./MOAT_ANALYSIS.md) | Si PD copia |
| [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) | Preguntas abiertas |

## Fuentes

- HSE-00 / HSE-01 / HSE-02 / HSE-03 (`docs/hse/competitive/*`)
- Estado CONTROL Plaza/Cazar (E3 documentado en HSE-03)
- Información pública de alternativas (DOCUMENTED en HSE-03)

## Etiquetas

`E1/HIPÓTESIS` · `E2` simulación · `E3` sistema · `DOCUMENTED` · `INFERRED` · `UNKNOWN`

## Lo que esta fase NO hace

No modifica código, UI, rutas, tablas, APIs, Supabase, solicitudes existentes, IA, matching, notificaciones, rewards, Home, ni deploy.

---

## VERDICT ejecutivo

### C — EXPLORE

Hay algo **conceptualmente interesante** (conectar intención con oportunidades + comunidad cuando el sistema no alcanza), pero **no** evidencia de superioridad vs Google/PD/grupos.  
Merece experimentos baratos con usuarios — **no** build de producto.

| | |
|---|---|
| **What we know** | Plaza/solicitudes existen parciales (E3); loop respuesta/notify MISSING; PD es supply-first + alertas keyword (DOCUMENTED); A/B/C son jobs distintos |
| **What we don't know** | Si el dolor B/J06 es frecuente; si usuarios preferirían AVENTA vs alternativas; liquidez hunters; valor de “IA” vs match catálogo simple |
| **Strongest hypothesis** | Tras fallo de búsqueda corta, un path B con match catálogo primero y escalada humana/alerta después puede reducir esfuerzo en compras deliberadas con constraints — **E1** |
| **Biggest risk** | Cold start + silencio = percepción de producto roto; o UI extra peor que Google; o rewards que generan basura |
| **Cheapest validation** | X7 observación Plaza + X1 entrevistas + X4 form intents + X3 concierge (ver EXPERIMENTS.md) |
| **Recommended next HSE phase** | **HSE-05 — Demand validation with real users** (entrevistas + concierge + relevance), sin implementar IA/matching en producción |

### Disclaimer final

Este estudio no demuestra product-market fit ni ventaja competitiva. No es excusa para construir.
