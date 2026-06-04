import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runOfferHealthBatch } from '@/lib/offers/runOfferHealthBatch';

/** Verificación de salud de ofertas (precio / agotado). Programado cada 4 h en Vercel. */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runOfferHealthBatch();

  return NextResponse.json({
    ok: true,
    scheduleNote: 'Hasta 25 ofertas por ejecución; prioridad por clics 7d y precio cambiado.',
    ...result,
  });
}
