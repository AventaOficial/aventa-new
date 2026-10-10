import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseControlWrite } from '@/lib/control/schema';
import { listOperationalControls, writeOperationalControl } from '@/lib/control/store';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';
import { createServerClient } from '@/lib/supabase/server';

async function ownerOrResponse(request: Request) {
  const cookieStore = await cookies();
  const auth = await requireOwnerSession(request, {
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return auth;
}

export async function GET(request: Request) {
  const auth = await ownerOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const listed = await listOperationalControls(createServerClient());
    return NextResponse.json(listed);
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la configuración' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await ownerOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = parseControlWrite(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const written = await writeOperationalControl(createServerClient(), {
      ...parsed.value,
      actorId: auth.user.id,
    });
    if (written.status === 'missing') {
      return NextResponse.json(
        {
          error: 'La tabla operational_controls no está en esta base. La migración está en el repositorio y no se aplicó.',
          storage: 'missing',
        },
        { status: 409 },
      );
    }
    if (written.status === 'audit_failed') {
      return NextResponse.json(
        {
          ok: false,
          audit: 'failed',
          error: 'La configuración se escribió, pero la auditoría no quedó registrada. El guardado no está confirmado.',
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, storage: 'ready', audit: 'saved' });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar la configuración' }, { status: 500 });
  }
}
