# Quality Model — señales conceptuales

**Evidence:** E1. No mecanismos a implementar.

## Taxonomía

| Clase | Definición operativa (conceptual) |
|---|---|
| BUENA RESPUESTA | Cumple constraints del request; link verificable; precio/tienda claros; vigente |
| IRRELEVANTE | Producto/constraints distintos; “mira esto” genérico |
| SPAM | Links basura, auto-promo, flooding |
| DUPLICADO | Misma URL/fingerprint / misma oferta AVENTA |
| CADUCADA | Stock/precio ya no aplica |
| ENGAÑOSA | Precio mentiroso, bait, condiciones ocultas |
| REALMENTE VALIOSA | Buena + ventaja clara vs alternativas conocidas (ahorro/condiciones) |

## Señales que podrían importar (E1)

| Señal | Sirve para | Riesgo si se abusa |
|---|---|---|
| Match constraints (precio, modelo, condición) | Buena vs irrelevante | Parsing rígido |
| URL canónica / fingerprint | Duplicado | Fingerprint incompleto |
| Edad del precio capturado | Caducada | False confidence |
| Reputación hunter | Engañosa / spam | Barreras a newcomers |
| Votos comunidad en respuesta | Calidad | Brigading |
| Feedback del solicitante (“útil / no”) | Ground truth | Poca tasa de feedback |
| Ya existía en feed AVENTA | Duplicado / shortcut C | — |
| Outbound / retorno del comprador | Outcome débil | No prueba compra |

## Principio

Optimizar por **utilidad al solicitante**, no por número de respuestas.
