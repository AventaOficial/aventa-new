# Fase 0 real: blindaje del sistema

Fecha: 27 de marzo de 2026

Objetivo: reducir riesgo de lanzamiento con defensa de entrada, fail-safes explícitos e integridad automática ampliada.

## Qué se implementó

## 1) Validación obligatoria en endpoints críticos (Zod)

Se añadió `zod` y contratos en:

- `lib/contracts/offers.ts`
- `lib/contracts/votes.ts`
- `lib/contracts/feed.ts`

Aplicado en:

- `app/api/offers/route.ts`
- `app/api/votes/route.ts`
- `app/api/feed/home/route.ts`
- `app/api/feed/for-you/route.ts`

Comportamiento:

- Entrada inválida => `400` con error claro.
- No pasa validación => no se persiste nada.

## 2) Fail-safes explícitos

## Matriz operativa

| Caso | Endpoint | Comportamiento |
|---|---|---|
| Payload inválido (faltan campos / tipos) | `/api/offers` | `400`, no inserta |
| Precio negativo | `/api/offers` | `400`, no inserta |
| Voto fuera de rango | `/api/votes` | `400`, no escribe |
| UUID de oferta inválido | `/api/votes` | `400`, no escribe |
| Query inválida | `/api/feed/home`, `/api/feed/for-you` | `400`, no ejecuta query peligrosa |
| Falla de columnas nuevas (`bank_coupon`, `tags`) | `/api/offers` | fallback de inserción sin romper publicación |
| Error de vista en feed personalizado | `/api/feed/for-you` | fallback a tabla `offers` |

## 3) Integridad automática ampliada

Se extendió `lib/server/systemIntegrity.ts` con checks adicionales:

- `offers.required_fields.integrity`
  - títulos vacíos/nulos
  - tienda vacía/nula
  - precio negativo
- `offer_votes.value.integrity`
  - votos fuera de `-1` y `2`
- `view.score_consistency`
  - valida `score == up_votes*2 - down_votes` en muestra de vista
- `runtime.exception`
  - ahora reporta explícitamente `ok` cuando no hay excepción

Resultado:

- Mayor detección temprana de corrupción y desalineación.

## 4) Unificación de fórmula de score

Se consolidó en:

- `lib/offers/scoring.ts`

Con uso en:

- `/me`, `/me/favorites`, perfil público, realtime y fallbacks de feed.

Regla única:

- `score = upvotes * 2 - downvotes`

## 5) Contratos automáticos de pruebas

Se añadieron pruebas en:

- `tests/contracts/scoring.contract.test.ts`
- `tests/contracts/api-validation.contract.test.ts`

Cubren:

- fórmula canónica de score,
- validación de votos,
- validación de payload de oferta,
- defaults de queries de feed.

## Alcance y límites de esta fase

## Sí cubre

- Defensa fuerte de entrada en endpoints críticos.
- Integridad diaria más robusta.
- Contratos mínimos automatizados para evitar regresiones básicas.

## No cubre aún (siguiente fase)

- Ledger de comisiones/pagos.
- Auditoría legal inmutable de aceptación (event table dedicada).
- Monitoreo externo de uptime/SLO.

## Checklist rápido de verificación post-deploy

- [ ] `npm run test:contracts` pasa.
- [ ] `npm run build` pasa.
- [ ] `/operaciones` muestra checks nuevos de integridad.
- [ ] Crear oferta con payload inválido responde `400`.
- [ ] Voto inválido (`value: 1`) responde `400`.

