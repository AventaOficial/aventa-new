import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isLowQualityTitle } from '@/lib/bots/ingest/isLowQualityTitle';
import { assessCategoryConsistency } from './categoryConsistency';
import { assessPriceSignals, resolvePriceProvenance } from './priceSignals';
import type { CatalogAssessment, CatalogOfferRow, CatalogQualityFinding } from './types';

function normalizeDescriptionKey(text: string | null | undefined): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.length < 40) return null;
  return t.slice(0, 500);
}

function isValidPublicImage(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  return Boolean(u) && /^https:\/\//i.test(u) && !/placeholder|1x1|grey-pixel/i.test(u);
}

function inferSource(row: CatalogOfferRow): 'community' | 'bot' | 'machine' | 'unknown' {
  const mc = (row.moderator_comment ?? '').toLowerCase();
  if (mc.includes('[bot-ingest]')) return 'bot';
  if (row.bot_meta && typeof row.bot_meta === 'object') return 'machine';
  return 'unknown';
}

export function assessCatalogOfferRow(row: CatalogOfferRow): CatalogAssessment {
  const findings: CatalogQualityFinding[] = [];
  const source = inferSource(row);
  const provenance = resolvePriceProvenance({
    source: source === 'bot' ? 'bot' : source === 'machine' ? 'machine' : 'community',
    botMeta: row.bot_meta,
  });

  const cat = assessCategoryConsistency({
    title: row.title,
    category: row.category,
    store: row.store,
  });
  if (!cat.ok) {
    findings.push({
      type: 'category_mismatch',
      kind: cat.kind,
      severity: cat.kind === 'confirmed' ? 'high' : 'medium',
      evidence: cat.evidence,
      fields: ['category', 'title'],
      recommendation:
        cat.kind === 'confirmed'
          ? `Corregir categoría a ${cat.inferred}`
          : 'Revisar categoría con moderación',
      confidence: cat.kind === 'confirmed' ? 'high' : 'medium',
      ruleId: cat.ruleId,
      suggestedCategory: cat.inferred,
    });
  }

  for (const p of assessPriceSignals({
    price: row.price,
    original_price: row.original_price,
    provenance,
  })) {
    findings.push({
      type: p.type,
      kind: p.kind,
      severity: p.severity,
      evidence: p.evidence,
      fields: ['price', 'original_price'],
      recommendation:
        p.type === 'original_price_unprovenanced'
          ? 'Quitar original_price o documentar procedencia de página'
          : p.type === 'discount_unverifiable'
            ? 'No mostrar % de descuento hasta verificar'
            : 'Revisar formato de precio',
      confidence: p.kind === 'confirmed' ? 'high' : 'medium',
    });
  }

  const title = row.title ?? '';
  if (title.trim() && isLowQualityTitle(title, loadBotIngestConfig())) {
    findings.push({
      type: 'low_quality_title',
      kind: 'review',
      severity: 'medium',
      evidence: `Título corto o bloqueado por reglas de calidad (${title.slice(0, 80)}…)`,
      fields: ['title'],
      recommendation: 'Reescribir título con producto y tienda claros',
      confidence: 'medium',
    });
  }

  const descKey = normalizeDescriptionKey(row.description);
  if (descKey && /revisa disponibilidad, env[ií]o y condiciones en el enlace/i.test(descKey)) {
    findings.push({
      type: 'repeated_description',
      kind: 'review',
      severity: 'low',
      evidence: 'Descripción con plantilla genérica de bot',
      fields: ['description'],
      recommendation: 'Personalizar descripción o acortar plantilla',
      confidence: 'medium',
    });
  }

  if (!isValidPublicImage(row.image_url)) {
    findings.push({
      type: 'missing_image',
      kind: 'review',
      severity: 'medium',
      evidence: 'Sin image_url https válida',
      fields: ['image_url'],
      recommendation: 'Añadir foto de producto desde la tienda',
      confidence: 'high',
    });
  }

  const highOrConfirmed = findings.filter((f) => f.severity === 'high' || f.kind === 'confirmed');
  if (highOrConfirmed.length >= 2) {
    findings.push({
      type: 'multi_risk',
      kind: 'review',
      severity: 'high',
      evidence: `${highOrConfirmed.length} señales de riesgo simultáneas`,
      fields: ['*'],
      recommendation: 'Priorizar en moderación',
      confidence: 'high',
    });
  }

  return {
    offerId: row.id,
    status: row.status ?? null,
    findings,
  };
}

export function buildCatalogQualityReport(input: {
  rows: CatalogOfferRow[];
  dataSource: 'fixtures' | 'supabase' | 'stdin';
  limitation: string | null;
  sampleLimit: number;
}): import('./types').CatalogQualityReport {
  const assessments = input.rows.map(assessCatalogOfferRow);
  const withFindings = assessments.filter((a) => a.findings.length > 0);
  const byType = {} as Record<import('./types').CatalogProblemType, number>;
  const bySeverity = { low: 0, medium: 0, high: 0 } as Record<'low' | 'medium' | 'high', number>;
  for (const a of withFindings) {
    for (const f of a.findings) {
      byType[f.type] = (byType[f.type] ?? 0) + 1;
      bySeverity[f.severity] += 1;
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    dataSource: input.dataSource,
    limitation: input.limitation,
    inspected: input.rows.length,
    withFindings: withFindings.length,
    byType,
    bySeverity,
    samples: withFindings.slice(0, input.sampleLimit),
  };
}
