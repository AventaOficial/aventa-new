import type { StaffFilmCandidate } from '@/lib/staff/workBoard';

export type MarketingContentStatus = 'ideas' | 'to_film' | 'editing' | 'published';

export type MarketingPipelineEntry = {
  offerId: string;
  status: MarketingContentStatus;
  selectedAt: string;
  publishedAt?: string;
  notes?: string;
  videoUrl?: string;
  videoNetwork?: 'tiktok' | 'instagram' | 'x' | '';
};

export type MarketingPipeline = {
  items: MarketingPipelineEntry[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export const MARKETING_PIPELINE_KEY = 'staff_marketing_pipeline';

export function emptyMarketingPipeline(): MarketingPipeline {
  return { items: [], updatedAt: null, updatedBy: null };
}

export function parseMarketingPipeline(raw: unknown): MarketingPipeline {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyMarketingPipeline();
  const obj = raw as Record<string, unknown>;
  const rows = Array.isArray(obj.items) ? obj.items : [];
  const items: MarketingPipelineEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const offerId = typeof r.offerId === 'string' ? r.offerId.trim() : '';
    const status = r.status;
    if (!offerId || seen.has(offerId)) continue;
    if (status !== 'ideas' && status !== 'to_film' && status !== 'editing' && status !== 'published') continue;
    seen.add(offerId);
    items.push({
      offerId,
      status,
      selectedAt: typeof r.selectedAt === 'string' ? r.selectedAt : new Date().toISOString(),
      publishedAt: typeof r.publishedAt === 'string' ? r.publishedAt : undefined,
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 500) : undefined,
      videoUrl: typeof r.videoUrl === 'string' ? r.videoUrl.slice(0, 500) : undefined,
      videoNetwork:
        r.videoNetwork === 'tiktok' || r.videoNetwork === 'instagram' || r.videoNetwork === 'x'
          ? r.videoNetwork
          : '',
    });
  }

  return {
    items: items.slice(0, 80),
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : null,
    updatedBy: typeof obj.updatedBy === 'string' ? obj.updatedBy : null,
  };
}

export function serializeMarketingPipeline(p: MarketingPipeline): MarketingPipeline {
  return {
    items: p.items.slice(0, 80),
    updatedAt: p.updatedAt,
    updatedBy: p.updatedBy,
  };
}

export type MarketingContentCard = StaffFilmCandidate & {
  clicks7d: number | null;
  pipelineStatus: MarketingContentStatus | null;
  potential: 'alta' | 'media' | 'baja';
  pipelineNotes?: string;
  publishedAt?: string;
  videoUrl?: string;
};

export function scorePotential(discountPercent: number | null, clicks7d: number | null): 'alta' | 'media' | 'baja' {
  const disc = discountPercent ?? 0;
  const clicks = clicks7d ?? 0;
  if (disc >= 40 || clicks >= 15) return 'alta';
  if (disc >= 25 || clicks >= 5) return 'media';
  return 'baja';
}

export function buildMarketingCopyText(card: StaffFilmCandidate): string {
  const lines = [
    card.title,
    card.store ? `Tienda: ${card.store}` : '',
    `Precio: $${card.price.toLocaleString('es-MX')}`,
    card.originalPrice != null ? `Antes: $${card.originalPrice.toLocaleString('es-MX')}` : '',
    card.discountPercent != null ? `Descuento: -${card.discountPercent}%` : '',
    card.offerUrl ? `Enlace: ${card.offerUrl}` : '',
    'Oferta en AVENTA · comunidad de cazadores',
  ].filter(Boolean);
  return lines.join('\n');
}
