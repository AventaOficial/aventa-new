import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';

export type PlazaDiscussion = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

function isMissingTable(message: string) {
  return /plaza_discussions|schema cache|does not exist/i.test(message);
}

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`plaza-dis:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ discussions: [] });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('plaza_discussions')
    .select('id, title, body, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ discussions: [], needsSetup: true });
    console.error('[plaza/discussions] GET', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar las conversaciones.' }, { status: 500 });
  }
  return NextResponse.json({ discussions: (data ?? []) as PlazaDiscussion[] });
}

export async function POST(request: Request) {
  const rl = await enforceRateLimit(`plaza-dis-w:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Inicia sesión para abrir una conversación.' }, { status: 401 });

  const supabase = createServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : '';
  if (title.length < 4 || text.length < 8) {
    return NextResponse.json({ error: 'Escribe un título y un mensaje.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('plaza_discussions')
    .insert({
      user_id: auth.user.id,
      title,
      body: text,
      status: 'approved',
    })
    .select('id, title, body, created_at')
    .single();
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: 'Plaza aún no está activa en la base de datos.' }, { status: 503 });
    }
    console.error('[plaza/discussions] POST', error.message);
    return NextResponse.json({ error: 'No se pudo publicar.' }, { status: 500 });
  }
  return NextResponse.json({ discussion: data as PlazaDiscussion });
}
