import type { SupabaseClient } from '@supabase/supabase-js';
import type { NegativeMemoryEvent } from './types';

type OfferRow = {
  product_fingerprint: string | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  category?: string | null;
  bot_meta?: unknown;
};

function sourceFromBotMeta(botMeta: unknown): string | null {
  if (!botMeta || typeof botMeta !== 'object') return null;
  const src = (botMeta as { source?: unknown }).source;
  return typeof src === 'string' && src.trim() ? src.trim() : null;
}

/**
 * Carga historial de Negative Memory por fingerprints fuertes (ml:/amz:).
 * Fail-soft: si la query falla, retorna mapa vacío (discovery continúa sin memoria).
 */
export async function loadNegativeMemoryEvents(
  supabase: SupabaseClient,
  fingerprints: readonly string[],
): Promise<Map<string, NegativeMemoryEvent[]>> {
  const out = new Map<string, NegativeMemoryEvent[]>();
  const unique = [...new Set(fingerprints.filter((f) => typeof f === 'string' && f.length > 0))];
  if (unique.length === 0) return out;

  // Chunk para evitar URLs enormes en .in()
  const chunkSize = 80;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('offers')
      .select('product_fingerprint, status, rejection_reason, created_at, category, bot_meta')
      .in('product_fingerprint', chunk)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (error || !data) continue;

    for (const row of data as OfferRow[]) {
      const fp = row.product_fingerprint;
      if (!fp || !row.created_at) continue;
      const ev: NegativeMemoryEvent = {
        fingerprint: fp,
        status: row.status ?? 'unknown',
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
        source: sourceFromBotMeta(row.bot_meta),
        category: row.category ?? null,
      };
      const list = out.get(fp) ?? [];
      list.push(ev);
      out.set(fp, list);
    }
  }

  return out;
}
