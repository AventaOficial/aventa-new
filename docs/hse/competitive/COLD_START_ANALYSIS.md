# Cold Start Analysis

Pregunta: ¿funciona el wedge a 10 / 100 / 1,000 / 10,000 usuarios?

## Principio

| Mecánica | ¿Necesita masa crítica? |
|---|---|
| Publish + feed supply-side | Baja–media (contenido seedable) |
| Votos trust | Media (señal ruidosa con n bajo) |
| **Solicitudes + matching humano** | **Alta** (dos lados) |
| Comunidad nicho | Media (liquidez por vertical) |
| Extensión publish | Baja (herramienta individual) |

---

## Por wedge

### W1 Demand hunting

| N | Expectativa |
|---|---|
| 10 | Probable silencio; requests sin respuesta → abandono |
| 100 | Posible si hay 5–10 hunters activos concentrados |
| 1,000 | Viable en 1 ciudad/vertical si incentivos claros |
| 10,000 | Posible liquidez general; spam crece |

**Riesgo cold start:** CRÍTICO. Marketplace de dos lados.

### W2 Nicho especializado

| N | Expectativa |
|---|---|
| 10 | Funciona solo si los 10 son del mismo nicho |
| 100 | Mejor forma de cold start que generalista |
| 1k–10k | Escala vertical |

**Riesgo:** medio; estrategia de foco reduce umbral.

### W3 Trust / validación precio

| N | Expectativa |
|---|---|
| 10 | Opiniones no confiables |
| 100 | Señal débil |
| 1k+ | Más útil |

**Riesgo:** medio-alto sin datos externos.

### W4 Extensión publish

| N | Expectativa |
|---|---|
| 10 hunters | Útil para ellos; feed sigue vacío para lectores |
| 100+ | Supply visible |

**Riesgo cold start:** bajo para tool; alto para valor lector.

### W5 Señal de demanda

| N | Expectativa |
|---|---|
| <100 requests | Ruido / no estadística |
| 1k+ requests | Posible priorización |

**Riesgo:** alto; depende de W1 vivo.

---

## Implicación

Cazar/Solicitudes **no** es MVP de un solo usuario. Sin plan de liquidez (seed hunters, vertical, concierge matching), el loop fallará aunque el código se complete.

Etiqueta: **HYPOTHESIS** — no medido con usuarios AVENTA.
