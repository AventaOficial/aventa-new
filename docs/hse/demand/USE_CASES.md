# Use Cases — Demand Hunting (conceptual)

**Evidence:** E1/HIPÓTESIS. No observados como comportamiento real de usuarios AVENTA.

Leyenda de encaje: A = comunitario · B = intención compra · C = sistema inteligente · — = fuera

| # | Caso | Modelo | ¿Cuándo tiene sentido? | ¿Cuándo no? | Friction / riesgo |
|---|---|---|---|---|---|
| 1 | Sabe exactamente el producto | B→C | Constraints claros | Ya barato en retailer | Competir con Google/ML |
| 2 | Sabe categoría, no SKU | A/B/C | Consejo + shortlist | Overchoice | Fatiga comparación |
| 3 | Presupuesto máximo | B/C | Filtra candidatos | Presupuesto irreal | Expectativa de “magia” |
| 4 | Precio objetivo | B/C | Alertas / caza | Target &lt; mercado | Fracaso percibido |
| 5 | Restricciones específicas | B/C | Condición, envío, tienda | Demasiados filtros | Cero resultados |
| 6 | No sabe dónde comprar | A/B | Tip de tienda/comunidad | Confianza tienda | Spam de links |
| 7 | No encuentra ninguna oferta | B→A/C | Escalada a caza/alerta | Impaciencia | Abandono |
| 8 | Opciones pero no sabe cuál | A + validación | Comparar/votar | Demasiadas opciones | Ansiedad |
| 9 | Quiere ayuda comunitaria | A | Social | Quiere SLA de servicio | Mezclar A con B |
| 10 | Quiere que “cace” alguien | B | Expertise humano | Escala baja hunters | Cold start |
| 11 | Quizá no hay oferta hoy | B + wait/alerta | Paciencia | Urgencia | Notificar después |
| 12 | Urgencia | C (si instant) o retailer | Match catálogo ya | Caza humana lenta | Mala expectativa |
| 13 | Solicitud demasiado vaga | A (chat) o clarificar | Pedir detalle | Auto-match basura | Ruido |
| 14 | Imposible / irrealista | Rechazo suave | Educar mercado | Fingir resultados | Pérdida confianza |
| 15 | Ya está en AVENTA | C match interno | “Ya lo tenemos” | Forzar caza humana | Duplicados |

## Principios de diseño derivados (E1 — no implementación)

1. Detectar/etiquetar vaguedad e irrealismo **antes** de crear expectativa de caza.  
2. Preferir **match catálogo existente** (caso 15) antes de movilizar hunters.  
3. Separar tono A (conversación) de B (intención con posible espera).  
4. Urgencia (12) casi nunca es job de hunter humano.  
5. Cero resultados honestos &gt; resultados irrelevantes.
