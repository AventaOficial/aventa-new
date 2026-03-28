import { NextResponse } from 'next/server';
import { pushClientEvent } from '@/lib/monitoring/serverClientEventStore';
import type { ClientLogEventType } from '@/lib/monitoring/clientLogger';

const ALLOWED: ClientLogEventType[] = ['view', 'vote', 'error', 'api_error'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function notifyWebhookIfNeeded(metadata: Record<string, unknown> | undefined): Promise<void> {
  if (metadata?.alert !== 'feed_streak_5') return;
  const url = process.env.MONITORING_ALERT_WEBHOOK_URL;
  if (!url?.trim()) return;
  const body = {
    text: 'AVENTA: 5+ errores seguidos al cargar el feed (cliente)',
    alert: 'feed_streak_5',
    at: new Date().toISOString(),
  };
  try {
    await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore */
  }
}

/** POST: eventos de cliente para visibilidad (buffer en memoria en esta instancia). */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isRecord(json)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const type = json.type;
  const source = json.source;
  if (typeof type !== 'string' || !ALLOWED.includes(type as ClientLogEventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof source !== 'string' || source.length > 200) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let metadata: Record<string, unknown> | undefined;
  if (json.metadata !== undefined) {
    if (!isRecord(json.metadata)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    metadata = json.metadata;
  }

  const at = typeof json.ts === 'string' ? json.ts : undefined;

  pushClientEvent({ type, source, metadata, at });

  void notifyWebhookIfNeeded(metadata);

  return NextResponse.json({ ok: true });
}
