# User Journeys (conceptuales)

**Evidence:** E1/E2. No journeys observados E4.

---

## Journey A — Buscar → encontrar → comprar

| | |
|---|---|
| Objetivo | Hallar oferta y salir a tienda |
| Acciones | Search/feed → detalle → outbound |
| Decisiones | ¿Confío? ¿Compro ahora? |
| Incertidumbres | ¿Está barato? ¿Vigente? |
| Fricciones | Search débil; trust |
| Abandonos | No encuentra; duda precio |
| Resultado | Core AVENTA hoy (supply) |

## Journey B — Buscar → no encontrar → solicitar

| | |
|---|---|
| Objetivo | Seguir buscando tras fallo |
| Acciones | Search vacío → crear A o B |
| Decisiones | ¿Vale la pena esperar? ¿A o B? |
| Incertidumbres | ¿Habrá respuesta? |
| Fricciones | Auth; formularios; expectativa |
| Abandonos | Vuelve a Google/PD |
| Resultado | Puente a demanda; hoy PARTIAL E3 |

## Journey C — Solicitar → hunter → validar → comprar

| | |
|---|---|
| Objetivo | Ayuda humana útil |
| Acciones | Request → wait → respuesta → check → outbound |
| Decisiones | ¿Cuál respuesta? ¿Confío hunter? |
| Incertidumbres | Tiempo; calidad; vigencia |
| Fricciones | Cold start; spam; duplicados |
| Abandonos | Timeout; irrelevancia |
| Resultado | Modelo B + hunter; loop MISSING hoy |

## Journey D — Solicitar → AVENTA auto → comprar

| | |
|---|---|
| Objetivo | Match sistema sin humano |
| Acciones | Intent → resultados rankeados → outbound |
| Decisiones | ¿Constraints bien interpretados? |
| Incertidumbres | Falsos positivos de “IA” |
| Fricciones | Aprender UI; mala interpretación |
| Abandonos | Resultados peores que Google |
| Resultado | Modelo C; MISSING hoy |

## Journey E — Solicitar → nadie → cerrar

| | |
|---|---|
| Objetivo | Cerrar limbo |
| Acciones | Wait → empty → expire/close → alternativa |
| Decisiones | ¿Reintentar constraints? ¿Ir a otra app? |
| Incertidumbres | “¿Fallé yo o el producto?” |
| Fricciones | Silencio sin cierre |
| Abandonos | Churn / desconfianza Plaza |
| Resultado | Debe diseñarse como outcome válido |

## Journey F — Buscar → varias opciones → comparar → decidir

| | |
|---|---|
| Objetivo | Elegir entre candidatos |
| Acciones | Lista → comparar señales → outbound |
| Decisiones | Tradeoffs precio/tienda/confianza |
| Incertidumbres | Overchoice |
| Fricciones | Sin UI comparar (HSE-01/02) |
| Abandonos | Parálisis |
| Resultado | Validación/trust jobs; independiente de demand |

---

## Lectura cruzada

A y F son el corazón actual.  
B–E son la hipótesis demand hunting.  
Sin A/F sólidos, B–E amplifican fricción (HCI).
