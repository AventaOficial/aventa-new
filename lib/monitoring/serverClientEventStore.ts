export type StoredClientEvent = {
  at: string;
  type: string;
  source: string;
  metadata?: Record<string, unknown>;
};

const MAX = 200;
const events: StoredClientEvent[] = [];

export function pushClientEvent(entry: Omit<StoredClientEvent, 'at'> & { at?: string }): void {
  events.unshift({
    at: entry.at ?? new Date().toISOString(),
    type: entry.type,
    source: entry.source,
    metadata: entry.metadata,
  });
  if (events.length > MAX) events.length = MAX;
}

export function getRecentClientEvents(limit = 80): StoredClientEvent[] {
  return events.slice(0, Math.max(0, limit));
}

export function getRecentErrorEvents(limit = 30): StoredClientEvent[] {
  return events
    .filter((e) => e.type === 'error' || e.type === 'api_error')
    .slice(0, Math.max(0, limit));
}

export function getLastFeedLoadedCount(): number | null {
  const row = events.find((e) => e.source === 'feed:loaded' && e.type === 'view');
  const n = row?.metadata?.count;
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}
