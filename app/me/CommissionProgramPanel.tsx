'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Wallet, CheckCircle2, AlertCircle } from 'lucide-react';

type StatusPayload = {
  qualifyingCount: number;
  requiredOffers: number;
  voteThreshold: number;
  eligible: boolean;
  termsVersion: string;
  acceptedAt: string | null;
  termsAcceptedVersion: string | null;
};

export default function CommissionProgramPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedMsg, setAcceptedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
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
      const res = await fetch('/api/me/commission-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar el programa');
        setData(null);
        return;
      }
      setData(body as StatusPayload);
    } catch {
      setError('Error de red');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    setAcceptedMsg(null);
    setError(null);
    setAccepting(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/me/commissions-accept', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo registrar la aceptación');
        return;
      }
      setAcceptedMsg('Listo: quedó registrada tu aceptación de los términos del programa.');
      await load();
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-8 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data) {
    if (error) {
      return (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 mb-8">
          {error}
        </div>
      );
    }
    return null;
  }

  const pct = Math.min(
    100,
    data.requiredOffers > 0 ? Math.round((data.qualifyingCount / data.requiredOffers) * 100) : 0,
  );
  const hasAccepted = Boolean(data.acceptedAt);

  return (
    <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/30 dark:to-gray-900 p-5 md:p-6 mb-8 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Programa de comisiones (creadores)</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            Requisito para poder activar participación:{' '}
            <strong className="text-gray-800 dark:text-gray-200">
              {data.requiredOffers} ofertas aprobadas
            </strong>
            , cada una con al menos{' '}
            <strong className="text-gray-800 dark:text-gray-200">{data.voteThreshold} votos positivos</strong> (según
            métricas de la plataforma). Subir más ofertas sin alcanzar el umbral en cada una no sustituye este requisito.
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          <span>Progreso hacia el requisito</span>
          <span className="tabular-nums">
            {data.qualifyingCount}/{data.requiredOffers} ofertas calificadas
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200 mb-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {acceptedMsg ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200 mb-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{acceptedMsg}</span>
        </div>
      ) : null}

      {data.eligible && !hasAccepted ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 p-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Cumples el requisito numérico. Para participar debes aceptar los términos actualizados del programa (sección
            8 de los{' '}
            <Link href="/terms" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              Términos y Condiciones
            </Link>
            ). Los pagos y detalles operativos se comunicarán por canales oficiales cuando el programa esté activo.
          </p>
          <button
            type="button"
            onClick={() => accept()}
            disabled={accepting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60"
          >
            {accepting ? 'Guardando…' : 'Aceptar términos y activar participación'}
          </button>
        </div>
      ) : null}

      {data.eligible && hasAccepted ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50/90 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Participación registrada</p>
            <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 mt-0.5">
              Términos versión {data.termsAcceptedVersion ?? data.termsVersion}. El equipo te contactará por canales
              oficiales cuando procedan pagos o siguientes pasos.
            </p>
          </div>
        </div>
      ) : null}

      {!data.eligible ? (
        <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
          Consejo: revisa en &quot;Tus ofertas&quot; cuáles ya superan {data.voteThreshold} votos positivos. Solo cuentan
          ofertas aprobadas o publicadas.
        </p>
      ) : null}
    </div>
  );
}
