/**
 * Source expansion architecture — readiness assessment.
 * Does NOT implement every retailer. Observation + planning only.
 */

export type SourceReadinessStatus =
  | 'PRODUCTION_ACTIVE'
  | 'ADAPTER_READY_DISABLED'
  | 'PARTIAL_ADAPTER'
  | 'NOT_CONFIGURED'
  | 'NO_ADAPTER'
  | 'BLOCKED_TERMS_OR_CREDS';

export type SourceExpansionRow = {
  source: string;
  status: SourceReadinessStatus;
  has_legitimate_api: boolean | null;
  adapter_path: string | null;
  expected_marginal_value: 'high' | 'medium' | 'low' | 'unknown';
  scale_risk: 'low' | 'medium' | 'high';
  next_action: string;
  classification: 'FACT' | 'INFERENCE' | 'HYPOTHESIS';
  evidence: string;
};

/**
 * Static architecture matrix — update when adapters/creds change.
 */
export const SOURCE_EXPANSION_ARCHITECTURE: SourceExpansionRow[] = [
  {
    source: 'mercadolibre_mx',
    status: 'PRODUCTION_ACTIVE',
    has_legitimate_api: true,
    adapter_path: 'lib/bots/ingest/discoverMercadoLibre.ts + workers/mercadolibre-worker',
    expected_marginal_value: 'high',
    scale_risk: 'medium',
    next_action: 'Adaptive query/category rotation (page_1_only). Do not deepen pagination.',
    classification: 'FACT',
    evidence: 'Dominates production events; /products/search works; sticky surfaces measured.',
  },
  {
    source: 'amazon_mx',
    status: 'ADAPTER_READY_DISABLED',
    has_legitimate_api: true,
    adapter_path: 'lib/bots/ingest/amazonPaapi.ts + lib/hunter/sources/amazonPaapi.ts',
    expected_marginal_value: 'high',
    scale_risk: 'medium',
    next_action: 'Enable only with valid PA-API creds + ASIN seeds; observe before write path.',
    classification: 'FACT',
    evidence: 'PA-API adapter exists; requires credentials and seed ASINs.',
  },
  {
    source: 'walmart_mx',
    status: 'PARTIAL_ADAPTER',
    has_legitimate_api: false,
    adapter_path: 'lib/hunter/dayToDay (fail-closed flags)',
    expected_marginal_value: 'medium',
    scale_risk: 'high',
    next_action: 'Keep fail-closed until surface contracts stable; no brittle scrape expansion.',
    classification: 'FACT',
    evidence: 'Day-to-day registry present; discovery flags gate activation.',
  },
  {
    source: 'bodega_aurrera_mx',
    status: 'PARTIAL_ADAPTER',
    has_legitimate_api: false,
    adapter_path: 'lib/hunter/dayToDay',
    expected_marginal_value: 'medium',
    scale_risk: 'high',
    next_action: 'Same as Walmart — surface discovery only behind flags.',
    classification: 'FACT',
    evidence: 'Registered in dayToDay; not production discovery volume.',
  },
  {
    source: 'chedraui_mx',
    status: 'PARTIAL_ADAPTER',
    has_legitimate_api: false,
    adapter_path: 'lib/hunter/dayToDay/surfaces.ts',
    expected_marginal_value: 'low',
    scale_risk: 'high',
    next_action: 'Do not prioritize until ML adaptive efficiency improves.',
    classification: 'INFERENCE',
    evidence: 'Surfaces defined; low expected overlap with high-discount tech inventory.',
  },
  {
    source: 'liverpool_mx',
    status: 'NO_ADAPTER',
    has_legitimate_api: null,
    adapter_path: null,
    expected_marginal_value: 'unknown',
    scale_risk: 'high',
    next_action: 'Defer — needs dedicated adapter + ToS review.',
    classification: 'HYPOTHESIS',
    evidence: 'No adapter in repo.',
  },
  {
    source: 'coppel_mx',
    status: 'NO_ADAPTER',
    has_legitimate_api: null,
    adapter_path: null,
    expected_marginal_value: 'unknown',
    scale_risk: 'high',
    next_action: 'Defer.',
    classification: 'HYPOTHESIS',
    evidence: 'No adapter in repo.',
  },
  {
    source: 'costco_mx',
    status: 'NO_ADAPTER',
    has_legitimate_api: null,
    adapter_path: null,
    expected_marginal_value: 'unknown',
    scale_risk: 'high',
    next_action: 'Defer — membership/pricing model differs.',
    classification: 'HYPOTHESIS',
    evidence: 'No adapter in repo.',
  },
];

export function getSourceExpansionArchitecture(): {
  rows: SourceExpansionRow[];
  recommended_order: string[];
  note: string;
} {
  const recommended_order = SOURCE_EXPANSION_ARCHITECTURE.filter(
    (r) =>
      r.status === 'PRODUCTION_ACTIVE' ||
      r.status === 'ADAPTER_READY_DISABLED' ||
      r.status === 'PARTIAL_ADAPTER',
  )
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2, unknown: 3 };
      return rank[a.expected_marginal_value] - rank[b.expected_marginal_value];
    })
    .map((r) => r.source);

  return {
    rows: SOURCE_EXPANSION_ARCHITECTURE,
    recommended_order,
    note:
      'Do not implement all retailers. Maximize ML adaptive efficiency first; then Amazon PA-API with creds; then dayToDay flags.',
  };
}
