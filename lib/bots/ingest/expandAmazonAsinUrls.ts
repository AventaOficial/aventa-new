import type { BotIngestConfig } from './config';

/** Convierte ASINs configurados en URLs /dp/ para el mismo flujo de parseo HTML. */
export function expandAmazonAsinUrls(config: BotIngestConfig): string[] {
  return config.amazonAsins.map((asin) => `${config.amazonDpBase}${asin}`);
}
