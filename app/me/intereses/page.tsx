'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { MeSpaceShell, meCardClass, meHeroActionClass } from '@/app/me/dashboard/MeSectionPage';
import { ALL_CATEGORIES } from '@/lib/categories';
import { INTERESTS_SECTION } from '@/lib/interests/copy';
import { INTEREST_CADENCES, type InterestCadence } from '@/lib/interests/normalize';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { createClient } from '@/lib/supabase/client';
import { useUI } from '@/app/providers/UIProvider';

type InterestRow = {
  id: string;
  label: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  aliases: string[];
  cadence: InterestCadence;
  notify: boolean;
};

type OfferHit = {
  id: string;
  title: string;
  store?: string | null;
  price?: number | null;
  upvotes?: number | null;
  matchKind?: string;
  matchLabel?: string;
  interestLabel?: string;
};

const CADENCE_LABEL: Record<InterestCadence, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  occasional: 'Ocasional',
};

const emptyForm = {
  label: '',
  brand: '',
  model: '',
  category: '',
  aliases: '',
  cadence: 'occasional' as InterestCadence,
  notify: true,
};

export default function InterestsPage() {
  const { showToast } = useUI();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [matches, setMatches] = useState<OfferHit[]>([]);
  const [discovery, setDiscovery] = useState<OfferHit[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (accessToken: string) => {
    const res = await fetch('/api/me/interests', { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'error');
    setInterests(body.interests ?? []);
    setMatches(body.matches ?? []);
    setDiscovery(body.discovery ?? []);
    setStatus('ready');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!accessToken) return;
      if (!cancelled) setToken(accessToken);
      try {
        await load(accessToken);
        void fetch('/api/me/interests/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'interest_section_opened' }),
        }).catch(() => undefined);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    const payload = {
      label: form.label,
      brand: form.brand || null,
      model: form.model || null,
      category: form.category || null,
      aliases: form.aliases.split(',').map((item) => item.trim()).filter(Boolean),
      cadence: form.cadence,
      notify: form.notify,
    };
    const res = await fetch(editing ? `/api/me/interests/${editing}` : '/api/me/interests', {
      method: editing ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      showToast(typeof body?.error === 'string' ? body.error : 'No se pudo guardar.');
      return;
    }
    showToast(editing ? INTERESTS_SECTION.updated : INTERESTS_SECTION.saved);
    setForm(emptyForm);
    setEditing(null);
    try {
      await load(token);
    } catch {
      setStatus('error');
    }
  }

  async function remove(id: string) {
    if (!token) return;
    const res = await fetch(`/api/me/interests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      showToast('No se pudo eliminar.');
      return;
    }
    showToast(INTERESTS_SECTION.removed);
    if (editing === id) {
      setEditing(null);
      setForm(emptyForm);
    }
    try {
      await load(token);
    } catch {
      setStatus('error');
    }
  }

  function track(name: 'interest_offer_clicked' | 'interest_discovery_clicked', offerId: string) {
    if (!token) return;
    void fetch('/api/me/interests/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, offerId }),
    }).catch(() => undefined);
  }

  return (
    <MeSpaceShell
      wide
      eyebrow="Tu espacio"
      mark={<Bookmark className="h-3.5 w-3.5" aria-hidden />}
      title={INTERESTS_SECTION.title}
      lede={INTERESTS_SECTION.lede}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={save} className={`${meCardClass} space-y-3 p-4 sm:p-5`}>
          <label className="block text-[13px] font-medium">
            Producto o interés
            <input
              required
              minLength={2}
              maxLength={80}
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[15px] dark:border-white/15"
              placeholder="Café, iPhone, croquetas"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[13px] font-medium">
              Marca, si quieres
              <input value={form.brand} maxLength={40} onChange={(event) => setForm({ ...form, brand: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 dark:border-white/15" />
            </label>
            <label className="block text-[13px] font-medium">
              Modelo, si quieres
              <input value={form.model} maxLength={40} onChange={(event) => setForm({ ...form, model: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 dark:border-white/15" />
            </label>
          </div>
          <label className="block text-[13px] font-medium">
            Categoría, si quieres
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 dark:border-white/15">
              <option value="">Sin categoría</option>
              {ALL_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-medium">
            Otros nombres, separados por coma
            <input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 dark:border-white/15" placeholder="audífonos, headphones" />
          </label>
          <label className="block text-[13px] font-medium">
            Cada cuánto lo compras
            <select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value as InterestCadence })} className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 dark:border-white/15">
              {INTEREST_CADENCES.map((cadence) => (
                <option key={cadence} value={cadence}>{CADENCE_LABEL[cadence]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
            Avisarme en los resúmenes de correo, si ya los tengo activos
          </label>
          <button type="submit" disabled={saving} className={meHeroActionClass}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar interés'}
          </button>
        </form>

        <div className="space-y-4">
          {status === 'loading' ? <p className="text-sm text-[#6e6e73]">Cargando intereses…</p> : null}
          {status === 'error' ? (
            <div className={`${meCardClass} p-4`}>
              <p className="text-[15px] font-medium">No se pudo cargar tu lista.</p>
              <button type="button" className={`${meHeroActionClass} mt-3`} onClick={() => token && void load(token).catch(() => setStatus('error'))}>Reintentar</button>
            </div>
          ) : null}
          {status === 'ready' && interests.length === 0 ? (
            <div className={`${meCardClass} p-5`}>
              <h2 className="text-[18px] font-semibold">{INTERESTS_SECTION.emptyTitle}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{INTERESTS_SECTION.emptyBody}</p>
            </div>
          ) : null}
          {interests.map((interest) => (
            <article key={interest.id} className={`${meCardClass} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold">{interest.label}</h2>
                  <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                    {[interest.brand, interest.model, CADENCE_LABEL[interest.cadence]].filter(Boolean).join(' · ') || CADENCE_LABEL[interest.cadence]}
                    {interest.notify ? '' : ' · Sin aviso por correo'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-violet-700 dark:text-violet-300"
                    onClick={() => {
                      setEditing(interest.id);
                      setForm({
                        label: interest.label,
                        brand: interest.brand ?? '',
                        model: interest.model ?? '',
                        category: interest.category ?? '',
                        aliases: interest.aliases.join(', '),
                        cadence: interest.cadence,
                        notify: interest.notify,
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button type="button" className="text-[13px] font-semibold text-rose-700" onClick={() => void remove(interest.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <OfferGroup
        title={INTERESTS_SECTION.personalHeading}
        empty={INTERESTS_SECTION.personalEmpty}
        offers={matches}
        onOpen={(id) => track('interest_offer_clicked', id)}
      />
      <OfferGroup
        title={INTERESTS_SECTION.discoveryHeading}
        empty={INTERESTS_SECTION.discoveryEmpty}
        offers={discovery}
        onOpen={(id) => track('interest_discovery_clicked', id)}
      />
    </MeSpaceShell>
  );
}

function OfferGroup({
  title,
  empty,
  offers,
  onOpen,
}: {
  title: string;
  empty: string;
  offers: OfferHit[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      {offers.length === 0 ? <p className="mt-2 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{empty}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {offers.map((offer) => (
          <Link
            key={`${title}-${offer.id}`}
            href={buildOfferPublicPath(offer.id, offer.title)}
            onClick={() => onOpen(offer.id)}
            className={`${meCardClass} block p-4`}
          >
            {offer.matchLabel ? <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">{offer.matchLabel}</p> : <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6e6e73]">Hallazgo general</p>}
            <p className="mt-2 text-[15px] font-semibold">{offer.title}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
