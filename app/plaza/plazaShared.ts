import type { PlazaRequest } from '@/app/api/plaza/requests/route';
import type { PlazaDiscussion } from '@/app/api/plaza/discussions/route';

export type PlazaRequestItem = PlazaRequest;
export type PlazaDiscussionItem = PlazaDiscussion;

export type PlazaAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

/** Abre el modal de subida existente con la solicitud precargada (`?upload=1`). */
export function requestHuntHref(item: Pick<PlazaRequestItem, 'title' | 'preferred_store'>): string {
  const params = new URLSearchParams({ upload: '1', title: item.title });
  if (item.preferred_store) params.set('store', item.preferred_store);
  return `/?${params.toString()}`;
}
