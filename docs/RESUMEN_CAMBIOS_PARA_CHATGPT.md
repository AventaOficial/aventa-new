# Resumen de cambios aplicados — AVENTA (para ChatGPT / Roadmap)

**Proyecto:** AVENTA — plataforma de ofertas comunidad de ofertas en México  
**Stack:** Next.js 16, Supabase, Tailwind, Framer Motion  
**Fecha del resumen:** Febrero 2025

---

## Objetivo del documento

Este archivo sirve como contexto para que ChatGPT (u otro asistente) organice un roadmap, priorice tareas y entienda el estado actual del proyecto. Incluye todos los cambios aplicados en las sesiones recientes.

---

## 1. Cambios aplicados (resumen ejecutivo)

### Panel subir oferta (ActionBar)
- **Separación real:** Formulario (42–45%) | Vista previa (55–58%) en desktop.
- **Mobile:** Tabs "Completar" | "Vista previa".
- **Diseño:** Estilo premium, inputs con `bg-gray-50/50`, `focus:border-violet-500`.
- **Vista previa:** Réplica de OfferCard y OfferModal, fondo `#F5F5F7` / `#1d1d1f`.
- **Información adicional:** Pasos, condiciones, cupones — ahora se guardan en BD y se muestran en OfferModal.

### Información adicional (steps, conditions, coupons)
- **Migración 030:** Columnas `steps`, `conditions`, `coupons` en `offers`.
- **Payload:** ActionBar envía estos campos al crear oferta.
- **Vista:** `ofertas_ranked_general` incluye steps, conditions, coupons.
- **OfferModal:** Sección "Cómo obtener la oferta" con pasos, condiciones y cupón destacado.

### OfferCard (home)
- **Mobile:** Sin cambios (`h-[110px]`, `min-w-[80px]`).
- **Desktop:** Imagen más grande: `md:h-44` (antes `md:h-36`), `md:min-w-[160px]` (antes 140).

### OfferModal (vista extendida)
- **Imagen:** Más grande: `h-48 md:h-64 lg:h-72`.
- **Estructura:** Header con tienda, título, autor; precio a la derecha en desktop.
- **Share:** Icono al lado del botón "CAZAR OFERTA".
- **Luna:** "Preguntar a Luna" al final, separado.
- **Ancho:** `md:max-w-5xl lg:max-w-6xl`.

### Sistema de reportes
- **Botón Reportar:** En OfferModal.
- **API:** `POST /api/reports` (requiere sesión).
- **Admin:** `/admin/reports` con filtros y acciones Revisado/Descartar.
- **API admin:** `GET` y `PATCH /api/admin/reports`.

### Reputación (profiles)
- **Migración 029:** `offers_submitted_count`, `offers_approved_count`, `offers_rejected_count`.
- **RPCs:** `increment_offers_submitted_count`, `increment_offers_approved_count`, `increment_offers_rejected_count`.
- **Rechazar:** Al rechazar oferta se llama `increment-rejected`.

---

## 2. Estructura de archivos relevantes

```
app/
  components/
    ActionBar.tsx      # Panel subir oferta (form + preview)
    OfferCard.tsx     # Card en home
    OfferModal.tsx    # Vista extendida
  page.tsx            # Home, fetch offers
  admin/
    reports/page.tsx  # Listado reportes
  api/
    reports/route.ts
    admin/reports/route.ts
    reputation/increment-rejected/route.ts
supabase/migrations/
  029_profiles_reputation_rpcs.sql
  030_offers_steps_conditions_coupons.sql
```

---

## 3. Pendientes / problemas a revisar

| Prioridad | Item | Notas |
|-----------|------|-------|
| Baja | `offer_quality_checks` | Existe en Supabase, no en migraciones. Decidir uso o eliminación. |
| Baja | `offer_votes` value vs vote | Posible redundancia. |
| Media | Trigger en `offer_events` | Métricas (ctr_24h, etc.) se recalculan solo con votos; views/outbound no disparan trigger. |
| Media | `increment-offers` sin auth | API no valida token; riesgo bajo si no se expone. |

---

## 4. Roadmap sugerido (para organizar con ChatGPT)

### Fase 4 (actual)
- [x] Migración reputación
- [x] Sistema reportes
- [x] Información adicional (steps, conditions, coupons)
- [x] Rediseño panel subir oferta
- [x] Mejoras OfferModal y OfferCard

### Siguientes fases
- **Fase 5:** Reseñas verificadas, trust score en perfiles.
- **Fase 6:** Notificaciones, métricas avanzadas.
- **Mantenimiento:** Revisar `offer_quality_checks`, trigger en `offer_events`.

---

## 5. Cómo usar este documento

1. **ChatGPT:** Pasar este archivo como contexto al pedir roadmap o priorización.
2. **Onboarding:** Nuevos devs pueden leerlo para entender el estado.
3. **Sprints:** Usar la sección de pendientes para definir tareas.

---

---

## 6. Prompt para Supabase (migración 030)

Si la migración 030 falla por conflicto de columnas en la vista, ejecuta este SQL en Supabase:

```
-- Añadir columnas a offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS steps text,
  ADD COLUMN IF NOT EXISTS conditions text,
  ADD COLUMN IF NOT EXISTS coupons text;

COMMENT ON COLUMN public.offers.steps IS 'Pasos para obtener la oferta (ej. agregar al carrito, aplicar cupón)';
COMMENT ON COLUMN public.offers.conditions IS 'Condiciones de la oferta (ej. válido hasta fecha, solo en línea)';
COMMENT ON COLUMN public.offers.coupons IS 'Cupones o códigos de descuento';

-- Recrear vista (DROP evita conflicto con CREATE OR REPLACE)
DROP VIEW IF EXISTS public.ofertas_ranked_general;

CREATE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.store,
  o.offer_url,
  o.description,
  o.steps,
  o.conditions,
  o.coupons,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
```

---

*Última actualización: Febrero 2025*
