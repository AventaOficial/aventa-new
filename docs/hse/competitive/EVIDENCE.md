# Evidence Register — HSE-03

## Escala

| Nivel | Significado | Uso en este estudio |
|---|---|---|
| E0 | Opinion | Evitado como conclusión |
| E1 | Hypothesis | Wedges, moats potenciales, economía |
| E2 | Simulation | HSE-02 journeys citados |
| E3 | System observation | Código AVENTA / migraciones |
| E4 | Real user observation | **No** en HSE-03 |
| E5 | Controlled experiment | **No** en HSE-03 |

## Fuentes externas (DOCUMENTED)

| Fuente | URL / locus | Qué soporta |
|---|---|---|
| Promodescuentos Nosotros | https://www.promodescuentos.com/nosotros | Comunidad, votos temperatura, publish, afiliados |
| Promodescuentos FAQ | https://www.promodescuentos.com/página/faq | Definición comunidad caza ofertas, reputación, quién publica |
| App Store PromoDescuentos | https://apps.apple.com/mx/app/promodescuentos-ofertas/id889069686 | Alertas keyword, selección del día, votos, publish |
| RappiCard Hot Sale 2026 (secundaria) | rappicard.mx artículo | Uso práctico alertas PD (secundario; no E4 AVENTA) |

## Fuentes internas

| Fuente | Evidence |
|---|---|
| `docs/hse/baseline/*` HSE-01 | E3 |
| `docs/hse/simulations/*` HSE-02 | E2 |
| `docs/hse/competitive/CAZAR_OFERTAS_ANALYSIS.md` | E3 |
| `app/plaza/page.tsx`, `/api/plaza/*`, migración plaza | E3 |
| Extensión / ActionBar / OfferCard | E3 |

## Anti-patrones evitados

- No tratar descripción de competidor como evidencia de comportamiento de usuarios AVENTA.  
- No afirmar PMF.  
- No inventar features de competidores sin fuente.

## Techo de evidencia del estudio

**Máximo E3 interno + DOCUMENTED externo.**  
Conclusiones de oportunidad = **E1** pendientes de E4/E5.
