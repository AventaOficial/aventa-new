import type {
  DISTRIBUTION_DESTINATION_KINDS,
  DISTRIBUTION_EVENT_TYPES,
  DISTRIBUTION_PROVIDERS,
  DISTRIBUTION_PUBLICATION_STATUSES,
} from './constants';

export type DistributionProvider = (typeof DISTRIBUTION_PROVIDERS)[number];
export type DistributionDestinationKind = (typeof DISTRIBUTION_DESTINATION_KINDS)[number];
export type DistributionPublicationStatus = (typeof DISTRIBUTION_PUBLICATION_STATUSES)[number];
export type DistributionEventType = (typeof DISTRIBUTION_EVENT_TYPES)[number];

export type DistributionBrandRow = {
  id: string;
  slug: string;
  display_name: string;
  status: 'active' | 'disabled';
};

export type DistributionDestinationRow = {
  id: string;
  brand_id: string;
  provider: DistributionProvider;
  slug: string;
  display_name: string;
  external_destination_key: string;
  credential_ref: string | null;
  status: 'active' | 'paused' | 'disabled';
  kind: DistributionDestinationKind;
  category_ids: string[];
  tracking_campaign_key: string | null;
};

/** Offer fields required for eligibility + routing (read-only). */
export type DistributionOfferSnapshot = {
  id: string;
  status: string;
  expires_at: string | null;
  category: string | null;
  coupons: string | null;
  bank_coupon: string | null;
};

/** Metadata a future tracking hop may attach — does not modify attribution code. */
export type DistributionTrackingContext = {
  publicationId: string;
  offerId: string;
  destinationId: string;
  provider: DistributionProvider;
  campaignKey: string | null;
  source: 'distribution';
};

export type EnqueueDistributionResult =
  | { ok: true; skipped: 'flag_disabled' }
  | { ok: true; skipped: 'not_distributable'; reason: string }
  | { ok: true; skipped: 'no_destinations' }
  | {
      ok: true;
      created: number;
      reused: number;
      publicationIds: string[];
    }
  | { ok: false; error: string };
