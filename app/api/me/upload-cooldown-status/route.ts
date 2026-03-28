import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

function parseExemptConfig(raw: unknown): { ids: Set<string>; emails: Set<string> } {
  const ids = new Set<string>();
  const emails = new Set<string>();

  const addToken = (token: string) => {
    const t = token.trim().toLowerCase();
    if (!t) return;
    if (t.includes('@')) emails.add(t);
    else ids.add(t);
  };

  if (Array.isArray(raw)) {
    raw.forEach((v) => {
      if (typeof v === 'string') addToken(v);
    });
    return { ids, emails };
  }

  if (typeof raw === 'string') {
    raw
      .split(/[,\n;]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach(addToken);
    return { ids, emails };
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as { ids?: unknown; emails?: unknown };
    if (Array.isArray(obj.ids)) obj.ids.forEach((v) => typeof v === 'string' && addToken(v));
    if (Array.isArray(obj.emails)) obj.emails.forEach((v) => typeof v === 'string' && addToken(v));
  }

  return { ids, emails };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ exempt: false }, { status: 401 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user?.id) {
    return NextResponse.json({ exempt: false }, { status: 401 });
  }

  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'upload_cooldown_exempt_user_ids')
    .maybeSingle();

  const raw = (data as { value?: unknown } | null)?.value;
  const { ids, emails } = parseExemptConfig(raw);
  const exempt = ids.has(user.id.toLowerCase()) || (user.email ? emails.has(user.email.toLowerCase()) : false);

  return NextResponse.json({ exempt });
}

