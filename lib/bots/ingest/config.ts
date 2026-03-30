import { normalizeCategoryForStorage } from '@/lib/categories';

export type BotIngestConfig = {
  enabled: boolean;
  /** UUID del usuario bajo el cual se crean ofertas (moderación: pending). */
  botUserId: string | null;
  /** Máximo de URLs a procesar por corrida (protege tiempo de CPU / rate limits). */
  maxPerRun: number;
  /** Si el descuento inferido es menor a este %, no se inserta (0 = desactivado). */
  minDiscountPercent: number;
  /** Categoría canónica opcional; si no, `other`. */
  category: string | null;
  /** URLs desde env (una por línea o separadas por coma). */
  urlsFromEnv: string[];
};

/** Expone lista de URLs (tests y depuración). */
export function parseBotIngestUrlList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const lines = raw.split(/[\n,]+/);
  const out: string[] = [];
  for (const line of lines) {
    const u = line.trim();
    if (!u || u.startsWith('#')) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        out.push(parsed.href);
      }
    } catch {
      /* ignorar token inválido */
    }
  }
  return out;
}

export function loadBotIngestConfig(): BotIngestConfig {
  const enabled = process.env.BOT_INGEST_ENABLED === 'true' || process.env.BOT_INGEST_ENABLED === '1';
  const botUserId = process.env.BOT_INGEST_USER_ID?.trim() || null;
  const maxPerRun = Math.min(
    50,
    Math.max(1, Number.parseInt(process.env.BOT_INGEST_MAX_PER_RUN ?? '5', 10) || 5)
  );
  const minRaw = Number.parseInt(process.env.BOT_INGEST_MIN_DISCOUNT_PERCENT ?? '0', 10);
  const minDiscountPercent = Number.isFinite(minRaw) ? Math.min(100, Math.max(0, minRaw)) : 0;
  const catRaw = process.env.BOT_INGEST_CATEGORY?.trim();
  const category = catRaw ? normalizeCategoryForStorage(catRaw) : null;
  const urlsFromEnv = parseBotIngestUrlList(process.env.BOT_INGEST_URLS);

  return {
    enabled,
    botUserId,
    maxPerRun,
    minDiscountPercent,
    category,
    urlsFromEnv,
  };
}
