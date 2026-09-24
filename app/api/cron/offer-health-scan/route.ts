import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runOfferHealthBatch } from '@/lib/offers/runOfferHealthBatch';

/** Verificación de salud. Schedule real en vercel.json: minuto 15, cada 2 horas. Lote acotado, no un scan completo. */
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
