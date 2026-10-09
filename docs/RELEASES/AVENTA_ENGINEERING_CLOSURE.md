# Cierre de ingeniería — community-launch-closure

Verificado el 2026-10-09. Este archivo no cambia el runtime ni autoriza un despliegue.

El manifiesto `docs/RELEASES/AVENTA_V1_RELEASE_MANIFEST.md` describe un cierre anterior. El candidato actual es el de esta página.

## A. Resumen ejecutivo

La rama `community-launch-closure` está en `ff4a48a4ea4a41160926c177b11ad9cf959b422c`, alineada con `origin`. El árbol estaba limpio al empezar esta verificación. Producción sigue en `master` / `6f54bb5ea22345be05ea62005070f78dead638d2` (`aventa-ddnakfhbp`, READY). No se autoriza merge ni despliegue a producción.

Validado en el candidato: CI `verify`, 13 flujos E2E en staging, retirada durable del feed, copy de recompensas pausadas, perfil de carga de solo lectura y rechazo de destinos de producción.

Preparado y no probado: el procedimiento de restauración. WAL-G está activo, PITR está apagado y la lista de backups sigue vacía. No hay RPO ni RTO.

Bloqueado por el propietario: activar un backup recuperable y restaurarlo en un proyecto nuevo. La monetización permanece congelada. `COMMISSION_PROGRAM_ACTIVE` en producción y `REWARDS_PROGRAM_ACTIVE` en preview no se pudieron leer.

## B. Matriz de requisitos

| ID | Área | Criterio | Estado | Evidencia | Fecha | Cómo repetir | Siguiente paso |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REL-01 | Release | El candidato está identificado y producción no lo ejecuta | VERIFIED | HEAD `ff4a48a`. Producción `6f54bb5` en `master` | 2026-10-09 | `git rev-parse HEAD`; `npx vercel ls aventa-new --scope aventa-oficial --prod` | Propietario, si autoriza el release |
| REL-02 | Comunidad | 13 flujos E2E ejecutados en staging | VERIFIED | GitHub Actions `37893635652`: 13 passed, 0 skipped | 2026-10-09 | Workflow E2E en `community-launch-closure` | Mantener los secretos `E2E_*` de staging |
| REL-03 | CI | `npm run ci:verify` en el candidato | VERIFIED | Run `37893635544` success. Incluye typecheck, contratos, launch tests y build | 2026-10-09 | Workflow CI | Ninguno para este SHA |
| REL-04 | Carga | El perfil rechaza producción y no cuenta 4xx como éxito | VERIFIED | `tests/launch/loadTarget.test.ts` y `scripts/load-read-profile.mjs` | 2026-10-09 | `npx vitest run tests/launch/loadTarget.test.ts` | Ninguno |
| REL-05 | Carga | Diagnóstico del 429 del feed | VERIFIED | Ver sección de carga. Clasificación `EXPECTED_RATE_LIMIT` | 2026-10-09 | Sonda de lectura contra un preview de staging | No subir el límite para la prueba |
| REL-06 | Dinero | Flags de pago cerrados donde se pudieron leer | VERIFIED | Producción: rewards y payout no activos, settlement ausente, money path frozen, proveedor ausente | 2026-10-09 | Lectura clasificada de env, sin imprimir valores | No activar nada |
| REL-07 | Dinero | Secretos monetarios no leíbles | BLOCKED | `COMMISSION_PROGRAM_ACTIVE` producción y `REWARDS_PROGRAM_ACTIVE` preview: `UNVERIFIED` | 2026-10-09 | El propietario los lee en el panel | No inferirlos desde el código |
| REL-08 | Datos | Restauración real en un proyecto nuevo | BLOCKED | `node scripts/restore-checklist.mjs` sale 2. PITR off, 0 backups, WAL-G on | 2026-10-09 | El mismo comando | Propietario: backup o PITR, luego restore aislado |
| REL-09 | Lint | `npm run lint` en el pipeline | NOT_REQUIRED | `ci:verify` no ejecuta lint. No se añadió: el job ya cubre typecheck, tests y build | 2026-10-09 | `npm run lint` si se quiere fuera de CI | No bloquear el release por un lint nuevo |

## C. Evidencia de pruebas

Ejecutado en esta verificación, 2026-10-09:

- Estado git: rama `community-launch-closure`, HEAD `ff4a48a`, árbol limpio, tracking al remoto.
- Producción: deployment READY `6f54bb5` en `master`. Ref de Supabase de producción leído del env: `mkgsrpsuvedwwlzmzmzh`. Preview: `oojshofrpbfwsiypcecr`.
- Sonda de feed, una IP, secuencial, preview aislado: 120 respuestas 200 y la 121 en 429 con `{"error":"Too many requests"}`. 33.2 s. Sin cabecera `retry-after`.
- `node scripts/restore-checklist.mjs`: exit 2. Ambos proyectos con `walg: true`, `pitr: false`, `listedBackups: 0`.
- `npm run ci:verify` en este árbol: exit 0. El único cambio pendiente es este documento.

Evidencia del mismo SHA, anterior a este documento y no reejecutada aquí:

- CI `37893635544` (`npm run ci:verify`) success.
- E2E `37893635652`: `{"total":13,"executed":13,"passed":13,"failed":0,"skipped":0}` contra el preview de staging.
- Carga elevada previa en el mismo preview, 8 concurrentes, 12 s: feed 405×200 y 8×429, 33.25 rps útiles; health 300×200 y 0×429. Caché del feed `MISS`.

Lint no se ejecutó. No forma parte de `ci:verify`.

## D. Riesgos residuales

| Riesgo | Impacto | Probabilidad | Detección | Mitigación | Cierre | Dependencia |
| --- | --- | --- | --- | --- | --- | --- |
| No hay punto de restauración | Pérdida de datos sin recuperación medida | Alta mientras la lista siga vacía | `scripts/restore-checklist.mjs` exit 2 | No desplegar el candidato a producción hasta el restore aislado | Un restore real en un proyecto nuevo | Panel de Supabase y, si hace falta, un plan de pago |
| Preview sin `AVENTA_REDIS_ENVIRONMENT` | El límite de 120/min del feed es por instancia, no global | Ya observado | `X-Feed-Cache: MISS` y más de 120 lecturas 200 en paralelo | La política de código ya lo describe. No relajar el límite | Declarar el entorno Redis de staging si se quiere un contador compartido | Config de preview, sin cambiar producción |
| `REWARDS_PROGRAM_ACTIVE` de preview no leíble | Un secreto activo mostraría pagos en ese preview | Desconocida | La UI de `/me/recompensas` en el E2E mostró el copy de pausa | No sobrescribir el secreto a ciegas | Lectura del propietario | Panel de Vercel |
| `COMMISSION_PROGRAM_ACTIVE` de producción no leíble | No se puede afirmar que las comisiones legacy estén apagadas | Desconocida | El código no usa ese flag para activar recompensas | Rewards y payout leídos están apagados; money path frozen | Lectura del propietario | Panel de Vercel |

## Carga y HTTP 429

Clasificación: `EXPECTED_RATE_LIMIT`.

`GET /api/feed/home` llama a `enforceRateLimitCustom('feed:' + ip, 'feed')`. El preset es 120 por minuto (`RATE_LIMIT_FEED_PER_MIN`). El cuerpo 429 es el de `app/api/feed/home/route.ts`: `Too many requests`.

En preview `AVENTA_REDIS_ENVIRONMENT` no está declarado, así que `resolveRedisAccess` queda en `none` y el feed usa el contador en memoria de la instancia. No es crítico: si Redis falta, no responde 503. Health no usa ese preset. En la carga elevada, health no recibió 429 y el feed sí, con la misma IP y el mismo host.

La sonda secuencial de esta verificación clavó una instancia: el corte fue exactamente la solicitud 121. La carga de 8 concurrentes dejó pasar 405 de 413 porque varias instancias no comparten el contador. Eso coincide con el comentario de `lib/server/rateLimit.ts`. No es un defecto ni un límite de Vercel. No se cambia el límite.

Esta medición no dice cuántos usuarios simultáneos soporta producción.

## Checklist de lanzamiento

Tres puertas. La comunitaria no exige monetización. La de pagos no se abre con este checklist. La de escala no se abre sin restore y sin un contador de capacidad en el entorno que vaya a recibir tráfico.

### Comunitario

- [x] Descubrimiento, ficha, publicación `pending`, voto, comentario, favorito, retirada `approved` y `published`, segundo cliente, refresco y paginación. E2E `37893635652`.
- [x] Un usuario sin rol de staff no retira la oferta. El E2E acepta 401 o 403 y comprueba que la oferta sigue en el feed.
- [x] Copy de recompensas pausadas en `/me/recompensas`.
- [ ] Registro e inicio de sesión de un usuario nuevo en el navegador de producción. El E2E inicia sesión con cuentas sintéticas de staging.
- [ ] Perfil y navegación móvil en un dispositivo real. No ejecutado.
- [x] Separación de entornos: producción `mkgsrpsuvedwwlzmzmzh`, staging `oojshofrpbfwsiypcecr`. Los scripts de carga y E2E rechazan el ref de producción.
- [x] Rollback conocido: redesplegar el deployment de producción de `6f54bb5` (`aventa-ddnakfhbp`, 2026-10-08). Esta rama no trae migraciones.
- [ ] Backup restaurable. Bloqueado. Ver runbook.

### Monetización — no activar

- [x] `REWARDS_PROGRAM_ACTIVE` de producción leído y no activo.
- [x] `REWARDS_PAYOUT_ENABLED` de producción leído y no activo.
- [x] `SETTLEMENT_BRIDGE_ENABLED` ausente. El código solo se activa con true, 1 o yes.
- [x] `MONEY_PATH_FROZEN` de producción y de preview leído como congelado.
- [x] `PAYOUT_PROVIDER` ausente en ambos.
- [x] `BOT_INGEST_MACHINE_PENDING_WRITES` ausente en ambos.
- [ ] `COMMISSION_PROGRAM_ACTIVE` de producción: `UNVERIFIED`.
- [ ] `REWARDS_PROGRAM_ACTIVE` de preview: `UNVERIFIED`. El E2E de staging mostró el copy de pausa.
- [ ] Atribución de Mercado Libre conciliada con el ledger. No forma parte del release comunitario.
- [ ] Antifraude y autorización explícita antes de cualquier descongelación.

### Escala

- [x] Límite de abuso del feed identificado: 120/min por IP en la instancia que atiende la petición.
- [ ] Contador distribuido en el entorno que reciba tráfico público. Preview no declara Redis.
- [ ] Restore medido.
- [ ] Capacidad de producción medida. Prohibido extrapolar el preview.

### Analítica existente

No se añade un sistema nuevo. Lo que el código ya registra, sin tratarlo como venta confirmada:

- Visitas y observaciones de feed: eventos de producto y `offer_events` (`view`).
- Registros: `profiles.created_at`.
- Ofertas consultadas, votos, favoritos y comentarios: tablas `offer_events`, `offer_votes`, `offer_favorites`, `comments`.
- Clics salientes: `offer_events.outbound` y `cazar_cta`. Un clic no es una venta.
- Ventas confirmadas: solo un informe del proveedor de afiliación conciliado. No hay esa conciliación verificada.

### Operación

- Salud: `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/health/distribution-env`.
- Integridad: cron `/api/cron/system-integrity`. Si falla, el payload trae el check, la severidad y la acción. Feed caído: `feed.home.smoke`. Vista de ranking: `view.ofertas_ranked_general`.
- Sonda de lectura: `BASE_URL=https://<preview-aislado> node scripts/ops-smoke.mjs`.
- Suspensión: no desplegar el candidato si el checklist de restore sale 2, si el E2E deja de estar en 13/13, o si un flag monetario aparece activo.
- Escalamiento: el propietario decide restore, lectura de secretos `UNVERIFIED` y el merge a `master`.

## Runbook de backup y restauración

Estado al 2026-10-09: no recuperable. No ejecutar restore sobre `mkgsrpsuvedwwlzmzmzh`.

### Datos críticos

`profiles`, `user_roles`, `offers`, `offer_votes`, `offer_favorites`, `offer_events`, `comments`, `moderation_logs`, `creator_rewards`.

### Método disponible

`npx supabase backups list --project-ref <ref> -o json`, o `node scripts/restore-checklist.mjs`. Un backup solo cuenta si `pitr_enabled` es true o `backups` tiene elementos. WAL-G activo con lista vacía no es un punto de restauración. El restore del CLI es PITR en el mismo proyecto: no usarlo en producción.

### Cuando el propietario habilite un punto

1. Crear un proyecto Supabase nuevo. No reutilizar producción ni staging.
2. Restaurar hacia ese proyecto desde el punto listado. Anotar hora de inicio, hora de fin y el error si lo hay.
3. RPO: diferencia entre el instante del backup y el dato más reciente que debía existir. RTO: diferencia entre el inicio de la restauración y el primer health 200 del proyecto nuevo. Hasta entonces ambos son no medibles.
4. En el proyecto nuevo, comprobar que existen las tablas de arriba y que `user_roles` no es escribible por `anon`.
5. Apuntar un deployment de preview, no producción, a ese proyecto y abrir `/api/health` y `/api/feed/home`.
6. Confirmar que el ref restaurado no es `mkgsrpsuvedwwlzmzmzh`.

Acción mínima del propietario: en el panel de Supabase, activar backups diarios o PITR. Si el plan actual no lo permite, hace falta su autorización de gasto. No se contrata desde este repositorio.

## CI

- `.github/workflows/ci.yml`: en pull request y en push a `master` y `community-launch-closure`. Ejecuta `npm run ci:verify` con claves ficticias de Supabase. No usa secretos de producción.
- `.github/workflows/e2e.yml`: push a la rama candidata y `workflow_dispatch`. Usa solo secretos `E2E_*` de staging. Si un caso se omite o falla, `scripts/e2e-summary.mjs` rechaza el job. No se duplicó el job de `verify`.

## Qué no se autoriza

Merge a `master`, despliegue de producción, migraciones de producción, cambio de plan de Supabase, activación de recompensas, payouts, settlement o escrituras de bots en producción.
