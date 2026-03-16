'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { User, Store, Calendar, Eye, X, History, Pencil, Maximize2, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  image_url: string | null;
  offer_url: string | null;
  description?: string | null;
  steps?: unknown;
  conditions?: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  moderator_comment?: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

type ModLog = { id: string; action: string; reason: string | null; created_at: string; display_name?: string | null };

type Props = {
  offer: ModerationOffer;
  status: 'pending' | 'approved' | 'rejected';
  onApprove?: (id: string, createdBy?: string | null, modMessage?: string) => void;
  onReject?: (id: string, reason?: string) => void;
  actingId?: string | null;
  similarOffers?: { id: string; title: string; price: number; original_price: number | null; store: string | null; created_at: string }[];
  selected?: boolean;
  onToggleSelect?: () => void;
  batchMode?: boolean;
  onOfferUpdated?: () => void;
};

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

const ACTION_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Marcada expirada',
};

export default function ModerationOfferCard({
  offer,
  status,
  onApprove,
  onReject,
  actingId,
  similarOffers = [],
  selected = false,
  onToggleSelect,
  batchMode = false,
  onOfferUpdated,
}: Props) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [modMessage, setModMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showImageExpand, setShowImageExpand] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState(offer.title);
  const [editOfferUrl, setEditOfferUrl] = useState(offer.offer_url ?? '');
  const [editDescription, setEditDescription] = useState(typeof offer.description === 'string' ? offer.description : '');
  const [editImageUrl, setEditImageUrl] = useState(offer.image_url ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const { session } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<ModLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expiring, setExpiring] = useState(false);

  const fetchHistory = useCallback(() => {
    if (historyLogs.length > 0) {
      setShowHistory(true);
      return;
    }
    setHistoryLoading(true);
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    fetch(`/api/admin/moderation-logs?offerId=${encodeURIComponent(offer.id)}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setHistoryLogs(Array.isArray(data?.logs) ? data.logs : []);
        setShowHistory(true);
      })
      .catch(() => setHistoryLogs([]))
      .finally(() => setHistoryLoading(false));
  }, [offer.id, historyLogs.length, session?.access_token]);

  const authorName =
    offer.profiles?.display_name?.trim() || 'Usuario';
  const authorSlug = slugFromUsername(offer.profiles?.display_name);

  const handleReject = () => {
    if (onReject && rejectReason.trim()) {
      onReject(offer.id, rejectReason.trim());
      setShowRejectInput(false);
      setRejectReason('');
    }
  };

  const canReject = rejectReason.trim().length > 0;

  return (
    <article
      className={`bg-white dark:bg-gray-800 rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${selected ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-gray-200 dark:border-gray-700'}`}
      data-testid="moderation-offer-card"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative w-full sm:w-32 h-40 sm:h-auto sm:min-h-[120px] shrink-0 bg-gray-100 dark:bg-gray-700">
          {offer.image_url ? (
            <img
              src={offer.image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Sin imagen
            </div>
          )}
          {offer.risk_score != null && offer.risk_score > 50 && (
            <span
              className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/90 text-white"
              title="Risk score alto"
            >
              Risk {offer.risk_score}
            </span>
          )}
        </div>

        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            {batchMode && onToggleSelect && (
              <button
                type="button"
                onClick={onToggleSelect}
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-800 hover:border-violet-500 mt-0.5"
                aria-label={selected ? 'Quitar de selección' : 'Seleccionar'}
              >
                {selected ? <span className="text-violet-600 text-sm leading-none">✓</span> : null}
              </button>
            )}
            <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
              {offer.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-green-600 dark:text-green-400">
                ${Number(offer.price).toLocaleString('es-MX')}
              </span>
              {offer.original_price != null && (
                <span className="line-through">
                  ${Number(offer.original_price).toLocaleString('es-MX')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                {offer.store ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(offer.created_at).toLocaleString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <User className="h-3.5 w-3.5" />
              {authorSlug ? (
                <Link
                  href={`/u/${authorSlug}`}
                  className="text-purple-600 dark:text-purple-400 hover:underline"
                >
                  {authorName}
                </Link>
              ) : (
                <span>{authorName}</span>
              )}
            </div>
            {offer.moderator_comment && offer.moderator_comment.trim() && (
              <div className="mt-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-900/20 px-3 py-2 text-sm text-violet-800 dark:text-violet-200">
                <span className="font-medium">Comentario del creador:</span>{' '}
                {offer.moderator_comment.trim()}
              </div>
            )}
            </div>
          </div>

          {similarOffers.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Ofertas similares</p>
              <ul className="mt-1 space-y-1 text-amber-700 dark:text-amber-300">
                {similarOffers.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="truncate" title={s.title}>{s.title}</span>
                    <span className="shrink-0 font-semibold">
                      ${Number(s.price).toLocaleString('es-MX')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
                Revisa si es duplicada o si hay mejor precio.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              title="Ver la oferta tal como la subió el usuario"
            >
              <Eye className="h-4 w-4" />
              Ver oferta
            </button>
            {(status === 'pending' || status === 'approved') && (
              <button
                type="button"
                onClick={() => {
                  setEditTitle(offer.title);
                  setEditOfferUrl(offer.offer_url ?? '');
                  setEditDescription(typeof offer.description === 'string' ? offer.description : '');
                  setEditImageUrl(offer.image_url ?? '');
                  setShowEdit(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Editar título, enlace o descripción"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              title="Historial de moderación"
            >
              <History className="h-4 w-4" />
              Historial
            </button>
            {status === 'approved' && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('¿Eliminar esta oferta del feed? Se notificará al autor.')) return;
                  setExpiring(true);
                  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                  try {
                    const res = await fetch('/api/admin/expire-offer', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ offerId: offer.id }),
                    });
                    if (res.ok) onOfferUpdated?.();
                  } finally {
                    setExpiring(false);
                  }
                }}
                disabled={expiring}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                title="Retirar oferta del feed (marca como expirada y notifica al autor)"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar oferta
              </button>
            )}
            {status === 'pending' && onApprove && onReject && (
              <>
                <div className="w-full flex flex-col gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Mensaje opcional para el usuario (se verá en la notificación)</label>
                  <textarea
                    placeholder="Ej: ¡Muy buena oferta! Ya está en el feed."
                    value={modMessage}
                    onChange={(e) => setModMessage(e.target.value.slice(0, 500))}
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onApprove(offer.id, offer.created_by, modMessage.trim() || undefined)}
                  disabled={actingId === offer.id}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="La oferta se publicará y verán los usuarios"
                >
                  ✓ Aprobar (publicar)
                </button>
                {!showRejectInput ? (
                  <button
                    type="button"
                    onClick={() => setShowRejectInput(true)}
                    disabled={actingId === offer.id}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="La oferta no se publicará"
                  >
                    ✗ Rechazar
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Motivo (obligatorio)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReject();
                        if (e.key === 'Escape') {
                          setShowRejectInput(false);
                          setRejectReason('');
                        }
                      }}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[180px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={actingId === offer.id || !canReject}
                      className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectReason('');
                      }}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowHistory(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5 max-w-md w-full border border-gray-200 dark:border-gray-700 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Historial de moderación</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            {historyLogs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay acciones registradas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {historyLogs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-baseline gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className="text-gray-500 dark:text-gray-400">{new Date(log.created_at).toLocaleString('es-MX')}</span>
                    {log.display_name && <span className="text-gray-600 dark:text-gray-300">por {log.display_name}</span>}
                    {log.reason && <span className="w-full text-gray-500 dark:text-gray-400">Motivo: {log.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative max-w-lg w-full max-h-[90vh] overflow-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="absolute right-3 top-3 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-4 space-y-3">
              {offer.image_url ? (
                <div className="relative">
                  <img
                    src={offer.image_url}
                    alt=""
                    className="w-full h-48 object-cover object-center bg-gray-100 dark:bg-gray-700 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowImageExpand(true)}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-black/60 text-white hover:bg-black/80"
                    title="Ver imagen ampliada"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Expandir
                  </button>
                </div>
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-400">
                  Sin imagen
                </div>
              )}
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                {offer.title}
              </h3>
              <div className="flex gap-4 text-sm">
                <span className="font-medium text-green-600 dark:text-green-400">
                  ${Number(offer.price).toLocaleString('es-MX')}
                </span>
                {offer.original_price != null && (
                  <span className="line-through text-gray-500">
                    ${Number(offer.original_price).toLocaleString('es-MX')}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Store className="h-4 w-4 shrink-0" />
                  {offer.store ?? '—'}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Por {authorName} • {new Date(offer.created_at).toLocaleString('es-MX')}
              </p>
              {offer.description?.trim() && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descripción</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{offer.description.trim()}</p>
                </div>
              )}
              {offer.steps != null && (() => {
                try {
                  const raw = typeof offer.steps === 'string' ? offer.steps : JSON.stringify(offer.steps);
                  if (!raw?.trim()) return null;
                  const parsed = JSON.parse(raw.trim());
                  const stepItems = Array.isArray(parsed) ? parsed : raw.trim().split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
                  if (stepItems.length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cómo obtener la oferta</p>
                      <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        {stepItems.map((s: string, i: number) => (
                          <li key={i} className="break-words">{s}</li>
                        ))}
                      </ol>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}
              {offer.conditions?.trim() && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Condiciones</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{offer.conditions.trim()}</p>
                </div>
              )}
              {offer.offer_url && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">URL</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 break-all font-mono mb-2">{offer.offer_url}</p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={offer.offer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/50"
                    >
                      Abrir enlace
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(offer.offer_url!);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showImageExpand && offer.image_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setShowImageExpand(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setShowImageExpand(false)}
          aria-label="Cerrar imagen"
        >
          <button
            type="button"
            onClick={() => setShowImageExpand(false)}
            className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={offer.image_url}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowEdit(false)}
        >
          <div
            className="relative max-w-lg w-full max-h-[90vh] overflow-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar oferta</h3>
              <button type="button" onClick={() => setShowEdit(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 500))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Título de la oferta"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL del enlace</label>
                <input
                  type="url"
                  value={editOfferUrl}
                  onChange={(e) => setEditOfferUrl(e.target.value.slice(0, 2048))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 2000))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Descripción"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagen (URL) — para recortar/ajustar, sube la imagen recortada y pega aquí la URL</label>
                <input
                  type="url"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value.slice(0, 2048))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
                  placeholder="https://..."
                />
                {editImageUrl && (
                  <div className="mt-2 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 max-h-32">
                    <img src={editImageUrl} alt="" className="w-full h-32 object-cover object-center" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={async () => {
                    setEditSaving(true);
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                    const res = await fetch('/api/admin/update-offer', {
                      method: 'PATCH',
                      headers,
                      body: JSON.stringify({
                        id: offer.id,
                        title: editTitle.trim() || undefined,
                        offer_url: editOfferUrl.trim() || undefined,
                        description: editDescription.trim() || undefined,
                        image_url: editImageUrl.trim() || undefined,
                      }),
                    });
                    setEditSaving(false);
                    if (!res.ok) return;
                    setShowEdit(false);
                    onOfferUpdated?.();
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
