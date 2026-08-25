'use client';

import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Scissors, Wand2, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { ALL_CATEGORIES, normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { shortModerationQueueTitle } from '@/lib/moderation/queueTitle';
import { MODERATION_TITLE_MAX } from '@/lib/moderation/botFacts';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';

export type FixField = 'photo' | 'link' | 'category' | 'title';

export type FixableOffer = {
  id: string;
  title: string;
  image_url: string | null;
  offer_url: string | null;
  category?: string | null;
};

type Props = {
  mode?: ModerationHubMode;
  offer: FixableOffer;
  focusField?: FixField | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Hoja «Arreglar»: los cuatro campos que bloquean la publicación, con teclado
 * correcto y pegado rápido. Misma pieza en teléfono y escritorio.
 */
export default function ModerationFixSheet({
  mode = 'admin',
  offer,
  focusField = null,
  onClose,
  onSaved,
}: Props) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  const [imageUrl, setImageUrl] = useState(offer.image_url ?? '');
  const [offerUrl, setOfferUrl] = useState(offer.offer_url ?? '');
  const [category, setCategory] = useState(offer.category ?? '');
  const [title, setTitle] = useState(offer.title ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const target =
      focusField === 'photo'
        ? photoRef.current
        : focusField === 'link'
          ? linkRef.current
          : focusField === 'category'
            ? categoryRef.current
            : focusField === 'title'
              ? titleRef.current
              : null;
    target?.focus();
  }, [focusField]);

  const pasteInto = async (setter: (value: string) => void) => {
    try {
      const text = await navigator.clipboard.readText();
      const clean = text.trim();
      if (!clean) {
        setMessage('El portapapeles está vacío');
        return;
      }
      setter(clean.slice(0, 2048));
      setMessage(null);
      setPreviewBroken(false);
    } catch {
      setMessage('No pude leer el portapapeles; pega con el teclado');
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = { id: offer.id };
    if (imageUrl.trim() !== (offer.image_url ?? '')) body.image_url = imageUrl.trim();
    if (offerUrl.trim() !== (offer.offer_url ?? '')) body.offer_url = offerUrl.trim();
    if (title.trim() && title.trim() !== offer.title) body.title = title.trim();

    const nextCategory = normalizeCategoryForStorage(category);
    const prevCategory = normalizeCategoryForStorage(offer.category ?? null);
    if (nextCategory !== prevCategory) body.category = nextCategory ?? '';

    if (Object.keys(body).length <= 1) {
      setSaving(false);
      setMessage('No cambiaste nada');
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch('/api/admin/update-offer', {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(typeof err?.error === 'string' ? err.error : 'No se pudo guardar');
      return;
    }
    onSaved();
    onClose();
  };

  const previewSrc = !previewBroken ? normalizeOfferImageUrl(imageUrl) : null;
  const titleTooLong = title.trim().length > MODERATION_TITLE_MAX;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/55 sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl sm:max-w-lg sm:rounded-3xl ${ui.modal}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Arreglar oferta"
      >
        <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${ui.hairline}`}>
          <div>
            <p className={`text-base font-semibold ${ui.title}`}>Arreglar oferta</p>
            <p className={`text-xs ${ui.muted}`}>Corrige y guarda sin salir de la cola</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full"
            aria-label="Cerrar"
          >
            <X className={`h-5 w-5 ${ui.soft}`} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Foto</label>
            <div className="flex items-start gap-3">
              <div className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl ${ui.thumbBg}`}>
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewBroken(true)}
                  />
                ) : (
                  <span className={`flex h-full items-center justify-center text-[10px] ${ui.faint}`}>
                    Sin foto
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  ref={photoRef}
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value.slice(0, 2048));
                    setPreviewBroken(false);
                  }}
                  placeholder="https://http2.mlstatic.com/…"
                  className={`w-full min-h-12 px-3 font-mono text-xs ${ui.input}`}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void pasteInto(setImageUrl)}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${ui.btnGhost}`}
                  >
                    <ClipboardPaste className="h-4 w-4" aria-hidden />
                    Pegar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const n = normalizeOfferImageUrl(imageUrl);
                      if (n) {
                        setImageUrl(n);
                        setPreviewBroken(false);
                      } else {
                        setMessage('Esa dirección no sirve como foto');
                      }
                    }}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${ui.btnGhost}`}
                  >
                    <Wand2 className="h-4 w-4" aria-hidden />
                    Arreglar URL
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Enlace de la tienda</label>
            <input
              ref={linkRef}
              type="url"
              inputMode="url"
              autoCapitalize="off"
              spellCheck={false}
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value.slice(0, 2048))}
              placeholder="https://articulo.mercadolibre.com.mx/…"
              className={`w-full min-h-12 px-3 font-mono text-xs ${ui.input}`}
            />
            <button
              type="button"
              onClick={() => void pasteInto(setOfferUrl)}
              className={`mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold ${ui.btnGhost}`}
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden />
              Pegar
            </button>
            <p className={`mt-1.5 text-[11px] ${ui.muted}`}>
              Al guardar se aplica el tag de afiliado automáticamente.
            </p>
          </div>

          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Categoría</label>
            <select
              ref={categoryRef}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full min-h-12 px-3 text-sm ${ui.select}`}
            >
              <option value="">Sin categoría</option>
              {ALL_CATEGORIES.filter((c) => c.value !== 'other').map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                  {c.vital ? ' · Día a día' : ' · Top / Recientes'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label className={`text-sm font-medium ${ui.body}`}>Título</label>
              <span
                className={`text-[11px] tabular-nums ${
                  titleTooLong ? 'text-amber-700 dark:text-amber-200' : ui.muted
                }`}
              >
                {title.trim().length}
              </span>
            </div>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 500))}
              rows={3}
              className={`w-full px-3 py-2 text-sm ${ui.input}`}
            />
            {title !== shortModerationQueueTitle(title) ? (
              <button
                type="button"
                onClick={() => setTitle(shortModerationQueueTitle(title))}
                className={`mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold ${ui.btnGhost}`}
              >
                <Scissors className="h-4 w-4" aria-hidden />
                Quitar el «Ahorra ~%» del bot
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={`shrink-0 space-y-2 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${ui.hairline}`}
        >
          {message ? (
            <p className="text-center text-xs text-amber-700 dark:text-amber-200">{message}</p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-emerald-600 text-[15px] font-bold text-white active:bg-emerald-700 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
