# HSE Trust Framework

**Protocolo:** HSE-00  
**Regla:** no asumir que una señal aumenta confianza sin evidencia.

---

## 1. Distinción crítica

| Concepto | Definición |
|---|---|
| **TRUST SIGNAL** | Indicio visible en la UI que *podría* influir en la percepción de confiabilidad. |
| **TRUST PROOF** | Evidencia de que esa señal (o conjunto) **realmente** mejora confianza o calidad de decisión en un estudio (E3–E5). |

Una señal sin prueba permanece como señal. Presentarla como “genera confianza” sin datos = **E0/E1 / HYPOTHESIS ONLY**.

---

## 2. Inventario de señales candidatas (CONTROL)

| Señal | Qué muestra típicamente | Pregunta abierta |
|---|---|---|
| Precio | Coste actual | ¿Se comprende? ¿Es creíble? |
| Descuento / precio ancla | Ahorro percibido | ¿Prueba o distorsión? |
| Tienda / marca | Origen comercial | ¿Reconocimiento ayuda? |
| Fecha / frescura | Vigencia | ¿Reduce incertidumbre? |
| Votos | Señal social / calidad comunitaria | ¿Se lee como prueba? |
| Comentarios | Experiencia narrada | ¿Calidad vs cantidad? |
| Autor | Quién publicó | ¿Reputación transferida? |
| Reputación / badges | Status del autor | ¿Hay TRUST PROOF? |
| Historial / insights de precio | Contexto temporal | ¿Mejora decisión? |
| Info de producto | Título, imagen, condiciones | ¿Suficiente para TASK-003? |
| Transparencia (afiliado, etc.) | Honestidad del sistema | ¿Aumenta o reduce click? |

---

## 3. Método

1. Inventariar señales presentes en card vs detalle.  
2. Clasificar cada una: SIGNAL only.  
3. Formular hipótesis: “Si señal X es más visible, TRUST self-report sube en USER-C”.  
4. Definir DV: self-report, elección, tiempo de decisión, outbound, abandono.  
5. No promover a PROOF sin E3+ (ideal E5).

---

## 4. Riesgos de confianza

| Riesgo | Descripción |
|---|---|
| Falsa seguridad | Prueba social débil interpretada como garantía |
| Opacidad | Falta de tienda/fecha/condiciones |
| Inconsistencia | UI dice favorito/voto pero backend no (rompe trust del sistema) |
| Urgencia artificial | Ansiedad sin base → erosión a largo plazo |
| Overclaim | Marketing interno de “confiabilidad” sin medición |

---

## 5. Relación con tareas

| Task | Rol de trust |
|---|---|
| TASK-003 | Núcleo de evaluación |
| TASK-006 | Puente a acción externa |
| TASK-008/009 | Señales sociales como input |
| TASK-010 | Credibilidad del publicador hacia moderación/comunidad |

---

## 6. Salida estándar

```text
signal:
present_in: card | detail | both
status: TRUST SIGNAL
proof_status: none | hypothesized | tested
evidence: E*
task/user:
risk:
next_study:
```
