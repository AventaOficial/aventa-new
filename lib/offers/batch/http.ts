import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function requireBatchAuth(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  return { user: auth.user, supabase: createServerClient() };
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}
