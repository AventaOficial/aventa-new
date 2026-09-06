# HSE Evidence Model

**Protocolo:** HSE-00  
**Regla de oro:** nunca presentar E0/E1/E2 como si fueran E4/E5.

---

## Niveles de evidencia

| Nivel | Nombre | Definición | Ejemplo | Claim permitido |
|---|---|---|---|---|
| **E0** | Opinión | Preferencia o juicio sin método | “Se ve mejor” | Ninguno hacia producto |
| **E1** | Hipótesis | Afirmación falsable sin dato | “USER-A se pierde en filtros” | `HYPOTHESIS ONLY` |
| **E2** | Simulación | Traza/métrica de modelo o walkthrough etiquetado | Agente simula TASK-006 | Insights `SIMULATED` |
| **E3** | Observación del sistema | Logs, eventos, repro interno instrumentado | Conteos de errores de API/UI en prueba controlada interna | Hallazgos `OBSERVED` limitados |
| **E4** | Datos reales de usuarios | Comportamiento/actitudes de usuarios reales | Sesiones, interviews, analytics con N declarado | Claims de uso real con límites |
| **E5** | Experimento controlado | Diseño con CONTROL vs tratamiento, pre-registro | Lab o estudio formal | Inferencia causal acotada |

---

## Etiquetas conjuntas

Toda magnitud debe llevar:

1. **Nivel E***  
2. **Origen:** `SIMULATED` | `OBSERVED`  
3. **STATUS** si aplica: `HYPOTHESIS ONLY`

Ejemplos válidos:

- `E2 + SIMULATED` — simulación de TASK-001  
- `E3 + OBSERVED` — conteo de backtracks en prueba interna  
- `E1 + HYPOTHESIS ONLY` — sin número  

Ejemplos **inválidos**:

- “Los usuarios odian X” sin E4/E5  
- Publicar TIME de simulación como OBSERVED  
- “Mejora del 30%” sin experimento  

---

## Escalado de evidencia (camino típico)

```text
E0/E1  →  E2 (simulación)  →  E3 (sistema)  →  E4 (usuarios)  →  E5 (controlado)
```

No es obligatorio pasar por todos; sí es obligatorio **no saltar el etiquetado**.

---

## Uso por agentes

Ver matriz en [AGENT_ROLES.md](./AGENT_ROLES.md).  
AGENT-14 (Chief Scientist) degrada claims inflados al nivel correcto.

---

## Relación con recomendaciones de cambio

| Evidencia máxima del hallazgo | Acción típica |
|---|---|
| E0 | Descartar como driver de cambio |
| E1 | Documentar hipótesis |
| E2 | Refinar hipótesis / preparar experimento |
| E3 | Considerar instrumentación o lab experiment |
| E4 | Priorizar investigación / posible experimento |
| E5 | Base para decisión de producto (aún con guardrails) |

Cambios al CONTROL de producción **nunca** se autorizan solo con E0–E2.
