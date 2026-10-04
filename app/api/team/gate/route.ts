import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { logTeamGate } from '@/lib/team/gate/log';
import { signInWithCookieClient, verifyPasswordForUser } from '@/lib/team/gate/password';
import { consumeGateAttempt, gateAttemptKey, readGateCredentials } from '@/lib/team/gate/policy';
import { readTeamActor } from '@/lib/team/gate/session';
import { signTeamGate, TEAM_GATE_COOKIE, TEAM_GATE_TTL_SECONDS, teamGateCookieOptions } from '@/lib/team/gate/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json({ ok: false, code: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

function denied() {
  return NextResponse.json(
    { ok: false, code: 'invalid_credentials' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

function configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY.length >= 16,
  );
}

async function issueGate(userId: string, sessionId: string, next: string) {
  const token = signTeamGate({ userId, sessionId });
  if (!token) return unavailable();
  const cookieStore = await cookies();
  cookieStore.set(
    TEAM_GATE_COOKIE,
    token,
    teamGateCookieOptions(TEAM_GATE_TTL_SECONDS, process.env.NODE_ENV === 'production'),
  );
  return NextResponse.json({ ok: true, next }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!configured()) {
    logTeamGate('unconfigured', null);
    return unavailable();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_body' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const credentials = readGateCredentials(body);
  if (!credentials.ok) {
    return NextResponse.json({ ok: false, code: 'invalid_body' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const actor = await readTeamActor();
    const attemptKey = gateAttemptKey({ userId: actor?.userId ?? null, email: credentials.email });
    if (!consumeGateAttempt(attemptKey, Date.now())) {
      logTeamGate('rate_limited', actor?.userId ?? null);
      return NextResponse.json(
        { ok: false, code: 'rate_limited' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (actor) {
      if (!actor.email) {
        logTeamGate('password_unavailable', actor.userId);
        return NextResponse.json(
          { ok: false, code: 'password_unavailable' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const verified = await verifyPasswordForUser(actor.email, credentials.password, actor.userId);
      if (!verified) {
        logTeamGate('rejected', actor.userId);
        return denied();
      }
      return issueGate(actor.userId, actor.sessionId, credentials.next);
    }

    if (!credentials.email) return denied();
    const established = await signInWithCookieClient(credentials.email, credentials.password);
    if (!established) {
      logTeamGate('rejected', null);
      return denied();
    }
    return issueGate(established.userId, established.sessionId, credentials.next);
  } catch {
    logTeamGate('gate_failed', null);
    return unavailable();
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(TEAM_GATE_COOKIE, '', teamGateCookieOptions(0, process.env.NODE_ENV === 'production'));
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
