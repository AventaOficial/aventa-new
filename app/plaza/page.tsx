'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import CatalogGapsBoard from '@/app/components/CatalogGapsBoard';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';

type Tab = 'requests' | 'talk' | 'avisos';

type RequestItem = {
  id: string;
  title: string;
  details: string | null;
  budget_max: number | null;
  preferred_store: string | null;
  created_at: string;
};

type Discussion = { id: string; title: string; body: string; created_at: string };
type Aviso = { id: string; title: string; body: string | null; link: string | null; created_at: string };

function PlazaInner() {
  const { session } = useAuth();
  const { openRegisterModal } = useUI();
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [talk, setTalk] = useState<Discussion[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [talkTitle, setTalkTitle] = useState('');
  const [talkBody, setTalkBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;

  const load = () => {
    fetch('/api/plaza/requests?limit=20')
      .then((r) => r.json())
      .then((d) => setRequests(d.requests ?? []))
      .catch(() => setRequests([]));
    fetch('/api/plaza/discussions')
      .then((r) => r.json())
      .then((d) => setTalk(d.discussions ?? []))
      .catch(() => setTalk([]));
    fetch('/api/announcements')
      .then((r) => r.json())
      .then((d) => setAvisos(d.announcements ?? []))
      .catch(() => setAvisos([]));
  };

  useEffect(() => {
    load();
  }, []);

  const requireAuth = () => {
    if (session) return true;
    openRegisterModal('signup');
    return false;
  };

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    setSaving(true);
    setError(null);
    const res = await fetch('/api/plaza/requests', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, details }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo publicar.');
      return;
    }
    setTitle('');
    setDetails('');
    load();
  };

  const submitTalk = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    setSaving(true);
    setError(null);
    const res = await fetch('/api/plaza/discussions', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: talkTitle, body: talkBody }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo publicar.');
      return;
    }
    setTalkTitle('');
    setTalkBody('');
    load();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28 md:pb-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">
        Comunidad
      </p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">Plaza</h1>
      <p className="mt-1.5 max-w-xl text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
        Pide lo que quieres cazar, conversa con la comunidad y revisa avisos de Aventa.
      </p>

      <div className="mt-5 flex gap-2">
        {(
          [
            { id: 'requests' as const, label: 'Solicitudes' },
            { id: 'talk' as const, label: 'Conversaciones' },
            { id: 'avisos' as const, label: 'Avisos' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === t.id
                ? 'bg-violet-600 text-white'
                : 'bg-white text-[#6e6e73] border border-[#e5e5e7] dark:bg-[#141414] dark:border-[#333] dark:text-[#a3a3a3]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {tab === 'requests' ? (
        <div className="mt-5 space-y-4">
          <CatalogGapsBoard />
          <form onSubmit={submitRequest} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Pedir una oferta</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. AirPods Pro de segunda, buen precio"
              className="mt-2 w-full rounded-xl border border-[#e5e5e7] bg-transparent px-3 py-2 text-sm dark:border-[#333]"
              required
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Detalles opcionales: presupuesto, tienda, condición…"
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#e5e5e7] bg-transparent px-3 py-2 text-sm dark:border-[#333]"
            />
            <button
              type="submit"
              disabled={saving}
              className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Publicar solicitud
            </button>
          </form>
          {requests.length === 0 ? (
            <p className="text-sm text-[#6e6e73]">Nadie ha pedido una oferta todavía.</p>
          ) : (
            requests.map((item) => (
              <article key={item.id} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
                <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h2>
                {item.details ? <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a3a3a3]">{item.details}</p> : null}
                <Link
                  href={`/?upload=1&title=${encodeURIComponent(item.title)}`}
                  className="mt-3 inline-flex rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Ayudar a cazar
                </Link>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === 'talk' ? (
        <div className="mt-5 space-y-4">
          <form onSubmit={submitTalk} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Abrir conversación</p>
            <input
              value={talkTitle}
              onChange={(e) => setTalkTitle(e.target.value)}
              placeholder="Tema"
              className="mt-2 w-full rounded-xl border border-[#e5e5e7] bg-transparent px-3 py-2 text-sm dark:border-[#333]"
              required
            />
            <textarea
              value={talkBody}
              onChange={(e) => setTalkBody(e.target.value)}
              placeholder="¿Qué quieres comentar con la comunidad?"
              rows={4}
              className="mt-2 w-full rounded-xl border border-[#e5e5e7] bg-transparent px-3 py-2 text-sm dark:border-[#333]"
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Publicar
            </button>
          </form>
          {talk.length === 0 ? (
            <p className="text-sm text-[#6e6e73]">Todavía no hay conversaciones.</p>
          ) : (
            talk.map((item) => (
              <article key={item.id} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
                <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#6e6e73] dark:text-[#a3a3a3]">{item.body}</p>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === 'avisos' ? (
        <div className="mt-5 space-y-3">
          {avisos.length === 0 ? (
            <p className="text-sm text-[#6e6e73]">No hay avisos por ahora.</p>
          ) : (
            avisos.map((item) => (
              <article key={item.id} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
                <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h2>
                {item.body ? <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a3a3a3]">{item.body}</p> : null}
                {item.link ? (
                  <a href={item.link} className="mt-2 inline-block text-xs font-semibold text-violet-600">
                    Ver más
                  </a>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PlazaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7]" />}>
      <ClientLayout>
        <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <PlazaInner />
        </div>
      </ClientLayout>
    </Suspense>
  );
}
