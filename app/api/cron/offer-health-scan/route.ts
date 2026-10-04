import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runOfferHealthBatch } from '@/lib/offers/runOfferHealthBatch';

/** Verificación de salud. Schedule en vercel.json: `0 3 * * *` (03:00 UTC). Lote acotado, no un scan completo. */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runOfferHealthBatch();

  return NextResponse.json({
    ok: true,
    scheduleNote:
      'Cola resumible. Default 30 ofertas/ejecución (máx 50). Prioridad: tráfico, recencia, volatilidad, antigüedad del check.',
    ...result,
  });
}
