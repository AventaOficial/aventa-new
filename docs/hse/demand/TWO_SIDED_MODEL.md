# Two-Sided Model — escenarios

**Evidence:** E1/E2 conceptual. No datos reales de matching AVENTA.

## Escenarios

| # | Escenario | Consecuencia | Principio de diseño (E1) |
|---|---|---|---|
| 1 | Demanda, nadie responde | Expectativa rota; abandono; “Plaza muerta” | SLA honesto; match auto primero; expirar visible |
| 2 | Un hunter responde | Posible éxito si calidad | Facilitar una buena respuesta &gt; muchas |
| 3 | Varios hunters responden | Overchoice o competencia | Deduplicar; rankear; no premiar volumen |
| 4 | Respuestas irrelevantes | Pérdida de confianza | Señales de calidad; feedback del comprador |
| 5 | Misma oferta dos hunters | Ruido / pelea de crédito | Fingerprint/URL única; crédito al primero útil |
| 6 | Oferta ya en AVENTA | Caza redundante | Surface existing offer before hunt |
| 7 | Oferta expira | Frustración post-notify | Timestamp + revalidación |
| 8 | Precio cambia | Decisión inválida | Precio capturado + disclaimer |
| 9 | Producto no existe en fuentes | Cierre honesto | “No encontrado” es resultado válido |
| 10 | Solicitud spam | Contamina hunters | Rate limit / moderación / costo de create |
| 11 | Abuso (auto-request, farming) | Inflación métricas | No reward por volumen bruto |
| 12 | Mucha demanda, poca capacidad | Cola infinita | Priorizar; limitar open requests; nicho |

## Implicaciones de liquidez

Un sistema de dos lados **falla en silencio** (escenario 1) más que un buscador de un lado.  
Por eso C (match catálogo) y alertas de un lado son **amortiguadores** de cold start, no “features bonus”.

## No marketplace

Nada en estos escenarios requiere que AVENTA cobre al comprador, asigne hunters, o garantice entrega. El outcome sigue siendo **outbound a tienda**.
