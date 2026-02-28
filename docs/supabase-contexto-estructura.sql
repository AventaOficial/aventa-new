-- =============================================================================
-- CONTEXTO DE ESTRUCTURA — Esquema public (Supabase AVENTA)
-- Ejecutar en SQL Editor para listar tablas, columnas, FKs, políticas y vistas.
-- =============================================================================

-- 1) Tablas y columnas del esquema public
SELECT
  c.table_name AS tabla,
  c.column_name AS columna,
  c.data_type AS tipo,
  c.is_nullable AS nullable,
  c.column_default AS default_val,
  pgd.description AS comentario
FROM information_schema.columns c
LEFT JOIN pg_catalog.pg_statio_all_tables st ON st.relname = c.table_name AND st.schemaname = c.table_schema
LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'profiles', 'offers', 'user_roles', 'offer_quality_checks', 'offer_votes',
    'comments', 'offer_events', 'offer_favorites', 'moderation_logs', 'offer_reports'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 2) Claves primarias
SELECT
  tc.table_name AS tabla,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS pk_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_name IN (
    'profiles', 'offers', 'user_roles', 'offer_votes', 'comments',
    'offer_events', 'offer_favorites', 'moderation_logs', 'offer_reports'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- 3) Foreign keys (origen → destino)
SELECT
  tc.table_name AS tabla_origen,
  kcu.column_name AS columna_origen,
  ccu.table_schema AS schema_destino,
  ccu.table_name AS tabla_destino,
  ccu.column_name AS columna_destino
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'profiles', 'offers', 'user_roles', 'offer_votes', 'comments',
    'offer_events', 'offer_favorites', 'moderation_logs', 'offer_reports'
  )
ORDER BY tc.table_name, kcu.column_name;

-- 4) Políticas RLS por tabla
SELECT
  schemaname,
  tablename AS tabla,
  policyname AS politica,
  cmd AS operacion,
  qual::text AS using_expr,
  with_check::text AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5) Vistas en public
SELECT
  table_name AS vista,
  view_definition AS definicion
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('ofertas_ranked_general', 'public_profiles_view')
ORDER BY table_name;

-- 6) Triggers en tablas public (y auth.users para handle_new_user)
SELECT
  event_object_schema AS schema,
  event_object_table AS tabla,
  trigger_name AS trigger_name,
  action_timing AS timing,
  event_manipulation AS evento
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
  AND (event_object_table IN (
    'profiles', 'offers', 'offer_votes', 'comments', 'offer_events'
  ) OR (event_object_schema = 'auth' AND event_object_table = 'users'))
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 7) Check constraints relevantes
SELECT
  tc.table_name AS tabla,
  tc.constraint_name AS constraint_name,
  cc.check_clause AS check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'CHECK'
  AND tc.table_name IN (
    'profiles', 'offers', 'user_roles', 'offer_votes', 'comments',
    'offer_events', 'offer_reports'
  )
ORDER BY tc.table_name, tc.constraint_name;
