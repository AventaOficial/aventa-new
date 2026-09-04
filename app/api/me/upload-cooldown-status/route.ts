import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getUploadCooldownStatus } from '@/lib/server/uploadCooldown';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ exempt: false, canUpload: false }, { status: 401 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user?.id) {
    return NextResponse.json({ exempt: false, canUpload: false }, { status: 401 });
  }

  const status = await getUploadCooldownStatus(supabase, user);
  return NextResponse.json(status);
}
