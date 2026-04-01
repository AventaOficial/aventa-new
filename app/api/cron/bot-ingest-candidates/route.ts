import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import {
  processExternalWorkerBatch,
  type ExternalWorkerBatchPayload,
} from '@/lib/bots/ingest/externalWorker';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as ExternalWorkerBatchPayload | null;
    if (!body || !Array.isArray(body.candidates)) {
      return NextResponse.json(
        { ok: false, error: 'Payload inválido: se esperaba { candidates: [] }' },
        { status: 400 }
      );
    }

    const report = await processExternalWorkerBatch(body);
    return NextResponse.json(report, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
