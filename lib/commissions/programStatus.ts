/** El programa solo paga cuando el owner lo activa explícitamente (términos §8). */
export function isCommissionProgramPubliclyActive(): boolean {
  const raw = (process.env.COMMISSION_PROGRAM_ACTIVE ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const AMAZON_ASSOCIATES_DISCLOSURE =
  'As an Amazon Associate I earn from qualifying purchases.';

export const AFFILIATE_DISCLOSURE_ES =
  'AVENTA puede recibir compensación por enlaces comerciales (Amazon, Mercado Libre y otras tiendas). El ranking de ofertas sigue siendo por votos de la comunidad.';
