-- Add upvotes_count, downvotes_count to offers (single source of truth for vote counts)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'upvotes_count') THEN
    ALTER TABLE public.offers ADD COLUMN upvotes_count integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'downvotes_count') THEN
    ALTER TABLE public.offers ADD COLUMN downvotes_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Backfill from offer_votes
UPDATE public.offers o
SET
  upvotes_count = COALESCE(v.up_cnt, 0),
  downvotes_count = COALESCE(v.down_cnt, 0)
FROM (
  SELECT
    offer_id,
    COUNT(*) FILTER (WHERE value = 1)::int AS up_cnt,
    COUNT(*) FILTER (WHERE value = -1)::int AS down_cnt
  FROM public.offer_votes
  GROUP BY offer_id
) v
WHERE v.offer_id = o.id;

-- Update recalculate_offer_metrics to set upvotes_count, downvotes_count
CREATE OR REPLACE FUNCTION public.recalculate_offer_metrics(p_offer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH m AS (
    SELECT
      (SELECT COUNT(*)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS votes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = 1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS upvotes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = -1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS downvotes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = 1) - COUNT(*) FILTER (WHERE value = -1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS score,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'outbound'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS outbound_24h,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'view'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS views_24h
  )
  UPDATE public.offers o
  SET
    votes_count = COALESCE(m.votes_count, 0),
    upvotes_count = COALESCE(m.upvotes_count, 0),
    downvotes_count = COALESCE(m.downvotes_count, 0),
    outbound_24h = COALESCE(m.outbound_24h, 0),
    ctr_24h = CASE WHEN COALESCE(m.views_24h, 0) > 0 THEN ROUND((COALESCE(m.outbound_24h, 0)::numeric / NULLIF(m.views_24h, 0)) * 100, 2) ELSE 0 END,
    ranking_momentum = (
      COALESCE(m.score, 0)
      + (COALESCE(m.outbound_24h, 0) * 0.3)
      + (CASE WHEN COALESCE(m.views_24h, 0) > 0 THEN (COALESCE(m.outbound_24h, 0)::numeric / NULLIF(m.views_24h, 0)) * 100 * 0.5 ELSE 0 END)
    )
  FROM m
  WHERE o.id = p_offer_id;
$$;

-- Trigger: recalculate offers when offer_votes changes
CREATE OR REPLACE FUNCTION public.trigger_recalculate_offer_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_offer_metrics(OLD.offer_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalculate_offer_metrics(NEW.offer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_votes_recalculate ON public.offer_votes;
CREATE TRIGGER trg_offer_votes_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.offer_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_offer_on_vote();

-- Update ofertas_ranked_general: read vote counts from offers (single source of truth)
CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.store,
  o.offer_url,
  o.description,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) - COALESCE(o.downvotes_count, 0))::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
