import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';

type TrustedHunterRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  reputation_level: number;
  owner_auto_approve_offers_at: string | null;
  owner_auto_approve_offers_by: string | null;
};

function isMissingColumnError(message: string): boolean {
  return /owner_auto_approve_offers/i.test(message) && /column|schema cache/i.test(message);
}

/** GET: cazadores con auto-aprobación otorgada por owner. */
export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, display_name, username, avatar_url, reputation_level, owner_auto_approve_offers_at, owner_auto_approve_offers_by',
    )
    .eq('owner_auto_approve_offers', true)
    .order('owner_auto_approve_offers_at', { ascending: false, nullsFirst: false });

  if (error) {
    if (isMissingColumnError(error.message)) {
      return NextResponse.json(
        {
          error: 'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_owner_auto_approve_offers.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al cargar cazadores' }, { status: 500 });
  }

  const hunters: TrustedHunterRow[] = (data ?? []).map((row) => {
    const r = row as {
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      reputation_level?: number | null;
      owner_auto_approve_offers_at?: string | null;
      owner_auto_approve_offers_by?: string | null;
    };
    return {
      user_id: r.id,
      display_name: r.display_name ?? null,
      username: r.username ?? null,
      avatar_url: r.avatar_url ?? null,
      reputation_level: Math.max(1, r.reputation_level ?? 1),
      owner_auto_approve_offers_at: r.owner_auto_approve_offers_at ?? null,
      owner_auto_approve_offers_by: r.owner_auto_approve_offers_by ?? null,
    };
  });

  return NextResponse.json({ hunters });
}

/** POST: agregar cazador de confianza. Body: { user_id: string } */
export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  if (!userId) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: profile, error: loadErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle();

  if (loadErr) {
    if (isMissingColumnError(loadErr.message)) {
      return NextResponse.json(
        {
          error: 'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_owner_auto_approve_offers.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al buscar usuario' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      owner_auto_approve_offers: true,
      owner_auto_approve_offers_at: now,
      owner_auto_approve_offers_by: auth.user.id,
    })
    .eq('id', userId);

  if (updateErr) {
    if (isMissingColumnError(updateErr.message)) {
      return NextResponse.json(
        {
          error: 'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_owner_auto_approve_offers.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    display_name: (profile as { display_name?: string | null }).display_name ?? null,
  });
}

/** DELETE: quitar cazador de confianza. Body: { user_id: string } */
export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  if (!userId) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      owner_auto_approve_offers: false,
      owner_auto_approve_offers_at: null,
      owner_auto_approve_offers_by: null,
    })
    .eq('id', userId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return NextResponse.json(
        {
          error: 'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_owner_auto_approve_offers.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo quitar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id: userId });
}
