import { NextResponse } from 'next/server';
import { getHealthSnapshot } from '@/lib/monitoring/healthCheck';

/** GET: salud simple (DB + vista de feed). Público para probes. */
export async function GET() {
  const snapshot = await getHealthSnapshot();
  const httpStatus =
    snapshot.status === 'ok' ? 200 : snapshot.status === 'degraded' ? 200 : 503;

  return NextResponse.json(
    {
      status: snapshot.status,
      offersCount: snapshot.offersCount,
      feedViewOk: snapshot.feedViewOk,
      checkedAt: snapshot.checkedAt,
      ...(snapshot.message ? { message: snapshot.message } : {}),
    },
    { status: httpStatus }
  );
}
