import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  listDistributionOpsPublications,
  parseOpsStatusFilter,
  releaseUnknownOutcomeForOps,
} from '@/lib/distribution/opsSurface';

/**
 * GET — list Distribution publications for C3 ops (publishing / unknown / retryable / published).
 * Owner/admin only. Never returns secrets. Never calls providers.
 */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const filter = parseOpsStatusFilter(url.searchParams.get('status'));
    if (!filter) {
      return NextResponse.json(
        { error: 'invalid_status_filter', ok: false },
        { status: 400 },
      );
    }
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 50;

    const supabase = createServerClient();
    const result = await listDistributionOpsPublications(supabase, {
      filter,
      limit: Number.isFinite(limit) ? limit : 50,
      env: process.env,
    });

    return NextResponse.json({
      ...result,
      actorRole: auth.role,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list_failed';
    console.error('[distribution-ops] GET', message);
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}

/**
 * POST — releaseUnknownOutcomeToRetryable (operator-only).
 * Body: { publicationId: string, reason?: string }
 * Re-reads DB status; uses C3 CAS. Never publishes / never providers.
 */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, reason: 'invalid_body' },
        { status: 400 },
      );
    }

    const action = (body as { action?: unknown }).action;
    if (action !== undefined && action !== 'release_unknown_to_retryable') {
      return NextResponse.json(
        { ok: false, reason: 'unsupported_action' },
        { status: 400 },
      );
    }

    const publicationId = (body as { publicationId?: unknown }).publicationId;
    const reasonRaw = (body as { reason?: unknown }).reason;
    const reason =
      typeof reasonRaw === 'string' ? reasonRaw.slice(0, 200) : undefined;

    const supabase = createServerClient();
    const result = await releaseUnknownOutcomeForOps(supabase, publicationId, {
      reason: reason ?? `ops_release_by_${auth.role}`,
    });

    if (!result.ok) {
      const status =
        result.reason === 'invalid_publication_id'
          ? 400
          : result.reason === 'publication_not_found'
            ? 404
            : result.reason === 'not_unknown_outcome'
              ? 409
              : 409;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json({
      ...result,
      actorRole: auth.role,
      providerInvoked: false,
      offerMutated: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'release_failed';
    console.error('[distribution-ops] POST', message);
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}
