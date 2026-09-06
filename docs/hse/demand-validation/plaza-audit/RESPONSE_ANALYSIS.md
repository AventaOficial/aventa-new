# Response Analysis

## OBSERVATION (E3)

1. **No existe** tabla `request_responses` en Production.  
2. APIs Plaza solo crean/listan `plaza_requests` y `plaza_discussions` — **sin** endpoint de reply a una solicitud.  
3. UI «Ayudar a cazar» abre `/?upload=1&title=…` **sin** `request_id` — publish genérico, no respuesta trazable.  
4. Con 0 requests, distribución de respuestas = **N/A**.

## Métricas pedidas

| Métrica | Valor |
|---|---|
| % sin respuesta | **UNKNOWN** (no hay modelo); si se definiera “respuesta estructurada”, hoy **100% de capacidad = imposible** |
| Distribución 0/1/N | **UNKNOWN** |
| Usuarios que responden | **UNKNOWN** / 0 trazables |
| Concentración | **UNKNOWN** |
| Multi-participante | **UNKNOWN** |
| Tiempo 1ª / última respuesta | **UNKNOWN** |

## Utilidad de respuestas (Paso 7)

Muestra de interacciones: **vacía**.  
Clases POTENTIALLY USEFUL / … / OFFER FOUND: **N/A**.

## INTERPRETATION

No se puede evaluar calidad comunitaria de ayuda vía Plaza porque el producto **no persiste** respuestas a solicitudes.

## HYPOTHESIS (E1)

Si se habilita un loop de respuesta, la liquidez fallará primero por falta de usuarios activos (contexto beta), no solo por schema — pero eso requiere E4 + tráfico, no se demuestra aquí.
