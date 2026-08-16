import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';

export type PlazaRequest = {
  id: string;
  title: string;
  details: string | null;
  budget_max: number | null;
  preferred_store: string | null;
  created_at: string;
};

function isMissingTable(message: string) {
  return /plaza_requests|schema cache|does not exist/i.test(message);
}

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`plaza-req:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ requests: [] });
  const { searchParams } = new URL(request.url);
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') ?? 8) || 8));
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('plaza_requests')
    .select('id, title, details, budget_max, preferred_store, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ requests: [], needsSetup: true });
    console.error('[plaza/requests] GET', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar las solicitudes.' }, { status: 500 });
  }
  return NextResponse.json({ requests: (data ?? []) as PlazaRequest[] });
}

export async function POST(request: Request) {
  const rl = await enforceRateLimit(`plaza-req-w:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Inicia sesión para pedir una oferta.' }, { status: 401 });

  const supabase = createServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (title.length < 4) return NextResponse.json({ error: 'Escribe qué estás buscando.' }, { status: 400 });
  const details = typeof body?.details === 'string' ? body.details.trim().slice(0, 500) || null : null;
  const store = typeof body?.preferred_store === 'string' ? body.preferred_store.trim().slice(0, 80) || null : null;
  const budgetRaw = body?.budget_max;
  const budget_max =
    typeof budgetRaw === 'number' && Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : null;

  const { data, error } = await supabase
    .from('plaza_requests')
    .insert({
      user_id: auth.user.id,
      title,
      details,
      preferred_store: store,
      budget_max,
      status: 'approved',
    })
    .select('id, title, details, budget_max, preferred_store, created_at')
    .single();
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: 'Plaza aún no está activa en la base de datos.' }, { status: 503 });
    }
    console.error('[plaza/requests] POST', error.message);
    return NextResponse.json({ error: 'No se pudo publicar la solicitud.' }, { status: 500 });
  }
  return NextResponse.json({ request: data as PlazaRequest });
}
