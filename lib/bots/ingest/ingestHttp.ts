export const BOT_INGEST_USER_AGENT =
  'Mozilla/5.0 (compatible; AVENTA-Bot-Ingest/3.0; +https://aventaofertas.com)';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
