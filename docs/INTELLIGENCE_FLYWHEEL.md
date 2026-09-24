# Inteligencia de mercado — contratos

Capa de lectura sobre datos que ya existen. No publica ofertas, no activa machine mint, no mueve dinero y no entra al ranking.

## Precio

Raw sigue en `product_price_snapshots` (una fila por producto ML y día) y `offer_price_snapshots` (por oferta, sin columna de moneda). El conocimiento derivado vive en `price_intelligence_rollups`, una fila por sujeto, ventana (7/30/90) y fecha. La clave es `subject:key:window:as_of`.

Lectura: un sujeto, máximo 200 filas, índice existente `(marketplace, product_id, recorded_on)` u `(offer_id, recorded_at)`.

| Volumen de snapshots | Acceso |
| --- | --- |
| 1k–100k | lectura puntual |
| 100k–1M | misma lectura, más el rollup diario para no re-agregar en dashboards |
| 1M–10M | el rollup no basta para barrer la tabla; el siguiente paso físico es particionar `product_price_snapshots` por `recorded_on`. No se particiona en esta migración. |

Retención: las filas diarias de producto se conservan. Un snapshot de oferta de más de 180 días solo es candidato a borrarse cuando ya existe rollup de esa oferta. Nada se borra solo.

Precio canónico: el precio de venta/último precio. La moneda sale de la fila en Price Memory. En snapshots de oferta la columna no existe; la API declara la suposición `MXN` y se niega a mezclar monedas.

Métricas, y por qué existen:

- actual, mínimo, máximo, mediana: posición del precio
- tendencia: mediana de la segunda mitad contra la primera; menos de 3% es plano
- volatilidad: coeficiente de variación; ruido, no “buena oferta”
- duración y cambios: cuántos días se sostiene el precio y cuántas veces se movió más de 1%
- frecuencia de descuento: contra precio de lista si existe y supera el 2%; si no, contra mediana. El método viaja con el número
- profundidad: solo si el precio actual está bajo la mediana
- anomalía: con 8 o más puntos, fuera de mediana ± 2 desviaciones
- confianza: tamaño de muestra, diversidad de fuente y antigüedad. No es probabilidad de conversión
- freshness: horas desde la última observación
- evidencia: muestras, fuentes, última marca de tiempo, si el corte truncó

## Supply

`hunter_supply_runs` ya es append-only, con idempotencia `(run_id, source_id)`. La lectura de admin toma como máximo 500 corridas en 30 días. No hay costo en dinero en esa tabla: el costo observable es `duration_ms` y errores.

No hay categoría ni marca en las corridas. Esas dos inteligencias quedan explícitamente no disponibles. La frecuencia de cambio de precio pertenece a la capa de precio.

El ranking de fuentes (`rankSourcesForNextLook`) no alimenta el scheduler. Descubrimiento adaptativo queda calculable y todavía no ejecutado.

## Demanda

`demand_offer_signals` agrupa como máximo 7 días y 100 ofertas. Devuelve conteos de vistas, outbound, votos positivos, guardados y comentarios aprobados. No devuelve `user_id`. `product_events` no se suma, para no duplicar el embudo.

Una oferta con votos y sin eventos en la ventana no entra: la selección es por eventos. La marca no existe como columna. Estas features no se leen desde `lib/offers/scoring.ts` ni desde el feed.

Identidad: el agregado tira el usuario. La transición anónimo → cuenta no se reconstruye aquí. Anti-abuso heredado: voto único por oferta y usuario, y los rate limits ya existentes. Un fallback de memoria en rate limit puede inflar eventos; esta capa no lo corrige.

Retención de eventos crudos no cambia en esta migración.

## Transacción

`TRANSACTION_FOUNDATION_MODE = observe_only`.

Attribution, conversion, commission y settlement son eventos distintos. Ninguna capa puede promover a otra. Conversión y comisión salen `not_connected`. Settlement sale `rejected`. El click con `click_id` es evidencia de atribución, no de ingreso.

## Observabilidad

Contadores de proceso: resúmenes de precio, ventanas de supply, ventanas de demanda, rechazos de cruce de capa. La API `GET /api/admin/intelligence/flywheel` los expone junto con los contratos. Rol: métricas (owner, admin, analyst).

## Dónde se rompe el ciclo

La demanda no entra al descubrimiento. El precio y la demanda no cambian el orden del feed: existe una comparación en sombra. El outbound no tiene conversión de red. Esas ausencias están en `lib/intelligence/flywheel/contracts.ts`.

## Ranking en sombra

El feed sigue ordenando por `ranking_blend`. `rank-intel-v1` calcula otra puntuación (`appliedToFeed: false`) con precio, frescura, demanda, consenso comunitario y confiabilidad de fuente. Conversión está `disabled`. Una anomalía alta baja la señal de precio; no crea una oferta.

`GET /api/admin/intelligence/shadow` compara el top del feed contra esa sombra usando los votos que ya vienen en la fila. `POST` acepta evidencia explícita y, si `persist` es true, guarda una fila en `intelligence_shadow_decisions`. Esa tabla solo admite `observe` y `shadow`, y `mutates_production` tiene que ser false.

La prioridad de fuentes queda en `shadow`. `SUPPLY_PRIORITY_ACTIVATES_SCHEDULER` es false.

La cola de frescura reserva parte del lote a lo más vencido y limita la cuota de una tienda. Si el pool ya no tiene otra tienda bajo ese tope, el lote se llena igual.

## Analítica y escala

`offer_events` es volumen. `reward_outbound_clicks` es atribución. `product_events` no se suma al primero. Menos de 100.000 filas: lectura indexada. De 100.000 a 1 millón: rollup. Desde 1 millón: candidata a partición.

## Bloqueos externos

Aplicar `20260923_intelligence_foundation.sql` y `20260923_intelligence_shadow.sql`. PITR y backups no están en el repositorio. Upstash, crons de Vercel y secretos siguen siendo configuración externa. S7 comprueba el flag de escritura machine antes de insertar `pending`. S6.1 sigue evaluándose en el worker, no en esta capa.

## Cupones

`offers.coupons` sigue siendo la nota libre de la oferta. El registro canónico es `coupons`, con historial en `coupon_events` y relación en `coupon_links`. Una mención queda `discovered` y no se muestra como disponible. Solo un cupón verificado dentro de la ventana de frescura (72 h, la misma de las ofertas) llega a la ficha. El precio efectivo se niega si faltan moneda, mínimo, alcance o tope. El ranking vivo no cambia. `resolveOutbound` reutiliza las etiquetas de afiliado existentes y no escribe el código en la URL.


