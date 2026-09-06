# Demand Model — A / B / C

**Evidence:** E1 salvo referencias E3 a Plaza actual.

## Pregunta central

¿Podría AVENTA ofrecer descubrimiento superior si la persona expresa qué quiere encontrar y recibe oportunidades del sistema, la comunidad o cazadores?

**Respuesta de esta fase:** posible en teoría; **no demostrado**. El valor depende del job, la liquidez y la calidad — no de “tener IA”.

---

## Tres conceptos (separar)

### MODELO A — Solicitud comunitaria

> “¿Alguien sabe dónde venden una PS5 barata?”

| Dimensión | Contenido |
|---|---|
| Intención | Social / consejo / rumor |
| Estructura | Baja |
| Éxito | Conversación útil, tip, link suelto |
| Riesgo | Ruido, off-topic, no cierre |
| Encaje AVENTA hoy | Cercano a Plaza + discusiones (E3 PARTIAL) |

### MODELO B — Solicitud de intención de compra

> “Busco una PS5 Slim por menos de $8,000.”

| Dimensión | Contenido |
|---|---|
| Intención | Compra condicionada |
| Estructura | Media (producto + presupuesto) |
| Éxito | Candidato verificable que cumple constraints |
| Riesgo | Expectativa de servicio; cold start |
| Encaje AVENTA hoy | Schema Plaza admite budget/store en API pero form no los envía (E3) |

### MODELO C — Búsqueda inteligente de AVENTA

> “Quiero PS5 Slim &lt; $8,000, nueva, envío gratis.”

| Dimensión | Contenido |
|---|---|
| Intención | Query estructurada interpretada por sistema |
| Estructura | Alta |
| Éxito | Ranking de oportunidades internas/externas sin esperar humano |
| Riesgo | Otra UI que aprender; falsos positivos; costo; “IA por IA” insuficiente |
| Encaje AVENTA hoy | **MISSING** — no implementar en HSE-04 |

---

## ¿Separados, convivir, conectar, evolucionar?

| Opción | Evaluación (E1) |
|---|---|
| Solo A | Compatible con “extra comunitario”; bajo compromiso de producto core |
| Solo B | Más cerca de demand hunting; requiere loop respuesta + calidad |
| Solo C | Compite con Google/Shopping/alertas; necesita datos/ofertas densas |
| A + B conviviendo | **Preferible conceptualmente:** tono social vs intención de compra etiquetados distinto |
| B → C progresivo | **Plausible:** primero match contra catálogo AVENTA + alertas; comunidad cuando sistema falla |
| C primero | **Riesgo alto** de interfaz extra sin ventaja vs Google |

**Principio propuesto (E1, no decisión de build):**  
No fusionar A y B en la misma expectativa de SLA.  
C no es “mejor” por ser tecnológico; solo tiene sentido si reduce esfuerzo medible vs search/alertas existentes.

---

## Cadena conceptual

```
BUSCAR → SOLICITAR → CAZAR → ENCONTRAR → VALIDAR → NOTIFICAR
```

| Eslabón | Rol ideal (E1) | Estado CONTROL (E3 vía HSE-03) |
|---|---|---|
| BUSCAR | Feed/search interno | PARCIAL |
| SOLICITAR | Expresar demanda A o B | PARTIAL (pending/approve gap) |
| CAZAR | Humano o sistema | PARTIAL (publish sin vínculo) |
| ENCONTRAR | Candidato oferta | PARTIAL / no ligado |
| VALIDAR | Precio/vigencia/trust | PARCIAL en ofertas; MISSING en respuestas a request |
| NOTIFICAR | Avisar al solicitante | MISSING |

**Conclusión de modelo:** la cadena completa **no existe** hoy. Completarla no implica automáticamente superioridad vs Google/PD.

---

## Cuándo tendría sentido (E1)

- Compra deliberada con constraints (presupuesto, condición, tienda).
- Catálogo AVENTA no tiene match obvio tras búsqueda corta.
- Usuario tolera espera (horas/días), no “ahora mismo”.
- Nicho donde hunters tienen expertise.

## Cuándo NO tendría sentido (E1)

- SKU trivial ya barato en ML/Amazon/Google Shopping.
- Urgencia “necesito en 10 minutos”.
- Query vaga (“algo bonito barato”).
- Precio objetivo irreal.
- Usuario solo quiere scroll de discovery (job feed).

## Problema / para quién / alternativas

| | |
|---|---|
| Problema | Esfuerzo e incertidumbre al buscar oportunidad que cumple condiciones |
| Quién | Comprador con intención (no scroller puro) |
| Alternativas | Google, Shopping, ML/Amazon, PD + alertas keyword, grupos |
| Ventaja hipotética AVENTA | Contexto de ofertas + comunidad + (posible) validación en un workflow |
| Riesgo | Cold start, spam, expectativa de servicio, UI extra |
| Dificultad | Alta si dos lados; media si solo match catálogo (subconjunto de C) |
| Evidencia necesaria | E4 esfuerzo/éxito/satisfacción vs alternativa habitual |

---

## Relación con el corazón de AVENTA

AVENTA core (HSE-03): descubrir, validar, aprovechar ofertas (supply-side).

Demand hunting es **adyacente**: puede alimentar discovery y señales de demanda, pero **no debe** redefinir el producto sin evidencia de que el job es frecuente y superiormente resuelto aquí.
