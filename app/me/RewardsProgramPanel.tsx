'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Gift, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';

type StatusPayload = {
  programName: string;
  programActive: boolean;
  progress: {
    approvedOffers: number;
    requiredOffers: number;
    positiveVotes: number;
    requiredVotes: number;
    unlocked: boolean;
    unlockedAt: string | null;
  };
  welcome: {
    needsSelection: boolean;
    welcomeOfferId: string | null;
    welcomeOffer: { id: string; title: string } | null;
    choices: Array<{ id: string; title: string; created_at: string }>;
  };
  balances: {
    validatingCents: number;
    availableCents: number;
    paidCents: number;
  };
  policy: { creatorShareBps: number; minPayoutCents: number; holdDays: number };
};

function centsToMx(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function RewardsProgramPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setData(null);
        return;
      }
      const res = await fetch('/api/me/rewards/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
        setData(null);
        return;
      }
      setData(body as StatusPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (active) setData(null);
          return;
        }
        const res = await fetch('/api/me/rewards/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
          setData(null);
          return;
        }
        setData(body as StatusPayload);
      } catch {
        if (active) setError('Error de red');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectWelcome = async (offerId: string) => {
    setSelecting(offerId);
    setMsg(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/me/rewards/welcome-offer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      setMsg('Oferta de Bienvenida registrada.');
      await reload();
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-white/80 dark:bg-[#141414] p-4 text-sm text-gray-500">
        Cargando Programa de Recompensas…
      </div>
    );
  }

  if (error || !data) return null;

  const p = data.progress;
  const sharePct = Math.round(data.policy.creatorShareBps / 100);

  return (
    <div className="rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/20 dark:to-[#141414] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">{data.programName}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <div className="border-t border-violet-100 dark:border-violet-900/40 px-4 pb-4 pt-3 space-y-4 text-sm">
          {!p.unlocked ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                Publica ofertas de calidad y desbloquea el Programa de Recompensas cuando la
                comunidad te apoye. Los votos ayudan al desbloqueo; no garantizan ingresos.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/70 dark:bg-[#1a1a1a] p-3 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Ofertas aprobadas</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {p.approvedOffers} / {p.requiredOffers}
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-[#1a1a1a] p-3 border border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Votos positivos</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {p.positiveVotes} / {p.requiredVotes}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="font-medium">Programa de Recompensas desbloqueado</p>
              </div>

              {data.welcome.needsSelection ? (
                <div className="space-y-2">
                  <p className="text-gray-700 dark:text-gray-300">
                    Elige una de tus primeras ofertas como tu <strong>Oferta de Bienvenida</strong>.
                  </p>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {data.welcome.choices.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          disabled={selecting === o.id}
                          onClick={() => selectWelcome(o.id)}
                          className="w-full text-left rounded-lg border border-violet-200 dark:border-violet-800 px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-60"
                        >
                          {o.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : data.welcome.welcomeOffer ? (
                <p className="text-gray-700 dark:text-gray-300">
                  Oferta de Bienvenida: <strong>{data.welcome.welcomeOffer.title}</strong>
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] uppercase text-gray-500">En validación</p>
                  <p className="font-semibold">{centsToMx(data.balances.validatingCents)}</p>
                </div>
                <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] uppercase text-gray-500">Disponible</p>
                  <p className="font-semibold">{centsToMx(data.balances.availableCents)}</p>
                </div>
                <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] uppercase text-gray-500">Pagado</p>
                  <p className="font-semibold">{centsToMx(data.balances.paidCents)}</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Recibes hasta el {sharePct}% de las comisiones reales atribuibles a tus ofertas{' '}
                <strong>participantes</strong> (Oferta de Bienvenida + elegibles post-desbloqueo),
                tras validación de {data.policy.holdDays} días. Retiro mínimo{' '}
                {centsToMx(data.policy.minPayoutCents)}. Sin comisión atribuible no hay recompensa.
                En Mercado Libre la atribución puede requerir revisión manual.
              </p>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline font-medium">
                  Cómo funciona el Programa de Recompensas
                </Link>
              </p>

              {!data.programActive ? (
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>El programa aún no está activo públicamente. Tu progreso ya quedó guardado.</span>
                </div>
              ) : null}
            </>
          )}

          {msg ? <p className="text-emerald-600 dark:text-emerald-400 text-xs">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
