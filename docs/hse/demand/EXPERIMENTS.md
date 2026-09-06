# Experiments — bajo riesgo (NO implementar en HSE-04)

Clasificación E1–E5 según protocolo HSE.

| ID | Experimento | Nivel | Qué valida | Costo / riesgo |
|---|---|---|---|---|
| X1 | Entrevistas jobs J02/J06 (¿pides ayuda? ¿alertas?) | E4 | Existencia del dolor | Bajo |
| X2 | Diary: qué hace la gente hoy cuando no encuentra | E4 | Alternativas reales | Bajo |
| X3 | Concierge: 20 requests manuales respondidas por ops/hunters | E4≈E5 light | ¿Utilidad si hay respuesta? | Medio ops |
| X4 | Formulario simple intención (Notion/Typeform) sin producto | E4 | Calidad de intents | Bajo |
| X5 | Prueba interpretación: humanos rankean parse de queries | E2/E4 | ¿C aporta vs keyword? | Bajo |
| X6 | Prueba relevancia: side-by-side Google vs shortlist AVENTA catálogo | E4/E5 | Superioridad match interno | Medio |
| X7 | Observar Plaza Prod read-only (si hay datos) | E3 | ¿Alguien usa solicitudes? | Muy bajo |
| X8 | Simulación journeys B–E con personas (HSE-02 style) | E2 | Fricción cognitiva | Bajo |
| X9 | A/B copy A vs B expectation (solo si hubiera UI test) | E5 | Expectativas | Requiere producto — **no ahora** |
| X10 | Hunter sin reward: ¿responden? | E4 | Incentivos | Concierge |

## Orden recomendado (E1)

1. X7 (E3) + X1 (E4) — ¿hay señal y dolor?  
2. X4 + X3 — ¿intents útiles y respuestas valoradas?  
3. X6 — ¿match catálogo ya gana algo sin caza humana?  
4. Solo entonces considerar prototipo de producto.

## Fuera de alcance inmediato

Implementar IA, matching, notificaciones, rewards, o cambiar Plaza.
