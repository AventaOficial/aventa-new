# AVENTA Human System Engineering (HSE)

**Fase:** HSE-00 — Protocolo maestro de investigación y evaluación  
**Estado:** PROTOCOL COMPLETE — READY FOR REVIEW  
**Alcance:** documentación y metodología únicamente  
**Baseline de producto:** AVENTA actual = **CONTROL** (no modificar)

---

## Qué es esto

**AVENTA Human System Engineering** es el marco formal para estudiar cómo una persona interactúa con AVENTA como sistema:

`humano + interfaz + información + decisiones + tecnología`

No es un rediseño. No es opinión estética. Es un **protocolo experimental reproducible**.

---

## Principio fundamental

El Home y la experiencia actuales son **BASELINE / CONTROL**.

Ningún agente puede recomendar cambios solo porque “se ve mejor”, “más moderno” o “me gusta más”.

Toda recomendación debe intentar demostrar:

1. problema  
2. dónde ocurre  
3. usuario afectado  
4. tarea afectada  
5. evidencia  
6. métrica deteriorada  
7. modificación propuesta  
8. riesgo  
9. cómo medir la mejora  

Si no hay evidencia suficiente → **`STATUS = HYPOTHESIS ONLY`**

---

## Documentos (HSE-00)

| Documento | Contenido |
|---|---|
| [RESEARCH_PROTOCOL.md](./RESEARCH_PROTOCOL.md) | Protocolo maestro, definiciones, journey, fricción, lab, no-regresión |
| [TASK_CATALOG.md](./TASK_CATALOG.md) | TASK-001 … TASK-015 |
| [USER_MODELS.md](./USER_MODELS.md) | USER-A … USER-J (modelos experimentales) |
| [AGENT_ROLES.md](./AGENT_ROLES.md) | AGENT-01 … AGENT-14 |
| [METRICS.md](./METRICS.md) | Métricas, etiquetas SIMULATED / OBSERVED |
| [TIME_AND_MOTION.md](./TIME_AND_MOTION.md) | Tiempos y movimientos + fórmulas candidatas |
| [PSYCHOLOGY.md](./PSYCHOLOGY.md) | Marco cognitivo (sin dark patterns) |
| [TRUST.md](./TRUST.md) | Trust signals vs trust proof |
| [ACCESSIBILITY.md](./ACCESSIBILITY.md) | Checklist de accesibilidad |
| [EXPERIMENT_DESIGN.md](./EXPERIMENT_DESIGN.md) | CONTROL vs EXPERIMENT A/B, HSE Score (propuesta) |
| [EVIDENCE_MODEL.md](./EVIDENCE_MODEL.md) | Niveles E0–E5 |

---

## Reglas de seguridad (invariantes)

**NO modificar** en esta fase (ni por agentes HSE futuros sin autorización explícita):

- Home / componentes de producción  
- navegación o estilos existentes  
- Supabase / DB / migrations  
- Rewards / money paths / Auth / APIs  
- Vercel / cron / extension  
- WIP no relacionado  

**NO:** A/B en producción · deploy · push · dependencias nuevas sin autorización.

**Lab futuro (conceptual):** ruta separada tipo `/hse` o `/aventa-lab` — **nunca** altera producción por defecto.  
**HSE-00 no implementa el laboratorio.**

---

## Etiquetas de datos (obligatorias)

| Etiqueta | Significado |
|---|---|
| `SIMULATED` | Valor de simulación, modelo o agente |
| `OBSERVED` | Dato medido en sistema o usuarios reales |
| `HYPOTHESIS ONLY` | Afirmación sin evidencia suficiente |
| `CONTROL` | Baseline AVENTA actual |

Niveles de evidencia: ver [EVIDENCE_MODEL.md](./EVIDENCE_MODEL.md) (E0–E5).  
**Nunca presentar E0/E1/E2 como si fueran E4/E5.**

---

## Próxima fase recomendada

**HSE-01** — Baseline capture del CONTROL (instrumentación de captura de tareas, plantillas de sesión, sin cambiar UI de producción).

Ver también: [RESEARCH_PROTOCOL.md § Próximas fases](./RESEARCH_PROTOCOL.md#próximas-fases).
