# HSE User Models (personas experimentales)

**Protocolo:** HSE-00  
**Importante:** USER-* son **modelos experimentales**, no afirmaciones demográficas sobre usuarios reales de AVENTA.  
No inventar datos `OBSERVED` de personas reales a partir de estos perfiles.

---

## Cómo usar un modelo

En cada corrida (baseline o experimento) fijar:

- `user_model_id` (USER-*)  
- tarea(s) (TASK-*)  
- dispositivo (móvil/desktop si aplica)  
- nivel de evidencia del escenario (suele ser E1–E2 hasta haber observación)

---

## USER-A — Usuario completamente nuevo

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad AVENTA | Nula |
| Objetivo típico | Entender qué es y si hay ofertas útiles |
| Tareas ancla | TASK-001, TASK-003, TASK-004, TASK-006 |
| Riesgos | Desorientación ENTRY; overload DISCOVERY |
| Hipótesis de fricción | F2–F3 en primeras sesiones (`HYPOTHESIS ONLY`) |

---

## USER-B — Usuario casual

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad | Baja–media; visitas esporádicas |
| Objetivo típico | “Ver si hay algo bueno hoy” |
| Tareas ancla | TASK-001, TASK-007, TASK-013 (versión ligera) |
| Riesgos | Abandono temprano; bajo compromiso de voto/comentario |
| Hipótesis | Prefiere bajo interaction cost |

---

## USER-C — Cazador experto de ofertas

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad | Alta con mecánicas de ofertas (no necesariamente con AVENTA) |
| Objetivo típico | Evaluar rápido valor real vs ruido |
| Tareas ancla | TASK-003, TASK-005, TASK-006, TASK-008 |
| Riesgos | Desconfianza si faltan señales; abandono si ranking “opaco” |
| Hipótesis | Alta sensibilidad a TRUST SIGNAL vs TRUST PROOF |

---

## USER-D — Comprador orientado a precio

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad | Variable |
| Objetivo típico | Maximizar ahorro percibido |
| Tareas ancla | TASK-002, TASK-003, TASK-005, TASK-006 |
| Riesgos | Anclaje de precio; descuento engañoso |
| Hipótesis | INFORMATION ACCESS centrada en precio/original/descuento |

---

## USER-E — Usuario recurrente de AVENTA

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad | Alta con CONTROL actual |
| Objetivo típico | Repetir hábitos eficientes |
| Tareas ancla | TASK-013, TASK-012, TASK-007, TASK-008 |
| Riesgos | Regresión por cambios de UI (cuando existan experimentos) |
| Hipótesis | Menor TIME que USER-A en mismas tareas (`SIMULATED` hasta medir) |

---

## USER-F — Usuario que publica ofertas

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad | Media–alta en publicación |
| Objetivo típico | Publicar y seguir estado |
| Tareas ancla | TASK-010, TASK-011, TASK-003 (auto-evaluación pre-publish) |
| Riesgos | Errores de validación; duplicados; cooldown; rechazo opaco |
| Hipótesis | FRICTION alta en formularios incompletos |

---

## USER-G — Baja familiaridad tecnológica

| Dimensión | Valor del modelo |
|---|---|
| Familiaridad tech | Baja |
| Objetivo típico | Completar una tarea simple sin errores |
| Tareas ancla | TASK-001, TASK-004, TASK-006, TASK-014 |
| Riesgos | Iconos sin etiqueta; gestos no descubiertos; errores no recuperables |
| Hipótesis | Mayor ERROR COUNT y RECOVERY TIME |

---

## USER-H — Usuario móvil

| Dimensión | Valor del modelo |
|---|---|
| Dispositivo | Móvil (touch) |
| Objetivo típico | Tareas ancla en viewport estrecho |
| Tareas ancla | TASK-014 (+ 001/006/007) |
| Riesgos | Targets; scroll; teclado; modales a pantalla completa |
| Hipótesis | Más SCROLLS; posibles F2–F3 por precisión |

---

## USER-I — Usuario desktop

| Dimensión | Valor del modelo |
|---|---|
| Dispositivo | Desktop (pointer ± teclado) |
| Objetivo típico | Tareas ancla con densidad de información |
| Tareas ancla | TASK-015 (+ 005/010) |
| Riesgos | Hover-only; múltiples columnas; ventanas |
| Hipótesis | Comparación (TASK-005) más viable que en móvil |

---

## USER-J — Altamente orientado a eficiencia

| Dimensión | Valor del modelo |
|---|---|
| Prioridad | Minimizar TIME e INTERACTIONS |
| Objetivo típico | Outcome con mínimo coste |
| Tareas ancla | TASK-006, TASK-001, TASK-013 |
| Riesgos | Odia pasos extras; abandono si F≥3 |
| Hipótesis | Sensible a INTERACTION EFFICIENCY (ver TIME_AND_MOTION) |

---

## Combinaciones válidas (ejemplos)

| Escenario | Modelos | Tareas |
|---|---|---|
| Primer contacto móvil | USER-A + USER-H | TASK-001, TASK-014 |
| Cazador precio desktop | USER-C + USER-D + USER-I | TASK-003, TASK-005, TASK-015 |
| Publicador | USER-F | TASK-010, TASK-011 |
| Eficiencia recurrente | USER-E + USER-J | TASK-013, TASK-006 |

Las combinaciones son **escenarios**, no segmentos de analytics reales hasta E4+.
