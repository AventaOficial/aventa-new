# HSE Metrics System

**Protocolo:** HSE-00  
**Regla:** no inventar números reales. Toda magnitud lleva etiqueta de origen.

---

## Etiquetas de origen (obligatorias)

| Etiqueta | Uso |
|---|---|
| `SIMULATED` | Simulación, agente USER Simulation, estimación analítica |
| `OBSERVED` | Medición en sistema, log, estudio con participantes reales |
| `HYPOTHESIS ONLY` | Afirmación cualitativa sin magnitud confiable |

Prohibido presentar `SIMULATED` como `OBSERVED`.

---

## Familias de métricas

### TIME

| ID | Nombre | Definición operativa |
|---|---|---|
| M-TIME-TOTAL | TOTAL TASK TIME | Tiempo desde inicio de tarea hasta outcome. |
| M-TIME-STAGE | Stage time | Tiempo por etapa ENTRY…OUTCOME. |
| M-TIME-RECOVERY | RECOVERY TIME | Tiempo desde error hasta retomar camino útil. |

### INTERACTIONS / CLICKS / SCREENS / SCROLLS

| ID | Nombre | Definición |
|---|---|---|
| M-INT-COUNT | INTERACTION COUNT | Nº de micro-interacciones INT-* en la tarea. |
| M-CLICK | CLICKS/TAPS | Subconjunto click/tap. |
| M-SCREEN | SCREENS | Estados/rutas/superficies distintas visitadas. |
| M-SCROLL | SCROLLS | Eventos o distancia de scroll (definir unidad en el estudio). |

### DECISIONS / INFORMATION

| ID | Nombre | Definición |
|---|---|---|
| M-DEC | DECISION COUNT | Elecciones conscientes requeridas (filtros, sí/no valor, CTA). |
| M-INFO-ACCESS | INFORMATION ACCESS | Unidades de info consultadas (campos/secciones abiertas). |
| M-INFO-IGNORE | INFORMATION IGNORE | Unidades visibles no atendidas (requiere método: eye-track, self-report, o proxy débil). |

### ERRORS / RETRIES / BACKTRACKS / ABANDON

| ID | Nombre | Definición |
|---|---|---|
| M-ERR | ERROR COUNT | Errores percibidos o del sistema que interrumpen el plan. |
| M-RETRY | RETRIES | Reintentos de la misma acción tras fallo. |
| M-BACK | BACKTRACKS | Retornos a estado anterior no planificado como parte del happy path. |
| M-ABANDON | ABANDONMENT | Salida sin outcome de éxito. |

### SUCCESS / FAILURE

| ID | Nombre | Definición |
|---|---|---|
| M-OK | TASK SUCCESS | Outcome cumple criterio de TASK_CATALOG. |
| M-FAIL | TASK FAILURE | Outcome no cumple; incluye “éxito falso” si se detecta. |

### Constructos estimados (cuidado)

| ID | Nombre | Notas |
|---|---|---|
| M-COG | COGNITIVE LOAD | Estimación; método debe declararse (NASA-TLX, proxy, juicio experto E1). |
| M-FRIC | FRICTION | Nivel F0–F5 (RESEARCH_PROTOCOL). |
| M-TRUST | TRUST | Escala del estudio o proxies; ver TRUST.md. |
| M-A11Y | ACCESSIBILITY | Barreras contadas / severidad; ver ACCESSIBILITY.md. |

### Costes derivados

| ID | Nombre | Notas |
|---|---|---|
| M-NAV-COST | NAVIGATION COST | Función de SCREENS + BACKTRACKS + NAV events (fórmula de estudio). |
| M-INFO-COST | INFORMATION COST | Esfuerzo para obtener info necesaria (accesos + tiempo de evaluación). |
| M-IE | INTERACTION EFFICIENCY | Experimental — ver TIME_AND_MOTION.md; **sin fórmula definitiva**. |

---

## Qué no medir todavía como “hecho”

- Tasas de conversión reales inventadas  
- NPS/CSAT sin encuesta  
- “Carga cognitiva = 7/10” sin método  
- Comparaciones estadísticas sin diseño experimental  

---

## Mapeo mínimo métrica → tarea (orientativo)

| Métrica | Tareas donde es primaria con frecuencia |
|---|---|
| TIME, SCROLLS | 001, 002, 012, 014 |
| DECISIONS, INFO | 003, 005 |
| OUTBOUND success | 006 |
| ERRORS, RETRIES | 007, 008, 009, 010 |
| NAV COST | 011, 012 |
| A11Y | 014, 015 |

---

## Registro de una métrica (plantilla)

```text
metric_id:
value:
unit:
label: SIMULATED | OBSERVED
evidence_level: E0..E5
task_id:
user_model_id:
method:
notes:
```
