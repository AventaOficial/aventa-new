# Baseline de capacidad

Fecha: 2026-10-04, 19:26–19:27 UTC.
Entorno: `https://staging.aventaofertas.com`. No se usó producción para concurrencia.
No se corrieron 100, 250, 500 ni 1000. A 50 concurrentes, búsqueda y votos sin sesión empezaron a responder 403. Subir más habría sido un stress test contra el plan Free, no una medición útil.

Cada cifra es de una sola oleada. No es una capacidad máxima de usuarios.

## Método

`fetch` en Node, una oleada por ruta, timeout 20 s. Un 5xx o un abort cuenta como error. 401, 400 y 403 no cuentan como error de servidor: son rechazo de auth o de límite.

La ficha usada fue la que devolvió el feed de staging: `/oferta/a1111111-1111-4111-8111-111111111101`. Es una oferta de staging, no una de las 12 de producción.

No se leyó `pg_stat_activity` durante la oleada. No hay latencia de base ni conexiones en esta tabla. No se capturó `X-Feed-Cache`.

## Staging, concurrencia

| Ruta | n | req/s | p50 | p95 | p99 | errores | timeouts | status observado |
|---|---|---|---|---|---|---|---|---|
| Home | 10 | 7.9 | 1029 ms | 1252 ms | 1252 ms | 0 | 0 | 200 |
| Feed | 10 | 7.4 | 1267 ms | 1346 ms | 1346 ms | 0 | 0 | 200 |
| Search | 10 | 7.8 | 526 ms | 1285 ms | 1285 ms | 0 | 0 | 200 |
| Health | 10 | 14.5 | 642 ms | 690 ms | 690 ms | 0 | 0 | 200 |
| Vote sin sesión | 10 | 50.5 | 154 ms | 196 ms | 196 ms | 0 | 0 | 400 |
| Ficha | 10 | 3.6 | 2577 ms | 2785 ms | 2785 ms | 0 | 0 | 200 |
| Home | 25 | 62.2 | 285 ms | 320 ms | 399 ms | 0 | 0 | 200 |
| Feed | 25 | 19.7 | 471 ms | 1239 ms | 1265 ms | 0 | 0 | 200 |
| Search | 25 | 42.8 | 363 ms | 448 ms | 582 ms | 0 | 0 | 200 |
| Health | 25 | 38.3 | 502 ms | 638 ms | 653 ms | 0 | 0 | 200 |
| Vote sin sesión | 25 | 130.3 | 154 ms | 191 ms | 191 ms | 0 | 0 | 400 |
| Ficha | 25 | 11.4 | 1767 ms | 2154 ms | 2192 ms | 0 | 0 | 200 |
| Home | 50 | 64.3 | 163 ms | 703 ms | 758 ms | 0 | 0 | 200 |
| Feed | 50 | 40.1 | 868 ms | 1201 ms | 1243 ms | 0 | 0 | 200 |
| Search | 50 | 113.9 | 116 ms | 395 ms | 435 ms | 0 | 0 | 403 |
| Health | 50 | 61.9 | 486 ms | 770 ms | 795 ms | 0 | 0 | 200 |
| Vote sin sesión | 50 | 132.9 | 127 ms | 180 ms | 372 ms | 0 | 0 | 403 |
| Ficha | 50 | 23.9 | 1398 ms | 2028 ms | 2091 ms | 0 | 0 | 200 |

El voto sin cuerpo respondió 400 (payload inválido) hasta la oleada de 50, donde pasó a 403 junto con la búsqueda. No hubo 5xx ni timeouts.

## Lectura

1. **Punto observado:** a 50 concurrentes el límite de la búsqueda y del voto sin sesión responde 403. La ficha sigue en 200 con p95 cerca de 2 s. No hubo caída del proceso.
2. **Punto seguro de esta muestra:** 25 concurrentes en estas rutas, 0 errores, 0 timeouts. Home en caliente quedó en p95 320 ms.
3. **Cuello:** la ficha. Es la ruta más lenta en los tres escalones (p95 2.0–2.8 s, 4–24 req/s según la oleada).
4. **Antes de escalar:** no hace falta un índice nuevo para abrir. El siguiente trabajo, si el tráfico real lo pide, es la ficha (lecturas en serie de oferta, health y metadata) y confirmar que el 403 de búsqueda es el rate limit esperado y no un bloqueo de plataforma.

## Producción, en serie, el mismo día

No es concurrencia. Muestra anterior contra `https://aventaofertas.com`.

| Ruta | Muestra | p50 | p95 | errores |
|---|---|---|---|---|
| Home en caliente | n=8 | 148 ms | 263 ms | 0 |
| Ficha, una en frío | 2228 ms | — | — | 0 |
| Ficha en caliente | n=5 | 449 ms | 531 ms | 0 |
| Búsqueda `mayonesa` | n=1 | 610 ms | — | 0 |

`/api/health` de producción a las 19:12 UTC: `offersCount=654`, `feedViewOk=true`.
