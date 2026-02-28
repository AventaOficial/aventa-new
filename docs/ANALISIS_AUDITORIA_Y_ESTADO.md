# Análisis: Auditoría Supabase + Estado del Proyecto AVENTA

**Fecha:** Febrero 2025

---

## 1. Resumen de cambios aplicados

| Cambio | Estado |
|--------|--------|
| OfferModal: Share al lado de botones, CAZAR OFERTA, Luna abajo separado | ✅ Hecho |
| ActionBar: vista previa como bloque aparte, diseño premium, tabs mobile | ✅ Hecho |
| Migración 029: reputación (offers_submitted/approved/rejected + RPCs) | ✅ Hecho |
| Migración 030: steps, conditions, coupons en offers | ✅ Hecho |
| Información adicional: guardar y mostrar en OfferModal | ✅ Hecho |
| Sistema reportes: botón Reportar en OfferModal + admin/reports funcional | ✅ Hecho |
| Rechazar oferta: increment_offers_rejected_count | ✅ Hecho |
| OfferCard: tamaño mayor solo en desktop (md:h-44, md:min-w-160) | ✅ Hecho |
| OfferModal: rediseño estructura, imagen más grande | ✅ Hecho |

---

## 2. Auditoría Supabase — Coherencia con el proyecto

### Tablas conectadas y en uso

| Tabla | Uso en el proyecto |
|-------|--------------------|
| **profiles** | Perfiles de usuario, display_name/avatar en ofertas, autor en comentarios |
| **offers** | Ofertas principales, moderación, métricas (votes_count, ctr_24h, etc.) |
| **user_roles** | RBAC: admin, moderator, analyst. Usado en `requireAdmin.ts` |
| **offer_votes** | Votos up/down. Trigger actualiza offers.upvotes_count, downvotes_count |
| **comments** | Comentarios en OfferModal |
| **offer_events** | Views, outbound, share. APIs: `/api/events`, `/api/track-view`, `/api/track-outbound` |
| **offer_favorites** | Favoritos por usuario |
| **moderation_logs** | Log al aprobar/rechazar en `/api/admin/moderate-offer` |
| **offer_reports** | Tabla creada (025), UI en admin/reports dice "Próximamente" |

### Tablas en Supabase pero no en migraciones del repo

| Tabla | Comentario |
|-------|------------|
| **offer_quality_checks** | Existe en Supabase según auditoría. No hay migración en el repo. No se usa en el código. |

### Diferencias esquema profiles

La auditoría menciona `username` (unique, nullable). En las migraciones del repo solo existe `display_name`. La app usa `display_name` como nombre de autor. Si en Supabase hay `username`, puede ser una columna añadida manualmente o en otra migración no versionada.

---

## 3. Elementos sin conectar o incompletos

### 3.1 Sistema de reportes (offer_reports)

- **Estado:** Tabla creada, RLS configurado.
- **UI:** `/admin/reports` muestra "Próximamente (Fase 3)".
- **Falta:** Botón "Reportar" en OfferModal/OfferCard que inserte en `offer_reports`. Flujo de revisión por moderadores.

### 3.2 RPCs de reputación (profiles)

El código llama a:

- `increment_offers_submitted_count` (al crear oferta)
- `increment_offers_approved_count` (al aprobar en moderación)

**Problema:** No hay migración en el repo que cree estas funciones ni las columnas `offers_submitted_count`, `offers_approved_count`, `offers_rejected_count` en `profiles`.

Si no existen en Supabase, las llamadas fallan en silencio (la API devuelve 200 igual). Los contadores no se actualizan.

**Recomendación:** Crear migración que añada las columnas y las funciones RPC:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS offers_submitted_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offers_approved_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offers_rejected_count int DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_offers_submitted_count(uuid uuid)
RETURNS void AS $$
  UPDATE public.profiles SET offers_submitted_count = offers_submitted_count + 1 WHERE id = uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_offers_approved_count(uuid uuid)
RETURNS void AS $$
  UPDATE public.profiles SET offers_approved_count = offers_approved_count + 1 WHERE id = uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_offers_rejected_count(uuid uuid)
RETURNS void AS $$
  UPDATE public.profiles SET offers_rejected_count = offers_rejected_count + 1 WHERE id = uuid;
$$ LANGUAGE sql SECURITY DEFINER;
```

### 3.3 offer_quality_checks

- Existe en Supabase según auditoría.
- No se usa en el código.
- No hay migración en el repo.
- **Acción:** Decidir si se usa para moderación automática o eliminarla. Si se usa, documentar y crear migración.

### 3.4 offer_votes: value vs vote

La auditoría señala: `value` y `vote` (generada) parecen duplicar el mismo concepto. Revisar si `vote` es redundante y se puede eliminar para evitar confusión.

---

## 4. Flujo de moderación

### Conectado

- `/admin/moderation` lista ofertas pendientes.
- `POST /api/admin/moderate-offer` actualiza status, escribe en `moderation_logs`.
- `requireModeration` valida rol admin/moderator en `user_roles`.
- Al aprobar: se llama `increment-approved` (si el RPC existe).

### Pendiente

- Al rechazar: no se llama `increment_offers_rejected_count` (no hay endpoint ni RPC en el código).

---

## 5. Métricas y triggers

### offer_events

- **INSERT:** view, outbound, share vía `/api/events`, `/api/track-view`, `/api/track-outbound`.
- **Trigger en offer_votes:** `recalculate_offer_metrics` actualiza `offers` (votes_count, outbound_24h, ctr_24h, ranking_momentum).
- **Nota:** Según auditorías anteriores, no hay trigger en `offer_events`. Las métricas se recalculan cuando cambian votos; los nuevos views/outbound no disparan el trigger. La vista `offer_performance_metrics` calcula desde `offer_events` directamente para uso en admin.

### ctr_24h, outbound_24h, ranking_momentum

- Origen: trigger `recalculate_offer_metrics` (usa `offer_votes` y `offer_events`).
- Se actualizan en cada voto; para views/outbound puros depende de si hay job o trigger adicional.

---

## 6. RLS y seguridad

- `requireModeration` y `requireAdmin` validan `user_roles` en servidor.
- `increment-offers` no valida auth (usa `userId` del body). Se usa solo tras crear oferta; el cliente pasa el usuario actual. Riesgo bajo si no se expone el endpoint de forma pública.
- `increment-approved` está protegido por `requireModeration`.

---

## 7. Resumen de prioridades

| Prioridad | Acción |
|-----------|--------|
| Alta | Crear migración para `offers_submitted_count`, `offers_approved_count`, `offers_rejected_count` y RPCs en `profiles` |
| Media | Conectar UI de reportes: botón "Reportar" en oferta + listado en admin/reports |
| Media | Al rechazar oferta: llamar `increment_offers_rejected_count` (crear RPC y endpoint si se usa) |
| Baja | Revisar `offer_quality_checks`: uso o eliminación |
| Baja | Revisar redundancia `value`/`vote` en `offer_votes` |

---

## 8. Conclusión

El proyecto está bien conectado en cuanto a:

- Ofertas, votos, favoritos, comentarios, eventos (view/outbound/share).
- Moderación con logs.
- Roles y permisos en APIs admin.
- Métricas en admin (offer_events, offer_votes).

Los puntos pendientes:

1. RPCs y columnas de reputación en `profiles`.
2. Sistema de reportes (offer_reports) sin UI funcional.
3. `offer_quality_checks` sin uso ni migración.
4. Posible redundancia en `offer_votes`.

Con esto se puede seguir con la Fase 4.
