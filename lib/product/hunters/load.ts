import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { EDITORIAL_CANON } from './canon';
import { hunterByCode, HUNTER_PUBLIC_FILES, SUPPLY_HUNTER_CODE } from './identity';
import type { EditorialHunter } from './types';

const COLUMNS =
  'id, code, slug, name, display_name, title, specialty, short_bio, long_bio, personality, avatar_url, cover_url, icon, accent, status, sort_order, created_at, updated_at';

type Row = {
  id: string;
  code: string;
  slug: string;
  name: string;
  display_name: string;
  title: string;
  specialty: string;
  short_bio: string;
  long_bio: string;
  personality: string;
  avatar_url: string | null;
  cover_url: string | null;
  icon: string | null;
  accent: string | null;
  status: EditorialHunter['status'];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function toEditorialHunter(row: Row): EditorialHunter {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name,
    displayName: row.display_name,
    title: row.title,
    specialty: row.specialty,
    shortBio: row.short_bio,
    longBio: row.long_bio,
    personality: row.personality,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url,
    icon: row.icon,
    accent: row.accent,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Ximena es pública aunque su ficha editorial siga en borrador. Un archivado no vuelve por el canon. */
export function supplyHunterProjection(slug: string): EditorialHunter | null {
  const source = EDITORIAL_CANON.find((hunter) => hunter.slug === slug && hunter.code === SUPPLY_HUNTER_CODE);
  const pub = source ? hunterByCode(source.code) : null;
  if (!source || !pub) return null;
  const now = '1970-01-01T00:00:00.000Z';
  return {
    id: `canon:${source.code}`,
    code: source.code,
    slug: source.slug,
    name: pub.name,
    displayName: pub.name,
    title: pub.role,
    specialty: pub.specialty,
    shortBio: pub.voice,
    longBio: source.longBio,
    personality: source.personality,
    avatarUrl: HUNTER_PUBLIC_FILES[source.code]?.avatarUrl ?? source.avatarUrl,
    coverUrl: HUNTER_PUBLIC_FILES[source.code]?.coverUrl ?? source.coverUrl,
    icon: HUNTER_PUBLIC_FILES[source.code]?.icon ?? source.icon,
    accent: pub.accent,
    status: 'active',
    sortOrder: source.sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export function isMissingHuntersTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return error.code === 'PGRST205' || error.code === '42P01' || /editorial_hunters/.test(message);
}

/** Solo activos. Si la tabla aún no existe, la página pública sigue en pie y vacía. */
export async function loadPublicHunters(): Promise<EditorialHunter[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('editorial_hunters')
      .select(COLUMNS)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const rows = error || !data ? [] : (data as Row[]).map(toEditorialHunter).filter((h) => h.status === 'active');
    const ximena = supplyHunterProjection('ximena-fuego');
    if (ximena && !rows.some((hunter) => hunter.code === ximena.code)) rows.unshift(ximena);
    return rows;
  } catch {
    return [];
  }
}

/** Tira la caché pública. Un draft nunca entra en estas rutas; un archivado no debe quedarse en caché ni en el sitemap. */
export function revalidateEditorialSurfaces(slugs: Array<string | null | undefined>): void {
  revalidatePath('/cazadores');
  revalidatePath('/sitemap.xml');
  for (const slug of slugs) {
    if (slug) revalidatePath(`/cazadores/${slug}`);
  }
}

/** Resuelve un slug público. Draft y archived devuelven null: la página responde 404. */
export async function loadPublicHunterBySlug(slug: string): Promise<EditorialHunter | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('editorial_hunters')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    if (!error && data) {
      const hunter = toEditorialHunter(data as Row);
      if (hunter.status === 'active') return hunter;
      if (hunter.status === 'archived') return null;
    }
    return supplyHunterProjection(slug);
  } catch {
    return null;
  }
}
