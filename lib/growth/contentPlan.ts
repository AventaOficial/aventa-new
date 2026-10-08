/**
 * Plan de contenido. No es un CMS.
 * Un ganador se declara solo con ventas confirmadas, que hoy no están conectadas.
 */

export type ContentPlanItem = {
  contentId: string;
  campaign: string;
  channel: string;
  landing: string;
  target: number | null;
  published: boolean;
  confirmedSales: number | null;
};

export const CONTENT_PLAN: readonly ContentPlanItem[] = [];

export function contentWinner(item: ContentPlanItem): 'WINNER' | 'DATA_NOT_AVAILABLE' | 'PUBLISHED' {
  if (item.confirmedSales == null) return item.published ? 'PUBLISHED' : 'DATA_NOT_AVAILABLE';
  return item.confirmedSales > 0 ? 'WINNER' : 'PUBLISHED';
}
