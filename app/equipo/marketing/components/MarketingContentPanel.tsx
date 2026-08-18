'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { RefreshCw } from 'lucide-react';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import { filterCardsByTab, type MarketingPayload } from '@/lib/staff/buildMarketingPayload';
import type { MarketingTabId } from '@/lib/marketing/hubConfig';
import type { MarketingContentStatus } from '@/lib/staff/marketingPipeline';
import ContentOfferCard from './ContentOfferCard';
import MarketingTasksStrip from './MarketingTasksStrip';

export default function MarketingContentPanel({ tab }: { tab: MarketingTabId }) {
  const { session } = useAuth();
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/marketing', { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Error al cargar');
        return;
      }
      setData(body as MarketingPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  const patch = async (payload: Record<string, unknown>) => {
    setActing(true);
    try {
      const res = await fetch('/api/staff/marketing', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  const onSetStatus = (
    offerId: string,
    status: MarketingContentStatus,
    extra?: { videoUrl?: string; videoTitle?: string; videoNetwork?: string }
  ) => {
    void patch({
      action: 'setStatus',
      offerId,
      status,
      videoUrl: extra?.videoUrl,
      videoTitle: extra?.videoTitle,
      videoNetwork: extra?.videoNetwork,
    });
  };

  const onRemove = (offerId: string) => {
    void patch({ action: 'remove', offerId });
  };

  if (loading) return <LoadingState message="Cargando contenido…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const filterTab = tab === 'ideas' ? 'ideas' : tab === 'performance' ? 'performance' : tab;
  const cards = filterCardsByTab(data.candidates, filterTab);

  const emptyMessages: Record<MarketingTabId, string> = {
    ideas: 'No hay ofertas nuevas con descuento suficiente. Revisa más tarde o baja el umbral en moderación.',
    to_film: 'Nada en cola para grabar. Selecciona ideas primero.',
    editing: 'Nada en edición ahora mismo.',
    published: 'Aún no has marcado contenido como publicado.',
    performance: 'Publica contenido para ver rendimiento por oferta.',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{data.greeting}</p>
          {data.lastVideo.last_video_at ? (
            <p className="text-xs text-gray-500 mt-1">
              Último video: {data.lastVideo.last_video_title || 'Sin título'}
              {data.lastVideo.last_video_url ? (
                <>
                  {' · '}
                  <a href={data.lastVideo.last_video_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                    Ver
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={acting}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${acting ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <MarketingTasksStrip board={data.board} taskPct={data.taskPct} onTasksChange={load} />

      {cards.length === 0 ? (
        <EmptyState title={emptyMessages[tab]} variant="light" className="py-12" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <ContentOfferCard
              key={card.id}
              card={card}
              acting={acting}
              onSetStatus={onSetStatus}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {tab === 'performance' && cards.length > 0 ? (
        <p className="text-xs text-gray-500 text-center">
          Clics de los últimos 7 días · ordenado por rendimiento
        </p>
      ) : null}
    </div>
  );
}
