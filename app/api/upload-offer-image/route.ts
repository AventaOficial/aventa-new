import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limitResult = await enforceRateLimit(ip);
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
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

    const supabase = createServerClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Máximo 2MB' }, { status: 400 });
    }

    const mime = file.type?.toLowerCase() ?? '';
    if (!ALLOWED_TYPES.includes(mime)) {
      return NextResponse.json({ error: 'Solo jpg, jpeg, png, webp' }, { status: 400 });
    }

    const ext = EXT_MAP[mime] ?? '.jpg';
    const name = `${crypto.randomUUID()}${ext}`;

    const { error } = await supabase.storage
      .from('offer-images')
      .upload(name, file, { contentType: mime, upsert: false });

    if (error) {
      console.error('[upload-offer-image]', error.message);
      return NextResponse.json({ error: 'Error al subir' }, { status: 500 });
    }

    const publicUrl = supabase.storage.from('offer-images').getPublicUrl(name).data.publicUrl;
    return NextResponse.json({ url: publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error al subir' }, { status: 500 });
  }
}
