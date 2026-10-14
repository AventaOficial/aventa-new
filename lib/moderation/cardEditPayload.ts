import { normalizeCategoryForStorage } from '@/lib/categories';

export type CardEditFields = {
  title: string;
  offer_url: string;
  description: string;
  image_url: string;
  category: string;
};

export type CardEditOriginal = {
  title: string | null;
  offer_url: string | null;
  description?: string | null;
  image_url: string | null;
  category?: string | null;
};

export type ModerationOfferPatch = {
  title?: string;
  offer_url?: string | null;
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  status?: string;
  expires_at?: string | null;
};

/** Lo que la respuesta de update-offer confirma como guardado, para refrescar la tarjeta sin recargar la lista. */
export function editPatchFromResponse(data: unknown): ModerationOfferPatch {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const patch: ModerationOfferPatch = {};
  if (typeof d.title === 'string') patch.title = d.title;
  if (typeof d.category === 'string' || d.category === null) patch.category = d.category as string | null;
  if (typeof d.description === 'string' || d.description === null) patch.description = d.description as string | null;
  if (typeof d.offer_url === 'string' || d.offer_url === null) patch.offer_url = d.offer_url as string | null;
  if (typeof d.image_url === 'string' || d.image_url === null) patch.image_url = d.image_url as string | null;
  if (typeof d.status === 'string') patch.status = d.status;
  return patch;
}

/**
 * Cuerpo de PATCH /api/admin/update-offer con sólo lo que el moderador cambió.
 * Reenviar la URL o la imagen sin tocarlas cuenta como cambio material y regresa
 * una aprobada a pendiente; un campo vaciado tampoco borra el valor guardado.
 */
export function buildCardEditBody(
  id: string,
  original: CardEditOriginal,
  edited: CardEditFields
): { id: string } & Partial<CardEditFields> {
  const body: { id: string } & Partial<CardEditFields> = { id };
  const changed = (next: string, prev: string | null | undefined) => {
    const value = next.trim();
    return value !== '' && value !== (prev ?? '').trim() ? value : null;
  };
  const title = changed(edited.title, original.title);
  if (title) body.title = title;
  const offerUrl = changed(edited.offer_url, original.offer_url);
  if (offerUrl) body.offer_url = offerUrl;
  const description = changed(edited.description, original.description);
  if (description) body.description = description;
  const imageUrl = changed(edited.image_url, original.image_url);
  if (imageUrl) body.image_url = imageUrl;
  const category = edited.category.trim();
  if (category && category !== normalizeCategoryForStorage(original.category ?? null)) {
    body.category = category;
  }
  return body;
}
