import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { flushWriteQueue, getWriteQueueBacklog } from '@/lib/server/writeQueue';

export async function POST(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const batch = Number(searchParams.get('batch') ?? '100');

  try {
    const result = await flushWriteQueue(batch);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'queue flush failed',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const backlog = await getWriteQueueBacklog();
  return NextResponse.json({ ok: true, backlog });
}

