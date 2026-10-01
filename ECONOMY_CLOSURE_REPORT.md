# ECONOMY CLOSURE REPORT

Fecha de verificación: 2026-09-30

## 1. STATUS

ECONOMY HARDENING CLOSED

MONEY PATH REMAINS FROZEN

Aventa no puede mover dinero real. No hay un proveedor externo verificable que confirme que un peso salió. El kill-switch sigue activo y su default no se tocó.

## 2. EXACTLY WHAT WAS CLOSED

- La presentación de un reward `PAID` ya no basta para decir "Entregada". La autoridad es `lib/rewards/payoutReadModel.ts`.
- `POST` y `PATCH` de `/api/admin/affiliate-ledger`, el import CSV y las mutaciones de `/api/admin/rewards` rechazan la escritura mientras `isMoneyPathFrozen()` es verdadero. La respuesta es 503 con `code: money_path_frozen`.
- La creación de un reward y sus audits `reward_created` y `reward_validating` viven en una sola función SQL. Si el audit no queda escrito, la función hace `RAISE` y PostgreSQL revierte la fila.
- `UNKNOWN` no pasa a `SUCCEEDED` ni a `PAID` si la única referencia sería una inventada por el proceso (`confirmed:`, `reconcile:`).
- Un retry de payout no crea una segunda intención: la clave de idempotencia sigue siendo única.
- Los cinco cierres ya commiteados siguen en el branch: settlement audit fail-closed, conversión que no se borra si falla el audit, recovery de comisiones reversadas, lectura solo de reversals pendientes, y ledger de staff bloqueado con el freeze.
- La atribución manual sigue siendo la misma autoridad (`assignManualLedgerAttribution` → `createRewardFromLedgerEntry`). Registra operador, momento, motivo y ledger. Exige `actorId`. No crea rewards por su cuenta.
- El click de salida y la extensión no crean comisión, reward ni payout.

## 3. REMAINING BLOCKERS

Estos bloqueos son dependencias externas o de despliegue. No son huecos de arquitectura sin resolver en el código de esta fase.

1. No existe un proveedor bancario o de red que devuelva evidencia externa real. `manual_spei` y `stub` son adaptadores locales. Un `SUBMITTED` confirmado en local todavía puede fabricar la referencia `confirmed:<idempotency_key>` si el camino se descongela. Eso no es un pago externo.
2. `create_creator_reward_with_creation_audit` está en `docs/supabase-migrations/20260930_reward_creation_atomic.sql` y no está aplicada en producción (`mkgsrpsuvedwwlzmzmzh`) ni en staging (`oojshofrpbfwsiypcecr`). El catálogo de ambas devolvió cero filas para esa función. No se aplicó fuera del flujo de migración. Mientras falte, el engine responde `schema_missing` y no inserta el reward.
3. Este código está en `feature/hunter-lab-candidate-intelligence`. No está en `origin/master` y no está desplegado en producción. Producción sigue en `3ca2078`.
4. Hay rewards históricos `PAID` sin intent `SUCCEEDED`. No se rellenaron. No se presentan como "Entregada".
5. `self_click` y `anonymous_click` se rechazan en aplicación. No se añadió un `CHECK` de base de datos: haría falta una política nueva de identidad del click y no se inventó. La unicidad de ledger, conversión, comisión e intent sí está en la base.

## 4. MONEY_PATH_FROZEN STATUS

ACTIVO.

`lib/server/moneyPathFreeze.ts` no se modificó. En runtime de producción, un valor ausente o inválido congela. Solo `false`, `0`, `no` u `off` explícitos descongelan. No hay flag, query, header, rol ni `force` que lo salte. `force` en rewards solo puede saltar `REWARDS_PROGRAM_ACTIVE`.

## 5. REWARD STATE MACHINE

Estados: `PENDING` / `VALIDATING` → `AVAILABLE` → `PAID`.

Terminales: `CANCELLED`, `REVERSED`.

La creación escribe `VALIDATING` dentro de la función atómica. El hold vencido hace compare-and-set de `VALIDATING` a `AVAILABLE` y no crea un payout. `PAID` solo lo escribe `confirmPayoutIntentSuccess`, con compare-and-set desde `AVAILABLE`.

No hay transición de `PAID` hacia `AVAILABLE`, `CANCELLED` o `REVERSED`, ni de `CANCELLED` o `REVERSED` hacia `PAID`. Esas rutas devuelven `reward_terminal` o no actualizan la fila.

## 6. PAYOUT STATE MACHINE

`RESERVED` → `SUBMITTED` → `SUCCEEDED` / `FAILED` / `UNKNOWN`.

`UNKNOWN` no es `SUCCEEDED`.

`UNKNOWN` → `SUCCEEDED` exige una referencia de proveedor que no empiece por `confirmed:`, `reconcile:` ni `reconcile_fail:`. Si el proveedor dice éxito sin esa referencia, el intent queda `UNKNOWN` o la confirmación devuelve `evidence_missing`. No se crea una segunda intención ni otra idempotency key.

El compare-and-set del intent usa el estado previo esperado. Un `SELECT` seguido de un `UPDATE` ciego no es el camino de éxito.

## 7. ATTRIBUTION CONTRACT

Cadena:

oferta → click de salida (`POST /api/track-outbound`, escribe el click atribuido, no dinero) → `resolveCommissionAttribution` → conversión → comisión → settlement → `affiliate_ledger_entries` → `createRewardFromLedgerEntry` → payout intent → evidencia externa (ausente) → audit.

La atribución automática de baja confianza no crea reward (`low_confidence`). La confianza media va a revisión de staff (`pending_staff_review`) y no crea reward.

La atribución manual es una autoridad de negocio que ya existía. `assignManualLedgerAttribution` deriva el creador de `offers.created_by`, guarda `manual_attribution` con `operator_id`, `attributed_at` y `reason`, escribe `manual_attribution_assigned`, y llama al mismo engine. Sin `actorId`, el engine responde `manual_actor_required`.

La pregunta "¿por qué existe este reward?" se responde con `ledger_entry_id`, el método y la confianza de atribución, y los audits `reward_created` / `reward_validating`. Si es manual, el metadata incluye actor, momento y motivo.

## 8. IDEMPOTENCY CONSTRAINTS

Claves de aplicación:

- Reward: un ledger produce un reward. El conflicto `23505` reutiliza la fila existente.
- Payout: una idempotency key por intent y un intent por reward. El retry reutiliza la misma key.
- Settlement de reward: `ledger_settlements.ledger_entry_id` único antes del insert monetario.
- Conversión, comisión y ledger externo: índices únicos listados en la sección 9.

## 9. DATABASE CONSTRAINT VERIFICATION

Consultado el catálogo real el 2026-09-30. Producción y staging tienen las mismas definiciones. Estado: presente. No se creó una migración duplicada. No se borró ninguna fila.

| Nombre | Tabla | Columnas | Tipo | Estado |
| --- | --- | --- | --- | --- |
| `creator_rewards_ledger_entry_id_key` | `creator_rewards` | `ledger_entry_id` | UNIQUE | presente en producción y staging |
| `payout_intents_reward_unique` | `payout_intents` | `reward_id` | UNIQUE | presente en producción y staging |
| `payout_intents_idempotency_unique` | `payout_intents` | `idempotency_key` | UNIQUE | presente en producción y staging |
| `affiliate_conversions_external_unique` | `affiliate_conversions` | `source, network, external_conversion_id` | UNIQUE | presente en producción y staging |
| `affiliate_commissions_conversion_unique` | `affiliate_commissions` | `conversion_id` | UNIQUE | presente en producción y staging |
| `affiliate_commissions_external_unique` | `affiliate_commissions` | `source, network, external_commission_id` | UNIQUE | presente en producción y staging |
| `affiliate_commissions_ledger_entry_unique` | `affiliate_commissions` | `ledger_entry_id` donde no es null | UNIQUE parcial | presente en producción y staging |
| `affiliate_ledger_unique_external_per_network` | `affiliate_ledger_entries` | `network, external_ref` si el ref no está vacío | UNIQUE parcial | presente en producción y staging |
| `ledger_settlements_ledger_entry_id_key` | `ledger_settlements` | `ledger_entry_id` | UNIQUE | presente en producción y staging |

GAP: `public.create_creator_reward_with_creation_audit(jsonb)` no existe en producción ni en staging. La migración está en el repositorio. Aplicarla es requisito previo a descongelar, por el flujo de migraciones, no a mano.

## 10. ANTIFRAUD

Siguen cerrados en aplicación, antes de crear el reward: `self_click`, `anonymous_click`, confianza baja, confianza media, monto cero, ledger `void` o `reversed`, programa inactivo y `MONEY_PATH_FROZEN`.

`force` no salta freeze, antifraude, idempotencia ni estados terminales.

No se añadieron reglas de dispositivo, IP, ventana temporal ni fingerprint.

## 11. AUDIT ATOMICITY

La función `create_creator_reward_with_creation_audit` inserta el reward y, en la misma transacción, `reward_created` y `reward_validating`. Si cualquiera de los audits no escribe una fila, hace `RAISE EXCEPTION 'reward_creation_audit_failed'` y PostgreSQL revierte el reward.

El engine no hace `insert` y luego `try/catch` del audit. Llama a la función. Si la función no existe, libera el claim de settlement cuando corresponde y devuelve `schema_missing` sin `created: true`. Si el audit aborta, devuelve `audit_append_failed` sin `rewardId`.

Una fila ya existente que solo necesita certificar su audit sigue el camino de recuperación: no se borra. Eso es distinto de la creación nueva.

Los audits de payout (`reward_paid`, `payout_intent_succeeded`) siguen siendo obligatorios para la certificación de presentación. Si faltan, no hay "Entregada".

## 12. CONCURRENCY

- Dos workers sobre el mismo ledger chocan con `ledger_settlements` único y con `creator_rewards_ledger_entry_id_key`. El perdedor recibe `duplicate_ledger`.
- Dos payouts del mismo reward chocan con `payout_intents_reward_unique`.
- Dos retries con la misma clave chocan con `payout_intents_idempotency_unique` y reutilizan el intent.
- `CANCELLED` o `REVERSED` concurrentes con un payout devuelven `reward_terminal`.
- El paso a `PAID` y a `SUCCEEDED` es compare-and-set sobre el estado previo.

## 13. RECOVERY

`list_pending_settlement_reversal_commissions` lee solo reversals pendientes. Se puede reanudar después de un crash. Un reversal ya completado no vuelve a procesarse.

`UNKNOWN` no se reinterpreta como éxito. No se crea un segundo payout para "resolverlo". La idempotency key se conserva. Hace falta una referencia externa válida para salir de `UNKNOWN` hacia `SUCCEEDED`.

## 14. PAYOUT CERTIFICATION

`presentCreatorReward` devuelve `Entregada` solo si el status es `PAID` y la certificación trae las tres pruebas: intent `SUCCEEDED`, audit `reward_paid`, audit `payout_intent_succeeded`.

Si falta cualquiera, el status interno puede seguir siendo `PAID` y la etiqueta es "En validación". No se inventó otro estado de éxito. No se modificó el estado económico para satisfacer la UI. No se rellenaron históricos.

Otras etiquetas: `AVAILABLE` → "Lista"; `VALIDATING` y `PENDING` → "En validación"; `CANCELLED` → "Cancelada"; `REVERSED` → "Revertida", con `uiStatus` cancelado. Un registro sintético pagado dice "Prueba QA (no es pago real)".

`GET /api/me/rewards` usa ese read model. La ruta no contiene la etiqueta "Entregada".

## 15. EXTERNAL PROVIDER LIMITATION

No hay integración con un proveedor externo verificable.

Los adaptadores `stub` y `manual_spei` pueden devolver una referencia local (`stub:success`, `manual_spei:<idempotency_key>`). Eso ejercita la máquina de estados en tests. No demuestra que un banco recibió el pago.

Si un submit o un reconcile dicen éxito sin una referencia no sintética, el intent permanece `UNKNOWN` o la operación falla con `evidence_missing`. No hay camino `UNKNOWN` → `PAID` con la referencia inventada `confirmed:<idempotency_key>`.

El camino local de confirmar un intent `SUBMITTED` todavía puede usar esa referencia sintética cuando el freeze está apagado. Por eso el freeze no se apaga en esta fase. Hasta que un proveedor real entregue una referencia y ese atajo sintético deje de poder marcar `PAID`, Aventa no mueve dinero.

## 16. TEST EVIDENCE

`npx vitest run tests/rewards tests/economy`

Resultado: 47 archivos pasaron, 1 omitido por la suite existente. 576 tests pasaron, 6 omitidos. 0 fallos. No se desactivó ningún test ni se debilitó una aserción para esconder un fallo.

La matriz nueva cubre certificación de payout, rollback del audit, atribución manual, antifraude, freeze del ledger admin y el rechazo de `UNKNOWN` sin referencia externa. Los tests de concurrencia de settlement y de confirmación de payout que ya existían siguen pasando, con el doble de `rpc` atómico en lugar de un insert suelto.

## 17. TYPECHECK

`npx tsc --noEmit` terminó con código 0. Se ejecutó solo, no en paralelo con el build.

## 18. BUILD

`npm run build` terminó con código 0.

`npx eslint` sobre los archivos económicos de esta fase terminó con código 0.

## 19. GIT COMMITS

Branch: `feature/hunter-lab-candidate-intelligence`.

Sin push, sin merge, sin cambios a `master` y sin cambios a PR #32.

Los cinco commits previos siguen siendo ancestros y no se reescribieron:

- `0913c0d` Close settlement audit fail-closed behavior
- `2dcd0c8` Keep conversion rows when mandatory audit append fails
- `32c6333` Route reversed commissions through settlement reversal recovery
- `b73f79f` Read only pending settlement reversals for durable recovery
- `5d52dfa` Block staff ledger edits while the money path is frozen

Commits de esta fase:

- `07880e2` fix(economy): enforce payout certification
- `6c8cdb4` fix(economy): enforce money freeze on admin ledger
- `a009a17` fix(economy): make reward creation audit atomic
- `5404922` fix(economy): harden reward invariants and concurrency
- `a5f08bd` test(economy): add adversarial closure matrix
- `159c265` docs(economy): record hardening closure

El árbol de trabajo conserva cambios ajenos a esta fase, incluido el selector de periodo de `/api/staff/finance`. No se mezclaron `/me`, acquisition ni cron de adquisición. El cron que sí entró es `rewards-release-holds`, porque reporta fallo cuando el audit del hold no se escribe.

## 20. WHAT MUST HAPPEN BEFORE MONEY_PATH_FROZEN CAN EVER BE DISABLED

1. Desplegar estos commits. El código de producción actual no los contiene.
2. Aplicar `docs/supabase-migrations/20260930_reward_creation_atomic.sql` por el flujo de migraciones y comprobar que `create_creator_reward_with_creation_audit` existe en la base objetivo.
3. Conectar un proveedor externo real cuya respuesta de éxito traiga una referencia que este proceso no invente. Conservar la idempotency key de extremo a extremo.
4. Eliminar el atajo que permite marcar `SUCCEEDED` / `PAID` con `confirmed:<idempotency_key>` en un intent `SUBMITTED`.
5. Volver a leer el catálogo y demostrar las unicidades de la sección 9 en esa base.
6. No rellenar rewards históricos `PAID` para que parezcan entregados.
7. Solo entonces, y con una decisión explícita, poner `MONEY_PATH_FROZEN` en `false`. Hasta ese momento el default de producción debe seguir congelado.

Hasta que eso ocurra, el cierre correcto es: la economía quedó endurecida y el camino de dinero sigue congelado.
