import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveCaptureSourceId } from './policy';

export const PRICE_CAPTURE_CONFIG_KEY = 'despensa_price_capture';

/** Topes duros: la fila de `app_config` puede bajarlos, nunca subirlos por encima de esto. */
export const PRICE_CAPTURE_HARD_LIMITS = {
  maxCandidates: 60,
  maxPerSource: 40,
  budgetMs: 120_000,
  candidatePool: 10_000,
} as const;

export type PriceCaptureConfig = {
  enabled: boolean;
  /** Por qué está apagada, para el registro. */
  disabledReason: 'no_config_row' | 'config_read_failed' | 'disabled' | 'paused' | null;
  maxCandidates: number;
  maxPerSource: Record<ActiveCaptureSourceId, number>;
  budgetMs: number;
  /** Un producto no se vuelve a capturar antes de esto. */
  minHoursBetweenCaptures: number;
  /**
   * Ofertas elegibles que se recorren por corrida (paginado por `id`, 500 por página). No es un
   * «top N recientes»: si el universo no cabe, el inicio rota cada día y el reporte lo marca.
   */
  candidatePool: number;
  sources: readonly ActiveCaptureSourceId[];
};

export const PRICE_CAPTURE_DEFAULTS: Omit<PriceCaptureConfig, 'enabled' | 'disabledReason'> = {
  maxCandidates: 24,
  maxPerSource: { mercadolibre_mx: 20 },
  budgetMs: 60_000,
  minHoursBetweenCaptures: 20,
  candidatePool: 2_000,
  sources: ['mercadolibre_mx'],
};

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Solo fuentes activas. Amazon (PA-API retirada) no se puede encender desde `app_config`. */
const KNOWN_SOURCES: readonly ActiveCaptureSourceId[] = ['mercadolibre_mx'];

/**
 * Interpreta el valor de `app_config.despensa_price_capture`. Apagada salvo `{ "enabled": true }`
 * explícito; `"paused": true` la detiene sin borrar la configuración.
 */
export function parsePriceCaptureConfig(value: unknown): PriceCaptureConfig {
  const off = (reason: PriceCaptureConfig['disabledReason']): PriceCaptureConfig => ({
    ...PRICE_CAPTURE_DEFAULTS,
    enabled: false,
    disabledReason: reason,
  });
  if (value == null) return off('no_config_row');
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return off('disabled');
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return off('disabled');
  const v = value as Record<string, unknown>;
  if (v.enabled !== true) return off('disabled');
  if (v.paused === true) return off('paused');

  const perSource = (v.maxPerSource ?? {}) as Record<string, unknown>;
  const sources = Array.isArray(v.sources)
    ? KNOWN_SOURCES.filter((s) => (v.sources as unknown[]).includes(s))
    : PRICE_CAPTURE_DEFAULTS.sources;
  const H = PRICE_CAPTURE_HARD_LIMITS;
  const D = PRICE_CAPTURE_DEFAULTS;
  return {
    enabled: true,
    disabledReason: null,
    maxCandidates: clampInt(v.maxCandidates, D.maxCandidates, 1, H.maxCandidates),
    maxPerSource: {
      mercadolibre_mx: clampInt(perSource.mercadolibre_mx, D.maxPerSource.mercadolibre_mx, 0, H.maxPerSource),
    },
    budgetMs: clampInt(v.budgetMs, D.budgetMs, 1_000, H.budgetMs),
    minHoursBetweenCaptures: clampInt(v.minHoursBetweenCaptures, D.minHoursBetweenCaptures, 1, 24 * 7),
    candidatePool: clampInt(v.candidatePool, D.candidatePool, 1, H.candidatePool),
    sources,
  };
}

export async function readPriceCaptureConfig(supabase: SupabaseClient): Promise<PriceCaptureConfig> {
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', PRICE_CAPTURE_CONFIG_KEY).maybeSingle();
    if (error) return { ...parsePriceCaptureConfig(null), disabledReason: 'config_read_failed' };
    return parsePriceCaptureConfig((data as { value?: unknown } | null)?.value ?? null);
  } catch {
    return { ...parsePriceCaptureConfig(null), disabledReason: 'config_read_failed' };
  }
}
