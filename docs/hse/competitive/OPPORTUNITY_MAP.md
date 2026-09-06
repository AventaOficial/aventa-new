# Opportunity Map

**Evidence:** E3 AVENTA · DOCUMENTED alternativas · HYPOTHESIS gaps

## Qué resuelve AVENTA hoy (OBSERVED E3)

- Agregar y descubrir ofertas en feed comunitario pequeño/medio (escala UNKNOWN).
- Señales sociales débiles (votos, comentarios).
- Outbound a tienda.
- Publish vía web + extensión.
- Expresión de demanda en Plaza **sin cierre del loop**.

## Qué resuelven bien los competidores (DOCUMENTED / INFERRED)

| Capacidad | Quién | Evidencia |
|---|---|---|
| Volumen + temperatura comunidad | Promodescuentos | DOCUMENTED Nosotros/FAQ |
| Alertas keyword automáticas | Promodescuentos app | DOCUMENTED App Store |
| Comparar precio multi-retailer | Google Shopping | DOCUMENTED |
| Comprar con fulfillment | Amazon / Mercado Libre | DOCUMENTED |
| Pedido humano ad-hoc | Grupos FB/WA/Telegram | INFERRED |

## Gaps (oportunidad ≠ garantía)

| Gap | Tipo | Por qué podría importar | Riesgo |
|---|---|---|---|
| **Demand-side discovery** (expresar «busco X» + respuesta humana ligada) | HYPOTHESIS | Incumbentes son supply-first; grupos son caóticos | Cold start, spam, calidad |
| **Cerrar loop Plaza** (request → offer link → notify → resolve) | E3 MISSING | Infra parcial ya existe | Ejecución + incentivos |
| **Validación de precio** más fuerte que votos | PARCIAL | Trust es job crítico | Datos / históricos caros |
| **Semántica «Cazar» unificada** | E3 | Reduce confusión | Solo copy/UX — no wedge |
| Personalización / alertas | PARCIAL vs PD | Retention | Copiable |

## Demand-Side Discovery — evaluación (no aceptada como verdad)

**Hipótesis:**  
«AVENTA no solo muestra ofertas; permite expresar qué oportunidad se busca y recibir ayuda para encontrarla.»

| Pregunta | Evaluación preliminar |
|---|---|
| ¿Qué problema? | Encontrar X bajo condiciones cuando el feed/search no alcanza |
| ¿Quién? | Buscadores con intención específica + cazadores dispuestos |
| ¿Cuándo? | Compra deliberada, deadline, SKU raro, presupuesto |
| ¿Qué hace hoy el usuario? | Grupos chat / alertas keyword / scroll múltiple sitios |
| ¿AVENTA lo resuelve hoy? | **No** — Plaza PARTIAL (CAZAR_OFERTAS_ANALYSIS) |
| ¿Incentivos? | UNKNOWN — Rewards OFF; reputación parcial |
| ¿Spam / baja calidad? | Alto riesgo sin moderación + ranking respuesta |
| ¿Qué hace valiosa una respuesta? | Link verificable + precio + vigencia + confianza |
| ¿Network effects? | Solo si matching + resolución cierran y densifican |

**Veredicto:** oportunidad **plausible** (HYPOTHESIS E1), **no demostrada**. El código prueba intención de producto parcial, no PMF.

## Modelo REQUEST (estado)

```
USER → REQUEST → HUNTERS/COMMUNITY → CANDIDATE OFFER → VALIDATION → RESPONSE → OUTCOME
```

| Eslabón | Estado AVENTA |
|---|---|
| USER | CURRENT (auth) |
| REQUEST | PARTIAL (create pending; list approved) |
| HUNTERS | PARTIAL (cualquier publisher; sin rol) |
| CANDIDATE OFFER | PARTIAL (upload genérico sin `request_id`) |
| VALIDATION | MISSING (para respuestas) |
| RESPONSE estructurada | MISSING |
| OUTCOME / closed | MISSING UI |

## Economía del comportamiento (estudio, no diseño rewards)

| Rol | Crea valor | Recibe valor | Paga / costea |
|---|---|---|---|
| Solicitante | Demanda / señal | Ahorro potencial | Atención, datos, wait |
| Cazador | Información / oferta | Reputación (?), afiliación (?) | Tiempo |
| Plataforma | Matching / trust | Tráfico / afiliados (?) | Moderación, infra |
| Retailer | Inventario | Conversión | Márgenes afiliados |

**Incentivos perversos potenciales (HYPOTHESIS):** spam de solicitudes, respuestas basura por puntos, auto-solicitudes, manipulación de demanda.

## Prioridad de oportunidad (no ranking de build)

1. Entender si J06 es dolor real (usuarios) — investigación primaria.  
2. Si sí: cerrar loop Plaza es prerequisito técnico, no wedge por sí solo.  
3. Wedge = segmento + job donde AVENTA gana *antes* de escala PD.
