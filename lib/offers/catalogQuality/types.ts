import type { CategoryId } from '@/lib/categories';

export type CatalogFindingSeverity = 'low' | 'medium' | 'high';

/** `confirmed` = regla demostrable; `review` = anomalía que requiere humano. */
export type CatalogFindingKind = 'confirmed' | 'review';

export type CatalogProblemType =
  | 'category_mismatch'
  | 'original_price_unprovenanced'
  | 'discount_unverifiable'
  | 'price_format_anomaly'
  | 'low_quality_title'
  | 'repeated_description'
  | 'missing_image'
  | 'multi_risk';

export type CatalogQualityFinding = {
  type: CatalogProblemType;
  kind: CatalogFindingKind;
  severity: CatalogFindingSeverity;
  evidence: string;
  fields: string[];
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  ruleId?: string;
  suggestedCategory?: CategoryId | null;
};

export type CatalogOfferRow = {
  id: string;
  status?: string | null;
  title?: string | null;
  store?: string | null;
  category?: string | null;
  price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  description?: string | null;
  hunter_comment?: string | null;
  moderator_comment?: string | null;
  bot_meta?: unknown;
};

export type CatalogAssessment = {
  offerId: string;
  status: string | null;
  findings: CatalogQualityFinding[];
};

export type CatalogQualityReport = {
  generatedAt: string;
  dataSource: 'fixtures' | 'supabase' | 'stdin';
  limitation: string | null;
  inspected: number;
  withFindings: number;
  byType: Record<CatalogProblemType, number>;
  bySeverity: Record<CatalogFindingSeverity, number>;
  samples: CatalogAssessment[];
};
