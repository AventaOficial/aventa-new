# Estabilizacion 12 meses (AVENTA)

Fecha: 27 de marzo de 2026

## Objetivo

Dejar AVENTA funcional, limpia y mantenible con intervencion minima durante 12 meses, priorizando:

- coherencia de datos (votos/ranking/comisiones),
- operacion diaria clara (owner/moderacion),
- UX simple para usuarios y moderadores,
- base legal/principal clara sin saturar.

## Cambios implementados en esta fase

## 1) Votos y score unificados (single source of truth)

Se creo una utilidad canonica:

- `lib/offers/scoring.ts`
  - `computeOfferScore(up, down) = up*2 - down`
  - `normalizeVoteCounts(up, down)`

Se aplico en:

- `app/me/page.tsx`
- `app/me/favorites/page.tsx`
- `app/api/profile/[username]/route.ts`
- `lib/hooks/useOffersRealtime.ts`

Impacto:

- mismo score en perfil, favoritos, /me y realtime,
- menos desalineacion visual entre pantallas,
- mantenimiento mas simple (una sola formula).

## 2) Feed home mas consistente para ranking

Se mejoro el contrato de feed:

- `lib/offers/feedService.ts`
  - ahora expone `up_votes`, `down_votes`, `ranking_blend`, `ranking_momentum`,
  - trending ordena por `ranking_blend` (no por `score`).

- `app/page.tsx`
  - `adaptFeedData()` deja de inferir votos desde score cuando hay contadores reales,
  - usa `ranking_blend`/`ranking_momentum` cuando vienen de API.

Impacto:

- home mas alineado con ranking real,
- menos divergencia entre home y otras vistas.

## 3) Moderacion simplificada por rol

Archivo principal: `app/admin/moderation/page.tsx`

Se aplico:

- se removio bloque de "ofertas tester" de la cola de moderacion,
- se simplifico la vista para moderadores:
  - filtros avanzados (fechas/risk) solo para owner/admin,
  - acciones masivas solo para owner/admin,
  - moderador mantiene flujo esencial (buscar, filtrar, aprobar/rechazar por oferta).

Impacto:

- menor carga cognitiva para equipo de moderacion,
- menos riesgo de errores operativos por sobrecarga de controles.

## 4) Toggle de ofertas tester movido a owner panel

Archivo: `app/operaciones/page.tsx`

Se agrego bloque owner para activar/desactivar:

- `show_tester_offers` desde `app_config`.

Impacto:

- separacion clara entre operacion de moderacion y configuracion owner.

## 5) Centro de operaciones auto-actualizable

Archivo: `app/operaciones/page.tsx`

Se agrego:

- refresco automatico cada 60 segundos (estado cached + pulse),
- texto actualizado para explicar refresco visual + cron diario.

Impacto:

- menos necesidad de recargar manualmente,
- mejor monitoreo continuo en panel owner.

## 6) Bug visual en modo claro (navbar)

Archivo: `app/components/Navbar.tsx`

Se corrigio contraste del bloque:

- "Hola de nuevo"
- nombre de usuario

Ahora usa colores adecuados para modo claro y conserva legibilidad en dark.

## 7) Comisiones compactas dentro de niveles (UX)

Archivos:

- `app/me/page.tsx`
- `app/me/CommissionProgramPanel.tsx`

Se aplico:

- panel movido junto a reputacion (contexto de niveles),
- version compacta por defecto,
- detalle desplegable ("Ver/Ocultar"),
- estado claro:
  - no elegible (faltan X),
  - elegible pendiente,
  - activo.

Impacto:

- menos saturacion visual,
- mejor descubrimiento para usuario avanzado sin ruido para todos.

## 8) Transparencia admin de comisiones por usuario

Archivos:

- `app/api/admin/users/route.ts`
- `app/admin/users/page.tsx`

Se agrego:

- `commission_qualifying_offers` por usuario (conteo de ofertas >=120 votos en aprobadas/publicadas),
- estado de activacion:
  - `commissions_accepted_at`
  - `commissions_terms_version`.

Nota:

- El API tiene degradacion suave si faltan columnas de comisiones en entornos no migrados.

## 9) Cookies sutiles (sin saturar)

Archivos:

- `app/components/CookieNotice.tsx`
- `app/layout.tsx`

Se agrego aviso discreto:

- cookies esenciales + analitica minima,
- enlace a privacidad,
- persistencia local al aceptar (`localStorage`).

## 10) Ajuste legal de comisiones y links

Archivo: `app/terms/page.tsx`

Se reforzo en seccion 8:

- aclaracion de gestion de enlaces durante etapa de elegibilidad,
- sin derechos economicos automaticos por publicar ofertas,
- activacion explicita requerida.

## Estado de operacion esperado despues de esta fase

## Owner

- puede monitorear integridad con refresco automatico,
- puede ejecutar chequeo manual,
- puede activar/desactivar ofertas tester desde operaciones.

## Moderador

- trabaja en una cola mas limpia y enfocada,
- mantiene acciones esenciales sin ruido de configuracion owner.

## Usuario creador

- ve progreso de comisiones de forma simple,
- puede activar participacion al cumplir regla y aceptar terminos.

## Checklist de mantenimiento minimo (12 meses)

## Diario (5-10 min)

- revisar semaforos en `/operaciones`,
- revisar cola de pendientes de moderacion.

## Semanal (20-40 min)

- revisar `/admin/users` (estado comisiones + actividad),
- revisar `/admin/metrics`,
- ejecutar chequeo manual en operaciones antes de picos/campanas.

## Mensual (45-90 min)

- revisar uso/limites en Supabase y Vercel,
- revisar contratos criticos (`tests/contracts`),
- revisar cambios legales/comerciales y versionar terminos si aplica.

## Trimestral

- auditoria de consistencia de ranking y score en pantallas clave,
- limpieza de deuda tecnica prioritaria.

## Criterio de alineacion (base de trabajo)

Cada area se considera alineada si cumple:

1. Contrato de datos: misma formula/campos en UI + API + BD.
2. Contrato de operacion: owner ve estado real y accionable.
3. Contrato de UX: simple primero, detalle bajo demanda.
4. Contrato legal: resumen corto en UI + detalle completo en legal.

Si un cambio rompe alguno de estos contratos, no pasa a produccion.

## Archivos principales tocados en esta fase

- `lib/offers/scoring.ts`
- `lib/offers/feedService.ts`
- `app/page.tsx`
- `app/me/page.tsx`
- `app/me/favorites/page.tsx`
- `app/me/CommissionProgramPanel.tsx`
- `app/api/profile/[username]/route.ts`
- `lib/hooks/useOffersRealtime.ts`
- `app/admin/moderation/page.tsx`
- `app/operaciones/page.tsx`
- `app/components/Navbar.tsx`
- `app/api/admin/users/route.ts`
- `app/admin/users/page.tsx`
- `app/components/CookieNotice.tsx`
- `app/layout.tsx`
- `app/terms/page.tsx`

---

## Actualizacion Fase 0 (blindaje)

Adicional a esta estabilizacion, se ejecutó una Fase 0 de hardening con:

- validación obligatoria (Zod) en endpoints críticos,
- fail-safes explícitos por tipo de error,
- integridad automática ampliada (datos/votos/consistencia de score),
- contratos de prueba nuevos para validación y scoring.

Detalle completo:

- `docs/FASE0_BLINDAJE_SISTEMA.md`

## Actualizacion Blindaje final (enforcement pre-lanzamiento)

Se agrego una capa final para convertir auditoria en control real:

- constraints SQL no invasivos para votos/precios/msi/bank_coupon,
- endpoint owner dedicado para disparar chequeo manual:
  - `/api/admin/integrity-check`
- nuevos checks automáticos de integridad:
  - `offers.price_logic.integrity`
  - `offer_votes.legacy_value_1`
  - `offers.msi_range.integrity`
  - `offers.image_url.integrity`

Detalle completo:

- `docs/BLINDAJE_FINAL_LANZAMIENTO.md`
- `docs/supabase-migrations/final_hardening_constraints.sql`

