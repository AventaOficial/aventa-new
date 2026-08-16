import { NextResponse } from 'next/server';
import { getSocialLinks } from '@/lib/social/config';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`social:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ social: { tiktok: '', instagram: '', x: '' } });
  const social = await getSocialLinks();
  return NextResponse.json({
    social: {
      tiktok: social.tiktok,
      instagram: social.instagram,
      x: social.x,
    },
  });
}
