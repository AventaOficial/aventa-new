/**
 * Sube foto de perfil y actualiza profiles.avatar_url.
 * Requiere en Supabase: bucket "avatars" (público) y política que permita
 * a usuarios autenticados subir/actualizar su archivo (ej. path: userId).
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';

const MAX_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const BUCKET = 'avatars';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limitResult = await enforceRateLimit(ip);
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 });
    }
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const userData = await userRes.json().catch(() => null);
    const userId = userData?.id;
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = createServerClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Máximo 1MB' }, { status: 400 });
    }

    const mime = file.type?.toLowerCase() ?? '';
    if (!ALLOWED_TYPES.includes(mime)) {
      return NextResponse.json({ error: 'Solo jpg, png o webp' }, { status: 400 });
    }

    const ext = EXT_MAP[mime] ?? '.jpg';
    const name = `${userId}${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(name, file, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error('[upload-avatar]', uploadError.message);
      return NextResponse.json({ error: 'Error al subir la foto' }, { status: 500 });
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('[upload-avatar] profile update:', updateError.message);
      return NextResponse.json({ error: 'Foto subida pero no se pudo actualizar el perfil' }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error('[upload-avatar]', e);
    return NextResponse.json({ error: 'Error al subir' }, { status: 500 });
  }
}
