# AVENTA — veredicto de pre-lanzamiento

Fecha: 2026-10-04, 19:30 UTC.
Este archivo sustituye el NO-GO escrito más temprano el mismo día. La corrida automática del lifecycle ya existe. El backup de Supabase Pro sigue abierto.

## Veredicto

**GO WITH CONDITIONS**

P0 de ingeniería abiertos: 0.
P1 de ingeniería abiertos: 0.
P2 que impidan abrir el código: 0.

No es un GO pleno. El sitio no tiene restore administrable, el dinero sigue congelado, y las únicas 12 ofertas vivas siguen con el health viejo hasta que venzan solas.

## Condiciones

1. **Backup.** El dueño sube la organización a Pro y confirma en el panel que hay un backup visible y un restore posible. PITR es aparte. Hasta entonces el blocker sigue OPEN. No hay workaround en el repo.
2. **Scanner.** No hace falta otro parche. El cron de las 03:00 UTC del 5 de octubre no va a reescribir estas 12, porque su `expires_at` cae antes (00:59–01:43 UTC) y el scanner no selecciona vencidas. Procedimiento de cierre al final.
3. **Dinero.** `MONEY_PATH_FROZEN` no se pone en false. Rewards, comisiones, payouts y settlement siguen apagados.

## Acción del dueño

- Subir Supabase a Pro y anotar RPO/RTO cuando el panel muestre el restore.
- Opcional y no bloqueante: activar la protección de contraseñas filtradas en Auth.
- Si el sitio se abre al público, tiene que haber ofertas aprobadas y vigentes. Después de las 01:43 UTC del 5 de octubre el feed actual queda vacío.

## Acción de ingeniería que no bloquea

- Desplegar el worktree `launch/final-verdict` cuando se quiera el título sin duplicar y el canonical del home. El cambio está en local, con test y `tsc --noEmit` en verde. Producción todavía muestra `| AVENTA | AVENTA` y el home sin canonical.
- No commitear ni desplegar formó parte de esta pasada: no se pidió commit.

## BEFORE de las 12 ofertas

Medido en producción. No hay AFTER. No se tocó ninguna fila.

| id | expires_at (UTC) | status | diagnostic | last_checked_at (UTC) |
|---|---|---|---|---|
| 0b094e07-9657-40d4-9906-e2ae3418b323 | 2026-10-05 01:43:29 | out_of_stock | missing_discount_price | 2026-10-04 03:46:26 |
| 1beeea9c-98e4-4da6-aeb9-ebeff36f28ea | 2026-10-05 01:43:24 | out_of_stock | missing_title | 2026-10-04 03:46:27 |
| 54d0c08e-e254-4681-aa2c-91d544e76de1 | 2026-10-05 01:43:28 | out_of_stock | missing_title | 2026-10-04 03:46:29 |
| 61267a33-9779-4b77-83c5-11f646dff8bb | 2026-10-05 01:08:24 | out_of_stock | missing_discount_price | 2026-10-04 03:46:30 |
| 7ba0aaf5-81da-409c-8eb6-5273b7462540 | 2026-10-05 01:43:25 | out_of_stock | missing_discount_price | 2026-10-04 03:46:27 |
| 9924db0d-2840-4fe4-ae70-9129057bf0d3 | 2026-10-05 01:43:31 | out_of_stock | missing_title | 2026-10-04 03:46:28 |
| a07c8ff8-f431-4b4b-9370-1718d000563a | 2026-10-05 01:43:27 | out_of_stock | missing_title | 2026-10-04 03:46:28 |
| aa9a51e8-cac2-4399-b141-6e9295338d2f | 2026-10-05 01:43:21 | out_of_stock | missing_discount_price | 2026-10-04 03:46:29 |
| c51e5ab4-d4c6-4f4d-82ec-4f636debfc93 | 2026-10-05 01:43:22 | out_of_stock | missing_discount_price | 2026-10-04 03:46:25 |
| c90a091c-90cc-4d32-9dfb-670db434dad3 | 2026-10-05 01:43:19 | out_of_stock | missing_title | 2026-10-04 03:46:27 |
| d8bb8a67-33ed-42ca-ac0d-d8631f135d07 | 2026-10-05 01:43:32 | out_of_stock | missing_title | 2026-10-04 03:46:30 |
| e847e33f-7437-412b-9591-8f2ceda00308 | 2026-10-05 00:59:36 | out_of_stock | missing_discount_price | 2026-10-04 03:46:26 |

## Procedimiento para cerrar el scanner

Después de las 03:00 UTC del 2026-10-05, solo lectura:

```sql
select o.id, o.expires_at, h.status, h.diagnostic, h.last_checked_at
from public.offers o
join public.offer_health_state h on h.offer_id = o.id
where o.id in (
  '0b094e07-9657-40d4-9906-e2ae3418b323',
  '1beeea9c-98e4-4da6-aeb9-ebeff36f28ea',
  '54d0c08e-e254-4681-aa2c-91d544e76de1',
  '61267a33-9779-4b77-83c5-11f646dff8bb',
  '7ba0aaf5-81da-409c-8eb6-5273b7462540',
  '9924db0d-2840-4fe4-ae70-9129057bf0d3',
  'a07c8ff8-f431-4b4b-9370-1718d000563a',
  'aa9a51e8-cac2-4399-b141-6e9295338d2f',
  'c51e5ab4-d4c6-4f4d-82ec-4f636debfc93',
  'c90a091c-90cc-4d32-9dfb-670db434dad3',
  'd8bb8a67-33ed-42ca-ac0d-d8631f135d07',
  'e847e33f-7437-412b-9591-8f2ceda00308'
);
```

Cierre correcto:

- `expires_at` igual al BEFORE. Si cambió, el scanner o alguien más lo movió y hay que investigarlo.
- `last_checked_at` puede seguir en 2026-10-04 03:46 UTC. Eso confirma que el cron de las 03:00 no las seleccionó porque ya estaban vencidas.
- El feed público no las incluye, porque `expires_at` ya pasó.

Cierre incorrecto:

- `expires_at` movido a la hora del cron.
- `diagnostic` con `auto_expire_streak=2` nuevo.

No actualizar estas filas a mano para que el resultado se vea bien.

## Lifecycle ya verificado

- Job `offers-lifecycle-v2`, activo, `17 * * * *`.
- Corrida automática `succeeded` a las 19:17:00 UTC.
- Contadores en cero. La corrida manual de las 18:19 UTC había limpiado 9 locks y archivado 5 rejected.
- Sin DELETE. El lock de advisory evita una segunda corrida solapada. No se provocaron dos ejecuciones simultáneas.

## Dinero

VERIFIED / FROZEN.

En producción, si `MONEY_PATH_FROZEN` falta o no es un off explícito, `isMoneyPathFrozen()` devuelve true. Conteos desde el 2026-09-01: 0 conversiones, 0 rewards, 0 payout intents. No se activó ningún programa.
