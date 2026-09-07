export type FocusModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  category: string | null;
  store: string | null;
  coupons?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  original_offer_url?: string | null;
  description?: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  moderator_comment?: string | null;
  bot_meta?: unknown;
  is_bot?: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  locked_by_name?: string | null;
  snoozed_until?: string | null;
  link_mod_ok?: boolean | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

export type FocusSourceTab = 'all' | 'bot' | 'users';

export type FocusQueueStats = {
  globalPending: number;
  availableEstimate: number;
};
