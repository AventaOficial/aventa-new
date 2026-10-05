# MCP Grok Bots — contrato de integración

Estado: implementado y apagado. La escritura sólo se enciende con `MCP_INGEST_ENABLED=true`, después de validar en staging.

| Entorno | Migración | Autor bot | Redis (namespace) | Cliente máquina | Código desplegado | `MCP_INGEST_ENABLED` |
|---|---|---|---|---|---|---|
| Staging (`oojshofrpbfwsiypcecr`) | aplicada 2026-10-05 | pendiente (operador) | sin configurar (MCP respondería 503); usará `aventa:staging:*` en el Redis compartido | ninguno | no | apagado |
| Producción (`mkgsrpsuvedwwlzmzmzh`) | no aplicada | no | Redis físico actual; `aventa:production:*` cuando se declare | ninguno | no | apagado |

> **Redis compartido (riesgo aceptado).** Staging y Production comparten temporalmente el mismo backend físico de Upstash por restricción presupuestaria. El aislamiento se realiza mediante namespaces y marcadores de entorno independientes. Esto NO equivale a aislamiento físico y deberá migrarse a Redis separado antes de que staging maneje datos sensibles, volumen significativo o pruebas de producción. La migración a Redis separado es una tarea posterior de infraestructura, no un requisito para activar controladamente MCP ahora (ver §14).

## 1. Qué es y qué no es

Un bot de Grok (o cualquier cliente MCP) es **sólo un proveedor de candidatos**. Propone URLs de ofertas con pistas (título, precio, nota). Aventa las verifica con su pipeline de lotes y una persona decide.

Un cliente MCP **no es**:

- autor comunitario, moderador ni publicador;
- un Aventa Hunter (no se conecta con `editorial_hunters`, no se presenta como Ximena ni como ningún personaje);
- actor económico: no gana ni pierde reputación, no recibe logros, no desbloquea Rewards, no entra en comisiones, settlement ni ledger, y no recibe notificaciones ni correos económicos.

## 2. Arquitectura

```
Grok (xAI remote MCP, Streamable HTTP)
  → POST /api/mcp                          autenticación → tamaño → JSON → rate limit → herramienta
    → submit_deal_candidates
      → offer_batches (machine_client_id, mcp_idempotency_key, mcp_payload_hash, mcp_run_id)
      → offer_batch_items (INGESTED, hint_*)
  → pipeline de lotes existente             proceso, extracción, validación y dedupe (lo dispara staff)
  → moderación humana                       aprobar ítem → createCommunityOfferPending
  → ingestOfferObservation                  único writer de `offers` (pending)
  → /api/admin/moderate-offer               publicar / rechazar (humano)
```

No hay tablas ni writers paralelos: no existen `mcp_offers`, `grok_offers`, `bot_offers`, `mcp_writer` ni `grok_writer`. El endpoint no toca `offers`, no salta `machineWriteAuth`, no salta la moderación y no altera los freezes de producción.

Código:

| Pieza | Ruta |
|---|---|
| Endpoint MCP | `app/api/mcp/route.ts` |
| Contrato y constantes | `lib/mcp/contract.ts` |
| Tokens | `lib/mcp/tokens.ts` |
| Autenticación | `lib/mcp/auth.ts` |
| Validación de candidatos | `lib/mcp/candidates.ts` |
| Envíos, idempotencia, cuota, estado | `lib/mcp/submissions.ts` |
| Catálogo público | `lib/mcp/catalog.ts` |
| Reglas | `lib/mcp/rules.ts` |
| Servidor y herramientas | `lib/mcp/server.ts` |
| Auditoría | `lib/mcp/audit.ts` |
| Kill switch | `lib/mcp/flags.ts` |
| Owner: dominio | `lib/mcp/machineClients.ts` |
| Owner: API | `app/api/admin/machine-clients/route.ts`, `app/api/admin/machine-clients/[id]/route.ts` |
| Owner: UI | `app/admin/machine-clients/page.tsx` |
| Firewall económico | `lib/economy/botAuthorFirewall.ts` |
| Autoría al aprobar | `resolveBatchItemAuthor` en `lib/offers/batch/service.ts` |
| Migración | `docs/supabase-migrations/20261006_machine_clients_mcp.sql` |
| Rate limit sólo distribuido y namespace | `lib/server/rateLimitPolicy.ts`, `lib/server/rateLimit.ts` |
| Entorno de Redis y aislamiento por namespace | `lib/server/redisEnvironment.ts` (puro), `lib/server/scopedRedis.ts` (marcador en runtime y keys) |
| Preflight de staging | `lib/mcp/preflight.ts`, `lib/server/redisEnvironmentMarker.ts`, `scripts/mcp-staging-preflight.ts` |
| Autor bot de staging | `scripts/mcp-provision-staging-bot-author.ts` |

## 3. Autenticación

- Cabecera `Authorization: Bearer avk_<prefix>_<secret>`.
  - `prefix`: 12 hex. Se guarda en claro para encontrar la fila.
  - `secret`: 32 bytes aleatorios en base64url.
- En base sólo viven `token_prefix` y `token_hash` (SHA-256 hex del token completo). La comparación usa `timingSafeEqual`.
- El token se muestra **una sola vez** al crearlo. No hay recuperación ni segunda visualización.
- La autenticación ocurre antes de leer el cuerpo y antes de cualquier herramienta.
  - Sin token, token inválido, revocado o vencido: **HTTP 401** con `WWW-Authenticate: Bearer`.
  - Error al leer `machine_clients`: **HTTP 503**. Nunca hay acceso anónimo.
- El secreto de cron (`CRON_SECRET`) **nunca** autentica en MCP.
- Nunca se registra el token ni la cabecera `Authorization`.

## 4. Scopes y herramientas

Scopes permitidos (CHECK en base y validación en servidor): `candidates:submit`, `candidates:read`, `catalog:read`. Cualquier otro (`offers:write`, `moderate`, `publish`, `rewards`, `admin`, `cron`, comodines) se rechaza al crear el cliente y se descarta al autenticar.

Exactamente 4 herramientas. No hay resources, prompts ni otras herramientas.

| Herramienta | Scope | Efecto |
|---|---|---|
| `submit_deal_candidates` | `candidates:submit` | Crea un lote MCP. Nunca escribe `offers`. |
| `get_submission_status` | `candidates:read` | Estado de un envío propio. |
| `check_offer_exists` | `catalog:read` | Sólo `{ exists }` sobre el catálogo público. |
| `get_submission_rules` | `candidates:read` | Contrato público. |

Scope faltante: error de herramienta `FORBIDDEN_SCOPE` (auditado). Herramienta inexistente: error del SDK, sin efectos.

## 5. Contrato de candidatos

Entrada de `submit_deal_candidates`:

```json
{
  "idempotencyKey": "grok-2026-10-04-0001",
  "runId": "opcional",
  "candidates": [
    {
      "url": "https://www.amazon.com.mx/dp/B0XXXXXXX",
      "title": "Texto plano ≤ 200",
      "price": 499,
      "originalPrice": 899,
      "currency": "MXN",
      "note": "Texto plano ≤ 280",
      "observedAt": "2026-10-04T17:00:00Z"
    }
  ]
}
```

Reglas:

- 1 a 20 candidatos. Más de 20: `TOO_MANY_CANDIDATES`.
- `url`: https, host en la allowlist de comercio existente (`isAllowedOfferParseHost`), sin credenciales, sin puerto, sin IP literal, sin punto final en el host, sin barras invertidas, **sin query (`?`) y sin fragmento (`#`)**, aunque estén vacíos. La identidad del producto sólo depende de host + path (o ASIN / id de Mercado Libre), y la query podría cargar etiquetas de afiliado ajenas. Un host conocido escondido en query o fragmento no cuenta (`UNSUPPORTED_HOST`). `check_offer_exists` aplica la misma regla.
- `title` (obligatorio, ≤ 200) y `note` (opcional, ≤ 280): texto plano normalizado NFC. Se rechazan `<`, `>`, entidades HTML, controles C0/C1, zero-width, overrides bidi y BOM.
- `price` > 0. `originalPrice`, si viene, debe ser mayor que `price`.
- `currency` = `MXN`.
- `observedAt`: ISO 8601 con zona. No más de 10 min en el futuro ni más de 30 días atrás.
- Un candidato malformado se rechaza **por índice** y no tumba la llamada.
- Duplicados dentro del mismo envío (misma identidad de producto) van a `duplicatesInRequest`.
- Todo lo enviado es **pista**, nunca evidencia: se guarda en `hint_*`. El endpoint **no hace fetch** de ninguna URL; la extracción la hace el pipeline existente cuando staff procesa el lote.

Respuesta:

```json
{
  "submissionId": "uuid",
  "accepted": [{ "index": 0 }],
  "rejected": [{ "index": 1, "code": "UNSUPPORTED_HOST" }],
  "duplicatesInRequest": [{ "index": 2, "duplicateOf": 0 }],
  "quota": { "dailyCap": 200, "usedToday": 3, "remainingToday": 197 }
}
```

Nunca se exponen notas de moderación, scores, `bot_meta`, identidad del staff, economía, ids internos innecesarios ni contenido crudo.

Códigos de rechazo por candidato: `INVALID_CANDIDATE`, `INVALID_URL`, `UNSUPPORTED_HOST`, `INVALID_TITLE`, `INVALID_PRICE`, `INVALID_ORIGINAL_PRICE`, `INVALID_CURRENCY`, `INVALID_NOTE`, `INVALID_OBSERVED_AT`, `ALREADY_IN_REVIEW` (la identidad ya está abierta en otro lote).

Errores de herramienta: `FORBIDDEN_SCOPE`, `INGEST_PAUSED`, `CLIENT_PAUSED`, `QUOTA_EXCEEDED`, `IDEMPOTENCY_CONFLICT`, `INVALID_INPUT`, `TOO_MANY_CANDIDATES`, `NOT_FOUND`, `INTERNAL_ERROR`.

## 6. Idempotencia

- `idempotencyKey`: 8-128 caracteres `[A-Za-z0-9._:-]`, única **por cliente**.
- La base la garantiza con `offer_batches_mcp_idempotency_uidx (machine_client_id, mcp_idempotency_key)`.
- Se guarda `mcp_payload_hash` = SHA-256 del payload canónico (`runId` + `candidates`, llaves ordenadas).
  - Misma llave + mismo payload: devuelve la respuesta original guardada. No crea otro lote ni consume cuota.
  - Misma llave + payload distinto: `IDEMPOTENCY_CONFLICT`.
- En una carrera, el índice único decide: la segunda llamada relee y responde como replay. Si la primera aún no guardó su respuesta, la segunda recibe `INTERNAL_ERROR` y puede reintentar con la misma llave.
- Un envío sin candidatos válidos también se registra (lote archivado, sin ítems) para que el replay sea estable.

## 7. Estado de un envío

`get_submission_status` sólo devuelve envíos del propio cliente. Uno ajeno o inexistente responde el mismo `NOT_FOUND`.

| Pipeline | Estado público |
|---|---|
| `INGESTED` | `received` |
| `PROCESSING` | `processing` |
| `READY`, `NEEDS_REVIEW` | `in_review` |
| `APPROVED` | `accepted` |
| `PUBLISHED` | `published` |
| `REJECTED` | `rejected` |
| `ERROR` | `invalid` |
| duplicado detectado | `duplicate` |

Rechazos de entrada aparecen como `invalid` con su código. Duplicados en el envío o identidades ya abiertas aparecen como `duplicate`.

## 8. Catálogo público

`check_offer_exists` normaliza la URL igual que el envío y busca por identidad de ingesta, huella de producto y URL exacta. Sólo cuenta `approved`/`published`, no borrada, no vencida y que pase `isPublicCatalogOffer`. Devuelve únicamente `{ "exists": boolean }`. Una tienda no soportada responde `false`.

## 9. Rate limit y cuota

- Bucket dedicado `mcp`: **10 llamadas `tools/call` por minuto por cliente** (`RATE_LIMIT_MCP_PER_MIN`, afectado también por `RATE_LIMIT_MULTIPLIER`), con el Upstash existente.
- Exceso: **HTTP 429**, `Retry-After: 60`, `error.data.code = "RATE_LIMITED"`.
- Preset **sólo distribuido** (`DISTRIBUTED_ONLY_RATE_LIMIT_PRESETS` en `lib/server/rateLimitPolicy.ts`): en **cualquier** runtime (producción, Preview/staging, local) el endpoint responde **HTTP 503** a `tools/call` si:
  - falta `UPSTASH_REDIS_REST_URL` o `UPSTASH_REDIS_REST_TOKEN` (o sólo tienen espacios);
  - Upstash no responde en 1.2 s o devuelve error;
  - `AVENTA_REDIS_ENVIRONMENT` falta, no es `staging`/`production` o no es coherente con `VERCEL_ENV`, la surface o el target de Supabase;
  - el marcador `aventa:<entorno>:environment` del Redis falta o no vale el entorno declarado.
  Nunca cae al contador en memoria ni cambia de entorno. `initialize` y `tools/list` no consumen el bucket.
- Namespace por entorno declarado: todas las claves de rate limit (no sólo `mcp`) van bajo `aventa:<staging|production>:ratelimit` cuando el entorno está declarado y verificado. Ver el contrato de entornos en §14.
- Cuota diaria por cliente: `daily_candidate_cap` (default 200, máximo 1000). Cuenta candidatos válidos enviados desde las 00:00 UTC. Un envío que la exceda se rechaza completo con `QUOTA_EXCEEDED`.
- Límite conocido: dos envíos concurrentes del mismo cliente pueden pasar la cuota por, como máximo, un envío (20 candidatos). El rate limit acota la ventana.

## 10. Seguridad

- Cuerpo máximo 64 KB (HTTP 413), leído con tope aunque no haya `Content-Length`. JSON inválido: 400. Batches JSON-RPC: 400. `GET`/`DELETE`: 405.
- Transporte oficial `WebStandardStreamableHTTPServerTransport`, sin sesión (`sessionIdGenerator: undefined`), respuestas JSON, un servidor por request.
- Sin fetch de URLs en el endpoint (SSRF). La allowlist se aplica antes de crear ítems.
- Auditoría append-only en `machine_client_calls`: cliente, herramienta, request id, resultado, conteos y latencia. Nunca token, cabecera, payload ni contenido de terceros.
- Base de datos:
  - `machine_clients` y `machine_client_calls` con RLS activo y `REVOKE ALL` para `PUBLIC`, `anon`, `authenticated` **y `service_role`** (los privilegios por defecto de Supabase le darían DELETE y TRUNCATE). Sin policies.
  - Grants exactos: `service_role` → `SELECT, INSERT, UPDATE` en `machine_clients`; `SELECT, INSERT` en `machine_client_calls`; `USAGE, SELECT` en su secuencia. Nada más.
  - Triggers (también frenan al owner `postgres`):
    - `machine_clients` no se borra ni se trunca; un cliente revocado es inmutable; prefijo, hash, autor, creador y fecha de creación no cambian.
    - `machine_client_calls` rechaza UPDATE, DELETE y TRUNCATE.

## 11. Aislamiento económico

Invariante: **BOT AUTHOR ⇒ ECONOMICALLY INERT**, para ofertas aprobadas, rechazadas, publicadas, reprocesadas, editadas o restauradas.

Fuente única: `lib/economy/botAuthorFirewall.ts`.

- `isEconomicallyInertAuthor(supabase, userId)`: verdadero si `isBotUserId` (entorno: `BOT_INGEST_USER_ID*`, `MCP_BOT_AUTHOR_USER_IDS`) o si el usuario es `author_profile_id` de cualquier `machine_clients`, en cualquier estado.
- Si la tabla aún no existe, usa sólo el entorno. Cualquier otro error de lectura falla cerrado: el autor se trata como inerte. Consecuencia aceptada: un error transitorio puede omitir un efecto económico de un humano en esa decisión; nunca se acredita a un bot.

Guardas centralizadas:

| Sistema | Archivo |
|---|---|
| Reputación | `lib/server/reputation.ts` |
| Logros | `lib/achievements/sync.ts` |
| Unlock de Rewards | `lib/rewards/unlock.ts` |
| Rewards manual | `lib/rewards/rewardsEngine.ts`, `lib/rewards/manualAttribution.ts` |
| Atribución de comisión | `lib/rewards/attribution/matcher.ts` |
| Participación en Rewards | `lib/rewards/offerParticipation.ts` |
| Ledger / settlement | `lib/economy/settlement/projectLedgerAttribution.ts` |
| Elegibilidad de comisión | `lib/server/commissionEligibility.ts` |
| Notificaciones y correo de moderación | `app/api/admin/moderate-offer/route.ts` |

Además, la oferta de un bot no suma `offers_submitted_count`. No se activó Rewards, no se cambió el money freeze, la infraestructura de pagos ni la semántica de settlement para humanos.

## 12. Autoría

Al aprobar un ítem de un lote MCP, `offers.created_by` = `machine_clients.author_profile_id`. Nunca el moderador, el Owner, `auth.user.id` ni un usuario de sistema. El moderador queda en `offer_batch_item_events` (actor) y en `moderation_logs`. El evento `approved` lleva `author: "machine"` y `machine_client_id`.

Si el autor bot no se puede resolver, la aprobación falla con `MACHINE_AUTHOR_UNAVAILABLE` y no se crea la oferta. Nunca cae al moderador. Los lotes humanos conservan su comportamiento.

Perfil bot:

- Es un perfil normal en `profiles`, sin filas en `user_roles`, distinto del Owner.
- Su id debe estar declarado en `MCP_BOT_AUTHOR_USER_IDS`, así que satisface `isBotUserId`.
- Se muestra con la identidad de bot existente. No es un Hunter.

### Autor bot de staging (identidad técnica de supply MCP)

| Campo | Valor |
|---|---|
| Email Auth | `mcp-supply-staging@aventa.internal` |
| Username | `aventa_mcp_supply_staging` |
| Display | `Aventa MCP Supply (staging)` |
| `app_metadata` | `aventa_machine_author: true`, `mcp_bot_author: true`, `role_hint: mcp_supply` |
| Contraseña | ninguna: la cuenta no puede iniciar sesión |
| `user_roles` | ninguna fila |
| Flags | `role=user`, sin `trusted`, sin auto-aprobación, sin términos de comisiones ni Rewards |

Es distinto del autor de ingesta S7.2 (`aventa_machine_supply`, `BOT_INGEST_USER_ID`). No se reutiliza para MCP: cada pipeline máquina tiene su autor para que la autoría sea trazable.

Se crea con `scripts/mcp-provision-staging-bot-author.ts` (Auth Admin API). Guarda (`evaluateStagingProvisionGuard` en `lib/mcp/preflight.ts`), cualquier discrepancia aborta antes de conectar:

- `AVENTA_TARGET=staging` y `AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr`;
- `NEXT_PUBLIC_SUPABASE_URL` del proyecto staging (producción u otro proyecto: abortar);
- `AVENTA_SUPABASE_TARGET` y `AVENTA_DEPLOYMENT_SURFACE` vacíos o `staging`; nunca `VERCEL_ENV=production` fuera de la superficie staging;
- `SUPABASE_SERVICE_ROLE_KEY` presente y, si es JWT, emitida para staging.

Sólo lee `.env.staging.local` (o `--env-file <ruta>`); ignora el shell y `.env.local` para no mezclar credenciales. No pone contraseña, no crea roles, no toca Rewards ni comisiones, no crea `machine_clients`. Si el usuario ya existe sin `app_metadata.mcp_bot_author`, aborta. Imprime sólo el UUID y un resumen; nunca la key. El UUID va a `MCP_BOT_AUTHOR_USER_IDS` en el entorno staging de Vercel.

## 13. Operación Owner

`/admin/machine-clients` (sólo Owner, vía `requireOwner`):

- Lista nombre, prefijo, estado, scopes, autor bot, cuota diaria, vencimiento y fecha de creación.
- Crear: nombre, perfil bot autor, scopes, cuota y vencimiento opcional (máximo 1 año). El token aparece una vez.
- Pausar: el cliente sigue leyendo; no puede escribir (`CLIENT_PAUSED`). Reanudar lo devuelve a activo.
- Revocar: permanente; el token deja de autenticar (401). La fila se conserva para siempre (el firewall la usa).
- No hay DELETE ni recuperación de token.
- **Rotación**: crear un cliente nuevo con el mismo autor, actualizar el token en xAI y revocar el anterior.

### Ciclo de vida de un cliente

```
(crear, Owner) → active ⇄ paused → revoked (terminal, fila conservada)
                 └─ expires_at vencido → 401 (la fila sigue; crear otro para continuar)
```

| Estado | Auth | Lecturas | `submit_deal_candidates` |
|---|---|---|---|
| `active` | sí | sí | sí, si `MCP_INGEST_ENABLED=true` (si no: `INGEST_PAUSED`) |
| `paused` | sí | sí | `CLIENT_PAUSED` |
| `revoked` / vencido | 401 | no | no |

`CLIENT_PAUSED` y `INGEST_PAUSED` son distintos a propósito: el primero es una decisión del Owner sobre un cliente; el segundo, el kill switch global. En un incidente indica cuál de los dos actuó.

Política de staging para el primer cliente: nombre `Grok · supply MX · staging`, scopes `candidates:submit`, `candidates:read`, `catalog:read`, `daily_candidate_cap=200`, `expires_at` = creación + 90 días.

## 14. Activación en staging

Estado al 2026-10-05:

- [x] Migración aplicada en staging con `apply_migration` (Supabase). Verificado: tablas, 4 columnas en `offer_batches`, 9 índices (incluido `offer_batches_mcp_idempotency_uidx`), RLS sin policies, grants exactos, 5 triggers, 0 filas nuevas, 2 lotes previos intactos.
- [x] Fronteras de base probadas en staging dentro de una transacción revertida: `anon`/`authenticated` sin lectura ni escritura; `service_role` no puede borrar ni truncar, cambiar hash/prefijo/autor, des-revocar, añadir scopes fuera de la lista ni guardar un hash en claro; `machine_client_calls` no se actualiza ni borra (ni como `postgres`); un lote con `machine_client_id` sin llave de idempotencia se rechaza.
- [ ] Autor bot de staging (operador: el repo no tiene service role de staging).
- [ ] Marcador `aventa:staging:environment` en el Redis compartido y variables `UPSTASH_*` + `AVENTA_REDIS_ENVIRONMENT=staging` en staging (operador). Hoy staging no tiene `UPSTASH_*`.
- [ ] `MCP_BOT_AUTHOR_USER_IDS` en el entorno staging de Vercel (operador).
- [ ] Preflight `READY`.
- [ ] Código desplegado en staging (`/api/mcp` responde hoy 404 en `staging.aventaofertas.com`).
- [ ] Smoke y pruebas con MCP apagado.
- [ ] Cliente máquina creado.
- [ ] Activación y E2E.

### Contrato de entornos

| | Producción | Staging / Preview |
|---|---|---|
| Supabase | `mkgsrpsuvedwwlzmzmzh` | `oojshofrpbfwsiypcecr` |
| Redis (Upstash) | Redis físico actual | **el mismo Redis físico** (compartido temporalmente) |
| `AVENTA_REDIS_ENVIRONMENT` | `production` | `staging` |
| Namespace | `aventa:production:*` | `aventa:staging:*` |
| Marcador | `aventa:production:environment = production` | `aventa:staging:environment = staging` |
| Rate limit | `aventa:production:ratelimit:*` | `aventa:staging:ratelimit:*` |
| Feed cache | `aventa:production:feed:*` | `aventa:staging:feed:*` |
| Autor bot MCP | propio de producción | `aventa_mcp_supply_staging` |
| `MCP_INGEST_ENABLED` | apagado | apagado hasta el paso 10 |

Local (sin `VERCEL_ENV`) sólo puede declarar `staging`. Sin declaración no usa Redis aunque tenga `UPSTASH_*` en `.env.local`; así no se conecta por accidente al Redis compartido.

Reglas:

1. **Redis compartido, namespaces separados.** Staging y Production comparten temporalmente el mismo backend físico de Upstash por restricción presupuestaria. El aislamiento se realiza mediante namespaces y marcadores de entorno independientes. Esto NO equivale a aislamiento físico y deberá migrarse a Redis separado antes de que staging maneje datos sensibles, volumen significativo o pruebas de producción.
2. **El entorno se declara, no se deduce.** `AVENTA_REDIS_ENVIRONMENT` es la fuente. `VERCEL_ENV`, `AVENTA_DEPLOYMENT_SURFACE` y el target de Supabase sólo la validan:
   - `preview` ⇒ `staging`;
   - `production` + surface `staging` ⇒ `staging`;
   - `production` sin surface ⇒ `production`;
   - local o `development` ⇒ sólo `staging`;
   - y `resolveAventaSupabaseTarget` debe coincidir.
   Cualquier discrepancia deja el proceso **sin Redis**: MCP responde 503, el feed cache se desactiva y el resto del rate limit aplica su política sin backend (críticos 503 en runtime production, no críticos en memoria). Nunca se cambia de `staging` a `production` ni al revés, y la URL de Redis no se usa para decidir nada.
3. **Marcador por entorno, verificado en runtime y en preflight.** Antes de usar Redis, el proceso lee `aventa:<entorno declarado>:environment` y exige que valga exactamente su entorno. Sólo un acierto se cachea (60 s por instancia). Un marcador ausente, de otro entorno o ilegible equivale a "sin Redis". No existe un marcador global: el antiguo `aventa:environment` se ignora.
4. **Keys sólo dentro del namespace.** Todo acceso de la app pasa por `lib/server/scopedRedis.ts` (feed cache) o `lib/server/rateLimit.ts` (prefijo del limitador). Las keys se construyen con un sufijo relativo; un sufijo que empieza por `aventa:` se rechaza. Un test estructural impide crear clientes Redis en otro sitio.
5. **Production sin declarar (transitorio).** Aventa Production canónica sin `AVENTA_REDIS_ENVIRONMENT` conserva sus keys históricas (`@upstash/ratelimit:*`, `aventa:feed:home:*`) para que el deploy no cambie su comportamiento. En ese modo **MCP responde 503**. Al declarar `production`, los contadores y el cache arrancan vacíos bajo `aventa:production:*` (efecto único y benigno).
6. **Nunca otras credenciales de producción en Preview/staging**: ni Supabase, ni `CRON_SECRET`, ni tokens de terceros. La única excepción aceptada es `UPSTASH_*` del Redis compartido. `CRON_SECRET` no autentica MCP en ningún entorno.
7. **MCP exige backend distribuido.** Sin `UPSTASH_*` válidas o sin entorno verificado, `tools/call` responde 503. No hay fallback en memoria ni bypass.
8. **MCP apagado en el deploy inicial**: `MCP_INGEST_ENABLED` sin definir o `false`.
9. En Vercel, si staging se sirve desde Preview del proyecto de producción, las variables de staging van **sólo** en el scope *Preview*. Si se sirve desde el proyecto dedicado `aventa-staging` (`VERCEL_ENV=production` con `AVENTA_DEPLOYMENT_SURFACE=staging`), van en el scope *Production* de **ese** proyecto. Ver `VERCEL_STAGING_ENVIRONMENT_CONTRACT.md`.

Por qué hay dos marcadores: con un Redis compartido, una key global sólo puede tener un valor y no distingue nada. Cada entorno tiene la suya y el código nunca los escribe; el operador los fija una vez en la consola de Upstash:

```
SET aventa:production:environment production
SET aventa:staging:environment staging
```

**Migración futura a Redis separado** (tarea de infraestructura, no requisito para la activación controlada de MCP):
1. Crear la base nueva.
2. Ejecutar en ella `SET aventa:staging:environment staging`.
3. Cambiar `UPSTASH_*` de staging.
4. Ejecutar el preflight.
5. Borrar las keys `aventa:staging:*` del Redis de producción.

No requiere cambios de código: los namespaces se mantienen.

### Preflight (sólo lectura)

`scripts/mcp-staging-preflight.ts` (lógica en `lib/mcp/preflight.ts`, lectura del marcador en `lib/server/redisEnvironmentMarker.ts`). No escribe en Redis, Supabase ni Vercel. Imprime sólo `PRESENT` / `MISSING` / `INVALID` y notas sin valores.

```bash
vercel env pull .env.preview.local --environment=preview   # o el entorno del proyecto aventa-staging
npx tsx scripts/mcp-staging-preflight.ts --env-file .env.preview.local
# Production (sólo lectura; un único GET a aventa:production:environment):
npx tsx scripts/mcp-staging-preflight.ts --target production --env-file .env.production.local
```

Cada preflight lee sólo el marcador de su entorno: el marcador de production nunca hace pasar a staging ni al revés.

Con `--env-file` evalúa **sólo** ese archivo. Los `.env*.local` están en `.gitignore`. Borra el archivo al terminar.

| Variable / comprobación | Bloquea (`BLOCKED`) si | Pendiente (`NOT_READY`) si |
|---|---|---|
| `VERCEL_ENV` | valor desconocido, o `production` sin `AVENTA_DEPLOYMENT_SURFACE=staging` | — |
| `AVENTA_DEPLOYMENT_SURFACE` | distinto de `staging` (si existe) | — |
| `AVENTA_SUPABASE_TARGET` | inválido o resuelve a `production` | — |
| `NEXT_PUBLIC_SUPABASE_URL` | falta, es producción u otro proyecto | — |
| `AVENTA_EXPECTED_SUPABASE_REF` | falta o ≠ `oojshofrpbfwsiypcecr` | — |
| `MCP_INGEST_ENABLED` | `true`/`1` o valor no reconocido | — |
| `AVENTA_REDIS_ENVIRONMENT` | declara otro entorno, valor no permitido o incoherente con `VERCEL_ENV`/surface/Supabase | falta |
| `UPSTASH_REDIS_REST_URL` | — | falta o no es https |
| `UPSTASH_REDIS_REST_TOKEN` | — | falta o formato inválido |
| `redis:aventa:staging:environment` | — | sin marcador, con otro valor, ilegible o no verificado |

En `--target production`, las mismas comprobaciones exigen:
- `VERCEL_ENV=production` sin surface;
- Supabase `mkgsrpsuvedwwlzmzmzh`;
- `AVENTA_REDIS_ENVIRONMENT=production`;
- el marcador `aventa:production:environment`.
| `MCP_BOT_AUTHOR_USER_IDS` | — | falta, algún valor no es uuid o reutiliza un `BOT_INGEST_USER_ID*` |

Salida: `0` = `READY`, `1` = `NOT_READY` (se puede desplegar con MCP apagado; no crear cliente ni activar), `2` = `BLOCKED` (no desplegar).

### Orden exacto de activación

1. ~~Aplicar `docs/supabase-migrations/20261006_machine_clients_mcp.sql` en staging.~~ Hecho.
2. **Autor bot**: crear `.env.staging.local` (credenciales de staging, `AVENTA_TARGET=staging`, `AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr`) y ejecutar `npx tsx scripts/mcp-provision-staging-bot-author.ts`. Guardar el UUID.
3. **Marcadores en el Redis compartido** (consola de Upstash, una vez):
   - `SET aventa:staging:environment staging`;
   - `SET aventa:production:environment production`.
   Ninguna otra escritura.
4. **Variables de staging en Vercel** (scope correcto, ver regla 9):
   - `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (las del Redis compartido);
   - `AVENTA_REDIS_ENVIRONMENT=staging`;
   - `MCP_BOT_AUTHOR_USER_IDS=<uuid>`;
   - `AVENTA_SUPABASE_TARGET=staging`;
   - `AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr`.
   `MCP_INGEST_ENABLED` se queda sin definir. Conservar `BOT_INGEST_USER_ID*` si existen.
5. **Preflight** contra las variables descargadas de ese entorno: debe dar `READY`. Si da `BLOCKED` o `NOT_READY`, corregir y repetir. No seguir sin `READY`.
6. **Deploy a staging** con MCP apagado. Smoke:
   - `POST /api/mcp` sin `Authorization` → 401 con `WWW-Authenticate: Bearer`;
   - `POST /api/mcp` con `Authorization: Bearer <CRON_SECRET de staging>` → 401;
   - `GET /api/mcp` → 405.
7. **Cliente**: crear desde `/admin/machine-clients` con la política de §13. Guardar el token en el gestor de secretos del operador; se muestra una sola vez.
8. **Pruebas con MCP apagado** contra staging:
   - `get_submission_rules` responde (si responde 503, falta Upstash, `AVENTA_REDIS_ENVIRONMENT` o el marcador: volver a los pasos 3 y 4);
   - token inválido y revocado → 401;
   - `submit_deal_candidates` → `INGEST_PAUSED`;
   - cliente sólo con `catalog:read` → `FORBIDDEN_SCOPE`;
   - pausado → `CLIENT_PAUSED`;
   - cuerpo > 64 KB → 413;
   - 11 `tools/call` en un minuto → 429 `RATE_LIMITED`.
9. Revisar `machine_client_calls`: sólo metadatos.
10. **Sólo entonces**, encender `MCP_INGEST_ENABLED=true` en el entorno staging y redeploy. Enviar 1 candidato real (URL limpia de Amazon MX o Mercado Libre). Verificar en base: `offer_batches.machine_client_id`, `mcp_idempotency_key`, `mcp_payload_hash`, `mcp_run_id`, `created_by` = autor bot, ítem `INGESTED` con `hint_*` y sin `evidence`. Replay con la misma llave → mismo `submissionId`; misma llave con otro payload → `IDEMPOTENCY_CONFLICT`.
11. Procesar el lote desde la consola de lotes, aprobar el ítem (humano) y verificar `offers.created_by` = autor bot ≠ moderador, `status=pending`.
12. Moderar la oferta (humano) y verificar: el moderador queda en `moderation_logs`; el autor bot sigue con `reputation_score=0`, `achievement_xp=0`, sin logros, sin `reward_program_unlocked_at`, sin filas de comisión, ledger ni settlement, sin notificaciones ni correo.
13. Apagar `MCP_INGEST_ENABLED` al terminar si no se sigue probando.

## 15. Activación en producción

Sólo después de completar staging.

1. Aplicar la misma migración en producción (`mkgsrpsuvedwwlzmzmzh`), a mano.
2. Crear el usuario bot de producción y declararlo en `MCP_BOT_AUTHOR_USER_IDS` (Production).

   Usar `scripts/mcp-provision-production-bot-author.ts` (lógica en `lib/mcp/botAuthorProvisioning.ts`).
   - Identidad: `mcp-supply-production@aventa.internal` / `aventa_mcp_supply_production`.
   - Guardas:
     - solo lee `.env.production.local` o un `--env-file` de production;
     - exige `AVENTA_TARGET=production`, ref, URL y una service role key de production;
     - rechaza staging.
   - Por defecto es un ensayo sin escrituras; solo crea con `--apply`.
   - Si el usuario ya existe, lo valida y aborta ante cualquier discrepancia sin modificarlo (metadata, sin inicio de sesión, sin OAuth, username, sin roles, perfil económicamente inerte).
   - Lo único que escribe: `auth.admin.createUser` sin contraseña y el `username` del perfil creado por `handle_new_user`.
3. Confirmar Upstash en Production. Con el marcador `aventa:production:environment = production` ya fijado, declarar `AVENTA_REDIS_ENVIRONMENT=production` (scope Production) y ejecutar `--target production` en el preflight. Sin la declaración, MCP responde 503 (modo histórico, §14 regla 5). El orden importa: si se declara antes de fijar el marcador, el rate limit crítico de producción responde 503 hasta fijarlo. Al declarar, los contadores y el feed cache arrancan vacíos bajo `aventa:production:*`.
4. Desplegar con `MCP_INGEST_ENABLED` apagado. Crear el cliente y configurar xAI.
5. Encender `MCP_INGEST_ENABLED=true` y vigilar `machine_client_calls` y la cola de lotes.

## 16. Apagado de emergencia

En orden de alcance:

1. **Un cliente**: pausar o revocar en `/admin/machine-clients`. Efecto inmediato.
2. **Toda la escritura**: `MCP_INGEST_ENABLED=false` (o quitarla) y redeploy. Las lecturas siguen disponibles.
3. **Todo el endpoint**: revocar todos los clientes. Sin cliente válido todo responde 401.

Los lotes ya recibidos siguen en la cola y pueden rechazarse desde la moderación de lotes.

### Manejo de incidentes

| Señal | Acción inmediata | Después |
|---|---|---|
| Token filtrado (logs, chat, repo) | Revocar el cliente | Crear uno nuevo, actualizar xAI, revisar `machine_client_calls` desde la fecha de fuga |
| Ráfaga de envíos basura | Pausar el cliente | Rechazar los lotes desde la consola; bajar `daily_candidate_cap` en un cliente nuevo |
| Lote MCP aprobado por error | Rechazar o despublicar la oferta desde moderación | Nunca hay efecto económico para el autor bot; no hace falta revertir economía |
| Sospecha de efecto económico en el bot | `MCP_INGEST_ENABLED=false` | Revisar `profiles` del autor (reputación, XP, unlock), comisiones, ledger y settlement; reportar como incidente de firewall |
| 503 en `/api/mcp` | Revisar Upstash, `AVENTA_REDIS_ENVIRONMENT`, el marcador del entorno y Supabase | Es el comportamiento esperado sin backend o con entorno incoherente; no añadir bypass |

Consultas útiles (sólo lectura):

```sql
select tool, result_status, count(*), max(latency_ms)
from public.machine_client_calls
where created_at > now() - interval '1 hour'
group by 1, 2 order by 3 desc;

select id, status, total_items, created_at
from public.offer_batches
where machine_client_id is not null
order by created_at desc limit 20;
```

## 17. Rollback

- Código: revertir los commits de esta integración. Los lotes MCP existentes quedan como lotes normales; no hay ofertas sin moderación.
- Base: la migración es aditiva. No hace falta revertirla. Si se exige:
  - quitar primero `offer_batches_mcp_origin_consistency`, `offer_batches_mcp_idempotency_uidx` e `idx_offer_batches_machine_client_created`;
  - luego las columnas `mcp_*` y `machine_client_id`;
  - por último las tablas.
  
  Mientras existan ofertas de autores bot, conserva `machine_clients`: el firewall económico la usa.

## 18. Limitaciones conocidas

- La cuota diaria tiene una carrera acotada a un envío concurrente (ver §9).
- Si el guardado de la respuesta falla tras crear el lote, el replay devuelve `INTERNAL_ERROR` en vez de la respuesta original. El lote existe y no se duplica.
- El procesamiento del lote lo dispara staff. MCP no lo automatiza.
- xAI no soporta `require_approval` en MCP remoto: todo el control vive en Aventa (auth, scopes, kill switch, cuota, moderación humana).
- La migración está aplicada **sólo en staging** (2026-10-05). En producción no.
- Una llamada rechazada por rate limit (429/503) no deja fila en `machine_client_calls`: ocurre antes de resolver la herramienta.
- Redis compartido entre staging y production: el aislamiento es lógico, no físico. Un token de Upstash compartido permite técnicamente a quien lo tenga leer o borrar keys del otro entorno; el código nunca lo hace, pero el riesgo existe fuera del código. También comparten cuota, memoria y latencia de Upstash: una ráfaga en staging puede afectar a production.
- El marcador verificado se cachea 60 s por instancia: si alguien cambia el marcador, las instancias vivas tardan hasta 60 s en notarlo.
