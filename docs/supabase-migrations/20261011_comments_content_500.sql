-- Elevar el límite de comentarios de oferta de 280 a 500 caracteres.
-- Estado: PREPARADA, NO APLICADA. Requiere revisión y aplicación manual.
--
-- Producción tiene hoy `public.comments.content varchar(280)` (ver FOUNDATION_BASELINE_20260917.sql).
-- La app mantiene OFFER_COMMENT_MAX_CHARS = OFFER_COMMENT_DB_MAX_CHARS (280) en
-- lib/contracts/offerComments.ts. Tras aplicar esta migración, subir
-- OFFER_COMMENT_DB_MAX_CHARS a 500 para activar el nuevo límite.
--
-- Ampliar varchar(n) a un n mayor es una operación solo de catálogo en Postgres
-- (sin reescritura de tabla) y no afecta filas existentes.

ALTER TABLE public.comments
  ALTER COLUMN content TYPE varchar(500);
