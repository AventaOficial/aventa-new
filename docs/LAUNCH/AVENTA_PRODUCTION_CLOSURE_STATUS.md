# AVENTA — estado de cierre de producción

Fecha: 2026-10-04. Rama `product/founder-os`, PR #44 (abierto, sin merge ni deploy).
Estado objetivo: **PRODUCTION CLOSURE CANDIDATE**.

Clasificación usada: **BLOCKER** (impide abrir), **P1** (antes de tráfico real), **P2** (mejora con fecha), **POST-LAUNCH** (documentado, sin urgencia), **EXTERNAL** (fuera del código).

## 1. Resumen ejecutivo

No hay blockers técnicos abiertos. El único blocker es externo: Supabase Pro, con backup visible y un restore verificado. El dinero sigue congelado. Lifecycle y scanner no se tocaron en esta fase.

Esta fase cerró lo que quedaba del producto, sin features nuevas:

- Navegación del owner en tres audiencias (CEO / Operations / Technical), con fichas humanas para los 17 módulos visibles.
- Baneos accesible como pestaña de Moderación.
- «Roles y permisos» en vez de «Team» suelto; Team Hub alcanzable por el owner.
- OfferMedia sin el efecto de imagen «flotando» en dark mode.
- Fechas deterministas en el detalle de oferta para eliminar el riesgo de React #418.

## 2. Estado actual de producción

- `master` = `0d97401` (#43). Vercel despliega `master` automáticamente.
- PR #44 (`product/founder-os`) contiene Founder OS, el UX de oferta y este cierre. No está mergeado. **No se hizo deploy.**
- Base de datos de producción: sin escrituras en esta fase. Solo se ejecutó un `SELECT` de lectura para identificar las 11 ofertas de la sección 10.
- No se promovió staging. No se copiaron tablas, usuarios, ofertas, crons, datos ni configuración de dinero de staging.

## 3. Paridad de producto

- Paridad funcional con staging cerrada en #41 (ver `AVENTA_PRODUCTION_PARITY_FINAL.md`).
- Jerarquía del detalle de oferta: Oferta → «Sobre esta oferta» → Comentarios → Información adicional (plegada). Verificado sin cambios.
- Home: rail de comunidad con datos reales y patrocinio vía `lib/sponsored/placements.ts`. La política de inserción no usa índices fijos (`index === 3`, `index % 4`). Solo auditoría; sin cambios de base de datos.

## 4. Seguridad

**PASS.**

- Sin cambios de RLS, auth, migraciones, schema ni guards.
- Baneos y Roles y permisos siguen detrás de los mismos guards del layout `/admin` y del middleware (solo owner). Solo cambió la navegación.
- No hay service-role en el cliente, APIs nuevas ni escrituras públicas.
- Like de comentarios: un duplicado (23505) responde sin 500. El like optimista hace rollback y bloquea la petición en curso. Verificado sin cambios.

## 5. Dinero

**FROZEN. Sin tocar.**

`MONEY_PATH_FROZEN` no se modificó. `isMoneyPathFrozen()` devuelve true en producción si la variable falta. Rewards, comisiones, payouts, settlement, ledger, payout intents y atribución quedan intactos. Ningún archivo de dinero aparece en el diff.

## 6. Lifecycle

Intacto. Job `offers-lifecycle-v2` activo (`17 * * * *`), verificado en `AVENTA_FINAL_GO_NO_GO.md`. Sin cambios en esta fase.

## 7. Scanner

Intacto. Una oferta solo bloquea la salida a la tienda con evidencia HTTP 404/410 (`isConfirmedGoneDiagnostic`). Un scanner que no pudo verificar no bloquea el CTA. Verificado sin cambios. El cierre del scanner sobre las 12 ofertas que vencen sigue el procedimiento de solo lectura de `AVENTA_FINAL_GO_NO_GO.md`.

## 8. Admin / Founder OS

Fuente única: `lib/owner/navigation.ts`.

| Sección | Pregunta | Visible |
|---|---|---|
| CEO | ¿Qué debo decidir hoy? | Control Center, Moderation, Supply, Money, Users, Health |
| Operations | ¿Cómo está funcionando Aventa hoy? | Live Metrics, Growth, Rewards Ops, Operaciones, Bot y trabajo, Activity |
| Technical | ¿Cómo está armado y quién puede hacer qué? | Infrastructure, Systems Map, Configuration, Technical, Roles y permisos |

- Cada módulo visible tiene ficha («¿Qué es esto?») con estos campos: qué es, para qué sirve, qué protege, qué mide, cómo leerlo, qué decisión permite, qué NO controla y cuándo entrar. El estado en vivo se deriva de las mismas señales del Control Center.
- Baneos: pestaña del hub de Moderación (`/admin/moderation/bans`). Es la misma página, sin ruta nueva.
- Owner → Team Hub (`/equipo`) con el permiso existente (`user_roles`). Team OS (`/team`) sigue exigiendo membresía, por diseño.
- Tests: `tests/owner/founderOs.test.ts`.

## 9. UX

- **OfferMedia** (Home, detalle, Favoritos, Perfil, vista previa del cazador): el marco lo decide `offerFrameMode`.
  - Fondo uniforme medido: la placa toma ese color.
  - Foto aún sin medir, transparente o ilegible por CORS (otras tiendas): placa neutra clara.
  - Escena medida: es el único caso con desenfoque.
  - Siempre `object-contain`, sin recorte. Fallback accesible «Sin foto».
  - Tests: `tests/offers/offerMediaEdgeTone.test.ts`.
- **Hidratación del detalle de oferta**: el servidor y la hidratación muestran fecha corta en America/Mexico_City; el texto relativo («hace 5 min», días restantes) aparece después (`useHydrated`). Sin `suppressHydrationWarning`. Tests: `tests/launch/offerDetailHydration.test.ts`.
- Comentarios: sin polling. Verificado.
- **Flechas de voto**: el rebote usaba `spring` con 3 keyframes, que framer-motion rechaza con un error en consola al montar cada botón (feed y detalle; también ocurre en `master`). Ahora usa una curva `ease` con los mismos tiempos. La lógica de voto no cambia. Test: `tests/launch/voteArrowMotion.test.ts`.

## 10. Problemas de datos conocidos

### 11 ofertas con la nota de lote — P2 (operación opcional del owner)

- **Origen:** carga por lote del 2026-09-28. El texto «Oferta cargada por lote. Revisar ficha antes de aprobar.» quedó guardado en `offers.description`. Es un dato, no algo que se genere al presentar.
- **Impacto público:** ninguno. `lib/offers/publicDescription.ts` lo oculta desde #43.
- **Vencimiento:** las 11 vencen solas antes de las 01:43 UTC del 2026-10-05.

Estas son las 11 filas:

- 61267a33-9779-4b77-83c5-11f646dff8bb
- c90a091c-90cc-4d32-9dfb-670db434dad3
- aa9a51e8-cac2-4399-b141-6e9295338d2f
- c51e5ab4-d4c6-4f4d-82ec-4f636debfc93
- 1beeea9c-98e4-4da6-aeb9-ebeff36f28ea
- 7ba0aaf5-81da-409c-8eb6-5273b7462540
- a07c8ff8-f431-4b4b-9370-1718d000563a
- 54d0c08e-e254-4681-aa2c-91d544e76de1
- 0b094e07-9657-40d4-9906-e2ae3418b323
- 9924db0d-2840-4fe4-ae70-9129057bf0d3
- d8bb8a67-33ed-42ca-ac0d-d8631f135d07

**No se ejecutó ninguna escritura.** Si el owner decide limpiar el dato:

BEFORE (esperado: 11):

```sql
select count(*) from public.offers
where btrim(description) = 'Oferta cargada por lote. Revisar ficha antes de aprobar.';
```

Corrección propuesta. Solo toca `description`; no toca `expires_at`, el estado, precios, votos, el health ni el lifecycle:

```sql
update public.offers
set description = null
where id in (
  '61267a33-9779-4b77-83c5-11f646dff8bb','c90a091c-90cc-4d32-9dfb-670db434dad3',
  'aa9a51e8-cac2-4399-b141-6e9295338d2f','c51e5ab4-d4c6-4f4d-82ec-4f636debfc93',
  '1beeea9c-98e4-4da6-aeb9-ebeff36f28ea','7ba0aaf5-81da-409c-8eb6-5273b7462540',
  'a07c8ff8-f431-4b4b-9370-1718d000563a','54d0c08e-e254-4681-aa2c-91d544e76de1',
  '0b094e07-9657-40d4-9906-e2ae3418b323','9924db0d-2840-4fe4-ae70-9129057bf0d3',
  'd8bb8a67-33ed-42ca-ac0d-d8631f135d07'
)
and btrim(description) = 'Oferta cargada por lote. Revisar ficha antes de aprobar.';
```

AFTER: el mismo `SELECT count(*)` debe devolver 0. Comprueba también que `expires_at` y `status` de esas 11 filas sigan iguales al BEFORE.

### Otros

- **P2:** la API del feed devuelve `description` sin filtrar en el JSON. La UI lo filtra; conviene filtrar también en el servidor.
- **P2 (decisión de producto):** los creativos patrocinados de la casa llevan la etiqueta «Patrocinado» aunque no haya anunciante externo.

## 11. Blockers externos

**EXTERNAL — Supabase Pro + backup + restore verificado.** El owner sube la organización a Pro, confirma en el panel un backup visible y ejecuta o valida un restore. Después anota RPO/RTO. No se resuelve con código. WAL no sustituye un restore verificable. No se cambió infraestructura.

Opcional y no bloqueante: activar la protección de contraseñas filtradas en Auth.

## 12. Post-launch

- Vistas de referencia `/admin/owner/vista/*` y componentes de owner sin uso (`CeoControlCenter`, `OwnerKpiStrip`, etc.): se pueden retirar cuando sus tests de contrato se migren.
- Fichas «¿Qué es esto?» para las herramientas plegadas (Cupones, Distribución, etc.).
- Prioridades del Control Center filtradas por equipo en Team Hub (no requiere tablas).
- Campaign OS (solo concepto, `docs/PRD/FOUNDER_OS.md`).
- 6 avisos de lint preexistentes en `app/page.tsx` (ya estaban en `master`).

## 13. Rollback

- PR #44 aún no está en `master`: no hay nada que revertir en producción.
- Después del merge: `git revert -m 1 <merge-commit>` en `master` y dejar que Vercel redepliegue, o promover en Vercel el deployment anterior (`0d97401`).
- No hay migraciones ni datos que revertir; el cambio es solo de código.

## 14. Criterios finales de release

| Criterio | Estado |
|---|---|
| Sin blocker técnico crítico | PASS |
| Build, typecheck y tests | PASS (ver reporte final del PR) |
| Sin regresión de seguridad | PASS |
| Dinero congelado | PASS |
| Lifecycle y scanner intactos | PASS |
| Sin staging mezclado | PASS |
| Founder OS coherente | PASS |
| Baneos accesible | PASS |
| OfferMedia consistente | PASS |
| Sin #418 conocido en el detalle de oferta | PASS |
| Supabase Pro + backup + restore verificado | **EXTERNAL — pendiente del owner** |

Veredicto: **READY FOR FINAL EXTERNAL GATE**. El gate se cierra formalmente cuando el owner verifica el restore.
