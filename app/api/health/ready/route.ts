import { NextResponse } from 'next/server';
import { getHealthSnapshot } from '@/lib/monitoring/healthCheck';

/**
 * Readiness for operators. Public payload stays coarse: no table counts beyond the existing health probe,
 * no env values, no secrets.
 */
export async function GET() {
  const snapshot = await getHealthSnapshot();
  const ready = snapshot.status === 'ok';
  return NextResponse.json(
    {
      status: snapshot.status,
      ready,
      feedViewOk: snapshot.feedViewOk,
      checkedAt: snapshot.checkedAt,
    },
    { status: ready ? 200 : 503 }
  );
}
