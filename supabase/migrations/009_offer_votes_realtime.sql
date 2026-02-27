-- Enable Realtime for offer_votes (required for useOfferVotesRealtime hook)
ALTER PUBLICATION supabase_realtime ADD TABLE public.offer_votes;

-- Ensure old record is sent on DELETE (needed to get offer_id when a vote is removed)
ALTER TABLE public.offer_votes REPLICA IDENTITY FULL;
