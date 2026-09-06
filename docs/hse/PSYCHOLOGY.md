# HSE Psychology Framework

**Protocolo:** HSE-00  
**Propósito:** reducir confusión, fricción e información pobre; mejorar decisiones y control del usuario.  
**Prohibido:** usar este marco para diseñar dark patterns o engaño persuasivo.

---

## 1. Principio ético

La psicología en HSE sirve para:

- REDUCIR CONFUSIÓN  
- REDUCIR FRICCIÓN  
- MEJORAR INFORMACIÓN  
- MEJORAR DECISIONES  
- MEJORAR CONTROL DEL USUARIO  

No para maximizar clics a costa de comprensión o confianza.

Claims psicológicos sin método → **`HYPOTHESIS ONLY`** (típicamente E1).

---

## 2. Constructos a estudiar

| Constructo | Pregunta HSE | Riesgo si se ignora |
|---|---|---|
| Carga cognitiva | ¿El feed exige demasiados juicios simultáneos? | Abandono, errores |
| Memoria de trabajo | ¿TASK-005 obliga a recordar demasiados atributos? | Comparaciones pobres |
| Reconocimiento vs recuerdo | ¿El usuario debe recordar rutas/estados u ofrecer reconocimiento? | Fallo TASK-012 |
| Atención | ¿Qué compite por atención en la card? | INFORMATION IGNORE |
| Percepción | ¿Precio/descuento se leen correctamente? | Mala decisión |
| Confianza / incertidumbre | ¿Hay señales claras o ruido? | Evitar outbound |
| Toma de decisiones | ¿Cuántas decisiones por oferta? | Fatiga |
| Ansiedad por perder oferta | ¿Urgencia real o artificial? | Desconfianza si es artificial |
| Percepción del descuento | ¿El ancla es comprensible y honesta? | Anclaje dañino |
| Anclaje | ¿El precio “original” guía o distorsiona? | Decisiones sesgadas |
| Prueba social | ¿Votos/comentarios se interpretan como prueba? | Falsa seguridad |
| Aversión a la pérdida | ¿Copy/UI empuja miedo? | Dark pattern risk |
| Elección / fatiga decisional | ¿Demasiadas opciones similares? | Abandono |

---

## 3. Método de análisis (por tarea)

1. Listar información visible en cada etapa.  
2. Contar decisiones forzadas (M-DEC).  
3. Identificar elementos que requieren recuerdo vs reconocimiento.  
4. Marcar posibles sesgos **como hipótesis**, no como hechos.  
5. Proponer métrica dependiente (tiempo de evaluación, errores de interpretación, self-report).  
6. Asignar E* y etiqueta SIMULATED/OBSERVED.

---

## 4. Proxies aceptables (con honestidad)

| Proxy | Uso | Límite |
|---|---|---|
| Nº de campos a comparar | Carga de evaluación | No es carga cognitiva real |
| Tiempo en EVALUATION | Esfuerzo | Puede ser interés, no dificultad |
| Backtracks en comparación | Memoria de trabajo | Puede ser exploración legítima |
| Self-report “confundido” | Carga percibida | Sesgo de reporte |
| NASA-TLX (si se aplica) | Carga | Requiere estudio formal E4/E5 |

---

## 5. Relación con fricción y trust

- Alta carga sin soporte de reconocimiento → suele elevar FRICTION a F2+.  
- Incertidumbre de credibilidad → ver [TRUST.md](./TRUST.md).  
- Sesgos explotados → hallazgo **negativo** de AGENT-10 / AGENT-04, no “oportunidad de conversión”.

---

## 6. Salida estándar del analista cognitivo

```text
task_id / user_model_id / stage:
demandas cognitivas:
sesgos candidatos: (HYPOTHESIS ONLY)
evidencia: E*
riesgo para el usuario:
métrica propuesta:
recomendación de estudio: (no de UI prod)
```
