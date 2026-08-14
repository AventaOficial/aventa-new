# Supabase Security Advisor — por qué salen Critical y qué hacer

**Fecha:** 2026-08-14  
**Relacionado:** Dashboard → Database Linter (Security).  
**SQL fase 1:** `docs/supabase-migrations/security_advisor_phase1_lockdown.sql`

> Las alertas **no significan** “está hackeado ya”. Significan “configuración que el linter considera riesgosa”. Varias existen **a propósito** por cómo construimos el feed. Otras son **deuda** (cola sin RLS, vistas backup muertas).

---

## 1) Resumen de tus alertas

| Objeto | Alerta | ¿Por qué existe? | ¿Usado por la app? | Acción |
|--------|--------|------------------|--------------------|--------|
| `write_jobs_queue` | RLS Disabled | Cola de eventos (view/outbound); migración original **sin** `ENABLE ROW LEVEL SECURITY` | Sí, **solo** `service_role` (`lib/server/writeQueue.ts`) | **Fase 1:** activar RLS + revoke anon/auth |
| `ofertas_ranked_general` | Security Definer View | Vista del feed/ranking; en Postgres/Supabase las vistas corren como owner por defecto si no se pone `security_invoker` | **Sí — crítico** (home, categorías, tiendas) | **No dropear.** Fase 2: invoker solo tras probar RLS de `offers` |
| `public_profiles_view` | Security Definer View | Join de autor en feed sin filtrar email/RFC; `GRANT` a anon/auth a propósito | **Sí — crítico** | Igual: mantener; endurecer columnas si hace falta |
| `ofertas_ranked_general_backup*` | Security Definer View | Restos del rename “Opción A” al recrear vistas (`archived/prompts-aplicados/SQL_VISTAS_OPCION_A.md`) | **No** | **Fase 1:** DROP tras inventario |
| `public_profiles_view_backup` | Idem | Idem | **No** | DROP |
| `ofertas_scores` / `ofertas_scores_ranked` | Security Definer View | Legado pre–`ofertas_ranked_general` | **No** en código actual | Inventario → DROP |
| `offer_vote_totals` | Security Definer View | Legado | **No** | DROP |
| `offer_event_totals` | Security Definer View | No hay CREATE en repo; posible legado live | **No** (0 refs app) | Inventario → DROP |
| `daily_system_metrics` | Security Definer View | Métricas admin; CREATE no está en migraciones del repo | Sí, `/admin/health` con **cliente anon** | **No DROP.** Fase 2: leer vía API service_role + restringir grants |

---

## 2) Por qué “Security Definer View” aparece (explicación simple)

En Supabase/Postgres:

1. Creás una `VIEW` sobre `offers` / `profiles`.  
2. Por defecto la vista se evalúa con privilegios del **owner** (comportamiento tipo definer).  
3. El linter marca **Critical** porque una vista mal hecha podría exponer filas que RLS de la tabla base ocultaría al usuario final.  
4. En AVENTA las vistas públicas se crearon **a propósito** con `GRANT SELECT TO anon, authenticated` para que el feed y los joins de autor no den 400 (ver `docs/REFACTOR_MODAL_Y_ERROR_400.md`, `docs/SYSTEMS/SYSTEM_feed_ranking.md`, `docs/SUPABASE_CONTEXTO.md` §7).

**No están “desactivadas por error”.** Están en el patrón “vista pública de solo columnas seguras + grant de lectura”.  
Lo que falta documentar (hasta este archivo) era el **porqué** frente al linter.

### `security_invoker = true` (fase 2)

Hace que la vista respete RLS del caller. **Solo es seguro** si las policies de `offers`/`profiles` ya permiten a `anon` leer exactamente lo que el feed necesita (ofertas aprobadas/publicadas, perfiles públicos).  
Si RLS de `offers` es restrictiva, poner invoker **rompe el home**. Por eso **no** va en el SQL fase 1.

---

## 3) Por qué `write_jobs_queue` no tenía RLS

- Archivo: `docs/supabase-migrations/write_jobs_queue.sql`  
- Objetivo: absorber picos de `track-view` / `track-outbound` / events.  
- Acceso app: **únicamente** `createServerClient()` (service_role).  
- Al crear la tabla se omitió el patrón de lockdown que sí usamos después en `affiliate_ledger_entries` y `communities_rls_lockdown.sql`.

**Conclusión:** deuda técnica, no feature. Arreglar es **bajo riesgo** para la app.

---

## 4) Documentación previa (ya existía, incompleta)

| Doc | Qué decía |
|-----|-----------|
| `docs/SUPABASE_CONTEXTO.md` §7 | Linter = recomendaciones opcionales; no explica objeto por objeto |
| `archived/prompts-aplicados/SQL_VISTAS_OPCION_A.md` | Origen de `*_backup` |
| `archived/auditorias/AUDITORIA_ESTRUCTURAL_CTO.md` | `ofertas_scores` muerto |
| `docs/SYSTEMS/SYSTEM_feed_ranking.md` | Dependencia feed ↔ vistas |

Este archivo + el SQL fase 1 **cierran** esa documentación.

---

## 5) Orden de ejecución recomendado

1. En SQL Editor: bloque **INVENTARIO** del archivo fase 1 (solo SELECT).  
2. Ejecutar **lockdown** de `write_jobs_queue`.  
3. Probar: un clic “ir a tienda”, cron/`process-write-queue`, owner backlog.  
4. Ejecutar **DROP** solo de vistas listadas que el inventario confirmó y que no usa la app.  
5. Recargar Database Linter.  
6. **Fase 2:** ejecutar `security_advisor_phase2_security_invoker.sql`, luego probar home (anon + logueado) y `/admin/health`. Si el feed se rompe, usá el ROLLBACK del propio SQL.  
7. Más adelante: overrides por país vía `lib/markets`.

---

## 6) Qué NO hacer

- Quitar `GRANT SELECT` de `ofertas_ranked_general` / `public_profiles_view` a anon “para que el linter se calle” → rompe feed/favoritos.  
- Dropear `ofertas_ranked_general` o `public_profiles_view`.  
- Asumir que `offer_event_totals` = `offer_event_counts_for_offers` (son cosas distintas; la segunda es función SECURITY DEFINER con `search_path` fijo).  
- Exponer RFC/CLABE en cualquier vista pública (hoy no van en `public_profiles_view`; mantenerlo así).
