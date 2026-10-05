# AVENTA — Semana 1 de cierre

Rama: `product/founder-os` (PR #44). Sin merge a `master`: Vercel despliega `master` a producción automáticamente.
Sin cambios en dinero, RLS, auth, schema, migraciones, lifecycle, scanner ni crons.

## 1. Fuente única por sistema

| Sistema | Fuente de verdad | Notas |
|---|---|---|
| Permisos de staff | `user_roles` → `/admin/team` | Solo Owner (middleware `canAccessAdmin`). |
| Equipos de trabajo | `team_memberships` → `/admin/owner/team-management` | Administra quién pertenece a qué equipo. |
| Hub diario del staff | `/equipo` (`canAccessEquipoPath`) | Lo usa el staff con rol; no asigna roles. |
| Team OS de miembros | `/team` (`resolveTeamPage` + cookie de gate) | Para miembros de equipo; no aparece en la navegación del Owner. |
| Cupón de una oferta | `offers.coupons` (texto libre, máx. 200) + `offers.bank_coupon` (catálogo `lib/bankCoupons.ts`) | El motor `coupons*` es post-lanzamiento. |
| Reputación / nivel | SQL `recalculate_user_reputation`, niveles 1–4 (`lib/reputation.ts`) | Da auto-aprobación (comentarios ≥2, ofertas ≥3) y peso de voto (`lib/votes/reputationWeights.ts`). |
| Logros / XP | `lib/achievements/catalog.ts` + `profiles.achievement_xp` | Colección. No entra en reputación ni en dinero. |
| XP de equipo | Team OS (13 niveles) | Solo staff. |
| Programa del Cazador | `lib/rewards/config.ts` + `REWARDS_PROGRAM_ACTIVE` | Desbloqueos nuevos solo con el programa activo. |
| Comisiones / pagos | Ledger + payout intents, bajo `MONEY_PATH_FROZEN` | Congelado. |
| Espacios patrocinados | `lib/sponsored/placements.ts` (política) + `campaigns.ts` (inventario) | Sin índices fijos en el feed. |

Diferencias legítimas entre las rutas de equipo: `/admin/team` asigna **roles** (permisos), `/admin/owner/team-management` asigna **equipos** (organización), `/equipo` es el **trabajo diario** por rol y `/team` es la **experiencia del miembro**. Ninguna duplica a otra.

## 2. Cambios de la semana

- **Rewards onboarding** (`lib/rewards/onboarding.ts`, `app/me/RewardsProgramGuide.tsx`): explica las tres capas (Gamificación, Recompensas, Programa monetario), qué cuenta y qué no, estados, abuso y cuándo se recibe algo. Se deriva de `config.ts` y del estado del programa; no lee base.
- **Copy honesto**: el panel ya no anima a un desbloqueo que está en pausa; se quitaron «gana XP», «desbloquea beneficios», «ahorra y gana» y la promesa de «cooldowns más cortos y mayor visibilidad», que no existe.
- **Logros**: «Cazador» pide nivel 4 (el máximo); «Explorador» (nivel 10) queda inactivo. Un test impide metas por encima del nivel máximo.
- **Equipo**: el botón «Gestionar roles» en `/equipo/gerencia` solo aparece a quien puede abrir `/admin/team`; el texto de acceso restringido de `/admin` ya dice «solo Owner».
- **Patrocinio**: `sponsoredDisclosure(kind)` rotula «Patrocinado» solo a campañas pagadas; las propias dicen «Destacado por AVENTA» y ya no prometen porcentajes.
- **Cupones**: `OFFER_COUPON_MAX = 200` compartido por creación (zod + input) y edición.
- **Deuda eliminada** (0 referencias, 0 tests): composiciones `/admin/owner/vista/**` con datos falsos, 26 componentes huérfanos de Owner/Control Center, `ChatBubble`, `FavoriteOnboarding`, `GuideButton`, `Onboarding` (legacy), `ModerationObjectivesSidebar`, `CommissionProgramPanel`, el alias `/api/admin/team-board` y la constante `VOTE_POINTS_BY_LEVEL`, que no correspondía con el peso real de voto.

## 3. Cuponera — arquitectura final

| Pieza | Estado | Decisión |
|---|---|---|
| `offers.coupons` + `bank_coupon` | COMPLETO | Fuente de verdad en lanzamiento. |
| Distribución (`eligibility.ts`) | COMPLETO | Usa ambas columnas. |
| Motor `coupons*` (`lib/intelligence/coupon/**`) | PARCIAL (modo `shadow`) | Tablas solo en staging; migraciones diferidas. |
| `/admin/coupons` | PARCIAL | Muestra «Falta aplicar la migración de cupones» en prod: estado honesto. |
| Cupón verificado → detalle de oferta | FALTANTE | `/admin/coupons` no envía `offerId`; se resuelve al aplicar las migraciones del motor. |
| «Cupones» en el selector de subida | PLACEHOLDER | Rotulado «Próximamente». |

## 4. Supply / Hunter — huecos documentados (sin tocar lifecycle)

- Todos los escritores automáticos están bloqueados en producción (`isProductionRuntime()`); los crons corren en `dry_run`/`shadow`.
- El escritor canónico `ingestOfferObservation` siempre inserta `pending` (pasa por moderación).
- Desvíos del camino canónico:
  - `lib/offers/findDuplicateOffer.ts:307` escribe `status: 'expired'`;
  - `app/api/admin/expire-offer/route.ts:33` no tiene guard de estado y puede desarchivar;
  - el arnés e2e de staging.
- `bridgeHunterCandidatesToBatch` está huérfano.

## 5. Pendiente (no es scope de esta semana)

- P1: guard de estado en `expire-offer`; que `findDuplicateOffer` delegue en lifecycle.
- P1: migraciones del motor de cupones y `offerId` en `/admin/coupons`.
- P2: `GET /api/me/rewards/status` escribe en base (debe ser de solo lectura).
- P2: toggle de mocks `tester-*` en `/operaciones`.
- P2: 2 errores de lint preexistentes (`set-state-in-effect` en `OnboardingV1.tsx` y `admin/layout.tsx`).
- Externo: plan Supabase Pro (backups/PITR) antes del lanzamiento.
