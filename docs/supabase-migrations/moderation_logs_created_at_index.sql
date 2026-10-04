-- Índice para la reconciliación de Team XP (ventana de 48 h ordenada por created_at).
-- Sin él, /api/cron/team-xp-reconcile recorre moderation_logs completo.
-- Ejecutar FUERA de una transacción: CREATE INDEX CONCURRENTLY no admite BEGIN/COMMIT.
-- No aplicar a producción desde la app.
-- Rollback conceptual: DROP INDEX CONCURRENTLY public.moderation_logs_created_at_idx.

CREATE INDEX CONCURRENTLY IF NOT EXISTS moderation_logs_created_at_idx
  ON public.moderation_logs (created_at);
