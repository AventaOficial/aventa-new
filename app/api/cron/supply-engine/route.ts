import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import {
  parseSupplyEngineMode,
  runSupplyEngine,
  summarizeSupplyEngineReport,
} from '@/lib/hunter/supply';

/**
 * Supply Engine cron — rotación de NicheHunterProfiles + pipeline común.
 * Default mode: shadow (o SUPPLY_ENGINE_MODE). Nunca escribe ofertas sin
 * mode=enabled + SUPPLY_ENGINE_WRITE=1.
 *
 * Auth: Authorization Bearer CRON_SECRET | x-cron-secret (sin query secrets).
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const mode = parseSupplyEngineMode(sp.get('mode') ?? process.env.SUPPLY_ENGINE_MODE);
  const nicheId = sp.get('niche');
  const waveRaw = sp.get('wave');
  const wave = waveRaw != null && waveRaw !== '' ? Number(waveRaw) : null;

  after(async () => {
    try {
      const report = await runSupplyEngine({
        mode,
        nicheId: nicheId || null,
        wave: Number.isFinite(wave) ? wave : null,
      });
      console.log('[supply-engine:after]', JSON.stringify(summarizeSupplyEngineReport(report)));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[supply-engine:after]', message);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      mode,
      nicheId: nicheId || null,
      note: 'Supply Engine en segundo plano. Revisa logs Vercel / Admin Hunter.',
    },
    {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
