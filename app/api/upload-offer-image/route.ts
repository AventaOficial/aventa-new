import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimit, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser';

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
    const authResult = await requireBearerCommunityUser(request);
    if ('error' in authResult) {
      return communityAuthFailureResponse(authResult);
    }
    const { user, supabase } = authResult;
    const userId = user.id;

    const userRl = await enforceRateLimitCustom(`upload:${userId}`, 'uploadImage');
    if (!userRl.success) {
      return NextResponse.json(
        { error: 'Has alcanzado el límite de subidas por hora. Intenta más tarde.' },
        { status: 429 },
      );
    }

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

    // Verificar que la URL sea accesible (bucket debe ser público para lectura)
    try {
      const headRes = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
      if (!headRes.ok) {
        await supabase.storage.from('offer-images').remove([name]).catch(() => {});
        console.error('[upload-offer-image] URL no accesible:', headRes.status, publicUrl);
        return NextResponse.json(
          { error: 'La imagen se subió pero no es visible. Revisa que el bucket "offer-images" sea público en Supabase.' },
          { status: 500 }
        );
      }
    } catch (headErr) {
      await supabase.storage.from('offer-images').remove([name]).catch(() => {});
      console.error('[upload-offer-image] HEAD check failed:', headErr);
      return NextResponse.json(
        { error: 'No se pudo verificar la imagen. Comprueba que el bucket "offer-images" sea público.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error al subir' }, { status: 500 });
  }
}
