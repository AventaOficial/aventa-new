# Blindaje final de lanzamiento (AVENTA)

Fecha: 27 de marzo de 2026

## Objetivo

Cerrar el gap entre "auditoría" y "enforcement real":

- reglas duras en base de datos,
- checks automáticos más estrictos,
- endpoint dedicado de diagnóstico owner.

## Cambios aplicados

## 1) Integridad automática reforzada

Archivo: `lib/server/systemIntegrity.ts`

Se agregaron checks adicionales:

- `offers.price_logic.integrity` (precio mayor que precio original).
- `offer_votes.legacy_value_1` (detecta votos legacy con valor `1`).
- `offers.msi_range.integrity` (MSI fuera de rango 1-24).
- `offers.image_url.integrity` (ofertas sin imagen principal).

Además, `offers.required_fields.integrity` ahora también verifica:

- `original_price` negativo.

## 2) Endpoint owner de diagnóstico explícito

Archivo: `app/api/admin/integrity-check/route.ts`

Se habilitó endpoint alias:

- `GET /api/admin/integrity-check`

Apunta al mismo handler de `system-integrity` y mantiene `requireOwner`.

## 3) Constraints de base de datos (migración final)

Archivo: `docs/supabase-migrations/final_hardening_constraints.sql`

Incluye:

- normalización `offer_votes.value` legacy (`1 -> 2`),
- check estricto de votos permitidos `[-1, 2]`,
- checks en `offers` para:
  - `price >= 0`,
  - `original_price >= 0`,
  - `title/store` no vacíos cuando existan,
  - `msi_months` en rango 1-24,
  - `bank_coupon` dentro del catálogo permitido o vacío/null,
- índice único `(offer_id, user_id)` para evitar duplicados de voto.

Se usan constraints `NOT VALID` para no bloquear datos legacy históricos.

## Verificación recomendada post deploy

1. Ejecutar migración `final_hardening_constraints.sql`.
2. Ejecutar `GET /api/admin/integrity-check?run=1`.
3. Confirmar en panel owner que `failed=0`.
4. Revisar cron `system-integrity` y alertas (webhook/email).
5. Ejecutar pruebas de contrato:

```bash
npm run test:contracts
```

## Criterio de salida a mercado

Lanzar solo si:

- integridad automática sin fallos críticos,
- constraints aplicados en DB,
- CI (tests contrato + build) en verde.
