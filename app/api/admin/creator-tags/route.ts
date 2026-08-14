import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { z } from 'zod';

const patchSchema = z.object({
  user_id: z.string().uuid(),
  ml_tracking_tag: z.string().max(120).nullable().optional(),
  amazon_tracking_tag: z.string().max(120).nullable().optional(),
  leader_badge: z
    .enum(['cazador_estrella', 'cazador_aventa'])
    .nullable()
    .optional(),
});

function cleanTag(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Lista perfiles con tags / badge (para admin de atribución). */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const onlyTagged = url.searchParams.get('only_tagged') === '1';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));

  const supabase = createServerClient();
  let query = supabase
    .from('profiles')
    .select(
      'id, display_name, username, slug, leader_badge, ml_tracking_tag, amazon_tracking_tag, commissions_accepted_at, commissions_terms_version',
    )
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (onlyTagged) {
    // Filtrar en memoria tras fetch amplio es más fiable que or vacío en PostgREST
  }
  if (q) {
    query = query.or(
      `display_name.ilike.%${q}%,username.ilike.%${q}%,ml_tracking_tag.ilike.%${q}%,amazon_tracking_tag.ilike.%${q}%,id.eq.${q}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    if (
      (error.message ?? '').includes('amazon_tracking_tag') ||
      error.code === 'PGRST204'
    ) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_amazon_tracking_tag.sql',
        },
        { status: 503 },
      );
    }
    console.error('[creator-tags GET]', error.message);
    return NextResponse.json({ error: 'No se pudieron listar perfiles' }, { status: 500 });
  }

  let profiles = data ?? [];
  if (onlyTagged) {
    profiles = profiles.filter(
      (p: { ml_tracking_tag?: string | null; amazon_tracking_tag?: string | null }) =>
        Boolean(p.ml_tracking_tag?.trim() || p.amazon_tracking_tag?.trim()),
    );
  }

  return NextResponse.json({ profiles });
}

/** Actualiza tags ML/Amazon y badge de un creador. */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }

  const row = parsed.data;
  const payload: Record<string, string | null> = {};
  if ('ml_tracking_tag' in row) payload.ml_tracking_tag = cleanTag(row.ml_tracking_tag ?? null);
  if ('amazon_tracking_tag' in row) {
    payload.amazon_tracking_tag = cleanTag(row.amazon_tracking_tag ?? null);
  }
  if ('leader_badge' in row) payload.leader_badge = row.leader_badge ?? null;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', row.user_id)
    .select(
      'id, display_name, username, leader_badge, ml_tracking_tag, amazon_tracking_tag',
    )
    .single();

  if (error) {
    if (
      (error.message ?? '').includes('amazon_tracking_tag') ||
      error.code === 'PGRST204'
    ) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_amazon_tracking_tag.sql',
        },
        { status: 503 },
      );
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ese tag ya está asignado a otro usuario.' },
        { status: 409 },
      );
    }
    console.error('[creator-tags PATCH]', error.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}
