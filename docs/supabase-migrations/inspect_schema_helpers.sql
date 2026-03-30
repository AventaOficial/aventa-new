-- Consultas útiles para explorar el esquema en Supabase (SQL Editor).
-- No modifica datos; solo lectura de catálogo.

-- 1) Tablas del esquema public (excl. internas de Supabase si aplica)
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2) Columnas de una tabla concreta (cambia 'profiles' por la que quieras)
SELECT
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3) Columnas de todas las tablas public (vista rápida)
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- 4) Funciones definidas en public (nombre y tipo de retorno)
SELECT
  p.proname AS function_name,
  pg_catalog.pg_get_function_result(p.oid) AS result_type
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
