/**
 * Pending-only field merge. Never last-write-wins on conflicts.
 * Approved/published callers must not invoke this.
 */

const PLACEHOLDER = '/placeholder.png';

export type PendingOfferSnapshot = {
  title: string;
  price: number;
  original_price: number | null;
  image_url: string;
  store: string;
};

export type IncomingObservationFields = {
  title?: string | null;
  price?: number | null;
  previousPrice?: number | null;
  imageUrl?: string | null;
  store?: string | null;
};

export type PendingMergeResult = {
  patch: Partial<PendingOfferSnapshot>;
  conflicts: string[];
  filled: string[];
};

function isBlankImage(url: string | null | undefined): boolean {
  const t = (url ?? '').trim();
  return !t || t === PLACEHOLDER;
}

function pricesClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/**
 * Fill empties from observation. Price/title/image conflicts are recorded, not overwritten.
 */
export function mergePendingOfferFields(
  existing: PendingOfferSnapshot,
  incoming: IncomingObservationFields,
): PendingMergeResult {
  const patch: Partial<PendingOfferSnapshot> = {};
  const conflicts: string[] = [];
  const filled: string[] = [];

  const incomingTitle = incoming.title?.trim() || null;
  if (incomingTitle) {
    if (!existing.title.trim()) {
      patch.title = incomingTitle;
      filled.push('title');
    } else if (existing.title.trim().toLowerCase() !== incomingTitle.toLowerCase()) {
      conflicts.push('title');
    }
  }

  const incomingStore = incoming.store?.trim() || null;
  if (incomingStore) {
    if (!existing.store.trim()) {
      patch.store = incomingStore;
      filled.push('store');
    } else if (existing.store.trim().toLowerCase() !== incomingStore.toLowerCase()) {
      conflicts.push('store');
    }
  }

  if (incoming.price != null && Number.isFinite(incoming.price) && incoming.price > 0) {
    if (!(existing.price > 0)) {
      patch.price = incoming.price;
      filled.push('price');
    } else if (!pricesClose(existing.price, incoming.price)) {
      conflicts.push('price');
    }
  }

  if (
    incoming.previousPrice != null &&
    Number.isFinite(incoming.previousPrice) &&
    incoming.previousPrice > 0
  ) {
    if (existing.original_price == null || !(existing.original_price > 0)) {
      patch.original_price = incoming.previousPrice;
      filled.push('original_price');
    } else if (!pricesClose(existing.original_price, incoming.previousPrice)) {
      conflicts.push('original_price');
    }
  }

  const incomingImage = incoming.imageUrl?.trim() || null;
  if (incomingImage && !isBlankImage(incomingImage)) {
    if (isBlankImage(existing.image_url)) {
      patch.image_url = incomingImage;
      filled.push('image_url');
    } else if (existing.image_url.trim() !== incomingImage) {
      conflicts.push('image_url');
    }
  }

  return { patch, conflicts, filled };
}
