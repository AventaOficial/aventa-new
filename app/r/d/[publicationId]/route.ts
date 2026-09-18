import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { resolveDistributionHop } from '@/lib/distribution/hop';

export const dynamic = 'force-dynamic';

/**
 * GET /r/d/{publicationId}
 * Server-side CTA hop → recordAttributedClick → 302 to offers.offer_url.
 * Never trusts client destination URLs.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicationId: string }> },
) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit(`dist-hop:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const { publicationId } = await context.params;
  const result = await resolveDistributionHop({
    publicationId: publicationId ?? '',
    ip,
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.redirect(result.redirectUrl, 302);
}
