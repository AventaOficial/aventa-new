# Reportes de oferta

El texto se recorta con `trim`. Los espacios no cuentan como contenido: hacen falta 30 caracteres útiles y el texto recortado no puede pasar de 500.

La identidad del límite es `user:{userId}` en el preset existente `reports` (10 por minuto, `RATE_LIMIT_REPORTS_PER_MIN`). La IP no es la identidad. La key vive en el prefijo de entorno del rate limiter (`aventa:<env>:ratelimit` cuando el acceso es scoped) más `rl:reports` y esa identidad. No hay una key global `reports`.

Si Redis no puede contestar en una ruta crítica, la respuesta es `REPORT_RATE_LIMIT_UNAVAILABLE` (503). No se presenta como abuso. En un entorno que no es producción, el mismo contador por usuario cae a memoria de la instancia.

`REPORT_DUPLICATE` es otro código: el mismo usuario ya tiene una fila para esa oferta. El cliente no envía `reporter_id` ni `status`. Las escrituras pasan por el API con service role. RLS no deja insertar a `anon` ni a `authenticated`.
