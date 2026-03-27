import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { flushWriteQueue } from '@/lib/server/writeQueue';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const batch = Number(process.env.WRITE_QUEUE_CRON_BATCH ?? '300');
  try {
    const result = await flushWriteQueue(batch);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'queue processing failed' },
      { status: 500 },
    );
  }
}

