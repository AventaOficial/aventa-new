import type { BotIngestConfig } from './config';

const DEFAULT_GENERIC_RE =
  /réplica|replica|imitaci[oó]n|genérico|generico|sin marca|compatible con(?!\s+(iphone|samsung|apple|xiaomi|sony|hp|dell|lenovo|asus|lg))/i;

const DEFAULT_SPAM_RE =
  /\b(mayoreo|mayoreos|por caja|lote de\s*\d+|pregunta antes|no compres si)\b/i;

export function isLowQualityTitle(title: string, config: BotIngestConfig): boolean {
  const t = title.trim();
  if (t.length < 12) return true;
  const reGeneric = config.titleBlocklistGenericRe ?? DEFAULT_GENERIC_RE;
  const reSpam = config.titleBlocklistSpamRe ?? DEFAULT_SPAM_RE;
  if (reGeneric.test(t)) return true;
  if (reSpam.test(t)) return true;
  return false;
}
