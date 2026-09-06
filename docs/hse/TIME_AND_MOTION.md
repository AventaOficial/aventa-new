# HSE Time & Motion Methodology

**Protocolo:** HSE-00  
**Inspiración:** estudios clásicos de tiempos y movimientos, adaptados a software/UI.  
**No** fija aún una fórmula única de eficiencia.

---

## 1. Objetivo

Para cada TASK-* × USER-* × dispositivo, describir el **trabajo observable** (y el estimado) necesario para lograr el outcome.

---

## 2. Qué se registra por tarea

| Elemento | Descripción | Etiqueta |
|---|---|---|
| Tiempo total | TOTAL TASK TIME | SIMULATED / OBSERVED |
| Tiempo por etapa | ENTRY…OUTCOME | idem |
| Número de acciones | INTERACTION COUNT | idem |
| Acciones innecesarias | Fuera del happy path mínimo | juicio + evidencia |
| Acciones repetidas | Mismo INT-* sin progreso | OBSERVED preferible |
| Decisiones | DECISION COUNT | idem |
| Errores | ERROR COUNT | idem |
| Recuperación | RECOVERY TIME | idem |
| Navegación | SCREENS, INT-NAV, INT-BACK | idem |
| Retrocesos | BACKTRACKS | idem |

---

## 3. Procedimiento de análisis (reproducible)

1. Fijar `task_id`, `user_model_id`, `product_version` (CONTROL).  
2. Definir happy path mínimo **descriptivo** del CONTROL (no idealizado de rediseño).  
3. Ejecutar corrida (humana, simulada o ambas).  
4. Codificar cada evento con INT-*.  
5. Segmentar por etapa de journey.  
6. Marcar desviaciones: error, retry, backtrack, abandon.  
7. Asignar fricción F0–F5 por etapa y max de tarea.  
8. Calcular métricas derivadas **solo con fórmula declarada en el reporte**.  
9. Clasificar evidencia E*.

---

## 4. Definiciones operativas clave

| Término | Definición |
|---|---|
| TOTAL TASK TIME | Reloj de tarea: start trigger → outcome timestamp. |
| INTERACTION COUNT | Σ micro-interacciones codificadas. |
| ERROR COUNT | Eventos que rompen el plan del usuario. |
| RECOVERY TIME | Suma de intervalos error→reanudación útil. |
| DECISION COUNT | Nº de bifurcaciones conscientes requeridas. |
| NAVIGATION COST | Coste de moverse entre estados (ver candidatos abajo). |
| INFORMATION COST | Coste de obtener la info necesaria para decidir. |

---

## 5. INTERACTION EFFICIENCY — métrica experimental

**Estado:** candidata · **no normativa** en HSE-00.

### Fórmula candidata A — éxito por interacción

\[
IE_A = \frac{\mathbb{1}_{success}}{1 + N_{interactions}}
\]

- **Ventaja:** simple; penaliza verbosidad.  
- **Limitación:** ignora tiempo, errores y calidad de decisión; favorece UIs que ocultan pasos críticos.

### Fórmula candidata B — éxito ajustado por error y tiempo

\[
IE_B = \frac{\mathbb{1}_{success}}{(1 + N_{interactions}) \cdot (1 + N_{errors}) \cdot (1 + T_{task}/T_{ref})}
\]

- **Ventaja:** incorpora errores y tiempo relativo.  
- **Limitación:** requiere \(T_{ref}\) arbitrario; sensible a outliers; `SIMULATED` fácil de sesgar.

### Fórmula candidata C — información útil / coste

\[
IE_C = \frac{I_{necessary\ accessed}}{1 + N_{interactions} + N_{backtracks}}
\]

- **Ventaja:** alinea con calidad de evaluación (TASK-003/005).  
- **Limitación:** definir \(I_{necessary}\) es subjetivo sin protocolo de coding.

### Fórmula candidata D — guardrails (eficiencia no regresiva)

Declarar \(IE\) solo si:

- TASK SUCCESS = 1  
- FRICTION max ≤ umbral  
- ERROR COUNT ≤ umbral  
- no a11y blocker  

Si falla guardrail → **IE no reportable** (evita “ganar” eficiencia con regresión).

- **Ventaja:** alinea con principio de no regresión.  
- **Limitación:** más binaria; menos útil para optimización fina temprana.

### Recomendación HSE-00

Usar **A o B como exploración `SIMULATED`**, y exigir **D (guardrails)** antes de cualquier claim de “mejora de eficiencia” hacia producto.  
**No adoptar fórmula definitiva** hasta HSE-04+ con datos E3+.

---

## 6. NAVIGATION COST e INFORMATION COST (candidatos)

**Navigation cost (candidato):**

\[
NC = a\cdot N_{screens} + b\cdot N_{backtracks} + c\cdot N_{nav}
\]

con \(a,b,c\) declarados en el estudio.

**Information cost (candidato):**

\[
IC = d\cdot T_{evaluation} + e\cdot N_{info\ access} + f\cdot N_{info\ search}
\]

---

## 7. Tabla de salida sugerida

| Stage | Time | Ints | Dec | Err | Back | F | Notes |
|---|---|---|---|---|---|---|---|
| ENTRY | | | | | | | |
| DISCOVERY | | | | | | | |
| EVALUATION | | | | | | | |
| DECISION | | | | | | | |
| ACTION | | | | | | | |
| OUTCOME | | | | | | | |
| **TOTAL** | | | | | | max | |

Todos los números con `SIMULATED` o `OBSERVED`.
