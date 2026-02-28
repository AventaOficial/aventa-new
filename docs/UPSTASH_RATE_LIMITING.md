# Upstash Redis — Rate limiting en AVENTA

Upstash no ofrece IA en el soporte; esta doc describe la configuración actual y recomendaciones para revisar que todo esté bien.

## Uso actual en el proyecto

- **Librería**: `@upstash/ratelimit` y `@upstash/redis`.
- **Archivo**: `lib/server/rateLimit.ts`.
- **Credenciales**: Solo en servidor (env `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`); no se exponen al cliente.

### Presets configurados

| Preset    | Límite   | Ventana | Uso |
|-----------|----------|--------|-----|
| `default` | 30 req   | 1 min  | track-view, votos, upload |
| `reports` | 10 req   | 1 min  | POST /api/reports |
| `comments`| 20 req   | 1 min  | POST comentarios |
| `events`  | 60 req   | 1 min  | POST /api/events, track-outbound |
| `offers`  | 5 req    | 1 min  | POST /api/offers (crear oferta) |

Identificador usado: **IP** (`getClientIp(request)`), con soporte para `x-forwarded-for` y `x-real-ip` (típico detrás de Vercel).

## Dónde se aplica

- **Offers**: `app/api/offers/route.ts` → `enforceRateLimitCustom(ip, 'offers')`.
- **Votes**: `app/api/votes/route.ts` → `enforceRateLimit(ip)` (default).
- **Events**: `app/api/events/route.ts` → `enforceRateLimitCustom(ip, 'events')`.
- **Track outbound**: `app/api/track-outbound/route.ts` (revisar si usa el mismo preset u otro).
- **Reports**: `app/api/reports/route.ts` → preset `reports`.
- **Comments**: `app/api/offers/[offerId]/comments/route.ts` → preset `comments`.
- **Upload**: Si hay ruta de subida de imagen, suele usar `enforceRateLimit(ip)` (default).

## Cómo comprobar en producción que Upstash está configurado

1. **Vercel:** Proyecto → **Settings** → **Environment Variables**. Debe haber `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` para el entorno **Production** (y Preview si quieres límites en deploys de preview).
2. **Logs:** Si las variables no están definidas, en cada deploy el código de `lib/server/rateLimit.ts` hace un **log único por proceso** en producción:  
   `[rateLimit] UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN no configurados; el rate limiting no se aplica.`  
   Revisa **Vercel → Project → Logs** (Runtime Logs) tras una petición; si ves ese mensaje, añade las variables y redeploya.
3. **Prueba rápida:** Hacer muchas peticiones seguidas a una ruta limitada (p. ej. 6 POST a `/api/offers` en 1 minuto). Si nunca devuelve 429, o no tienes las variables o el límite es alto.

## Checklist de verificación (manual)

- [ ] En Vercel, las variables `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` están definidas para Production.
- [ ] Ninguna de estas variables se expone en el bundle del cliente (no están en `NEXT_PUBLIC_*`).
- [ ] Los límites por IP son aceptables para tu tráfico (ajustar en `rateLimit.ts` si hace falta).
- [ ] Si en el futuro quieres límite por usuario además de por IP, usar algo como `userId ?? ip` como clave (y seguir aplicando el rate limit solo en rutas de servidor).

## Recomendaciones (sin respuesta IA de Upstash)

1. **Claves**: El SDK de Upstash Ratelimit genera sus propias claves; no hace falta definir patrón manual si usas `Ratelimit.slidingWindow(limit, window)`.
2. **TTL**: Lo gestiona la librería; las entradas expiran según la ventana (p. ej. 1 min).
3. **Bypass**: Un atacante puede cambiar de IP (VPN/proxy); el límite por IP sigue siendo útil para abuso básico y bots.
4. **Soporte Upstash**: Si necesitas ayuda específica (límites, facturación, región), contactar por el formulario de soporte con: proyecto Next.js, uso para rate limiting por IP, y que no se exponen tokens en cliente.

Cuando hayas revisado los puntos anteriores, la configuración de Upstash para AVENTA puede darse por verificada a nivel proyecto.
