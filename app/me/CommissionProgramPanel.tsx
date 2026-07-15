'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Shield,
  FileText,
  Lock,
} from 'lucide-react';

type FiscalPayload = {
  legalName: string | null;
  rfc: string | null;
  clabe: string | null;
  updatedAt: string | null;
};

type StatusPayload = {
  qualifyingCount: number;
  requiredOffers: number;
  voteThreshold: number;
  eligible: boolean;
  termsVersion: string;
  acceptedAt: string | null;
  termsAcceptedVersion: string | null;
  programPubliclyActive: boolean;
  fiscal: FiscalPayload;
  fiscalComplete: boolean;
  canActivate: boolean;
};

export default function CommissionProgramPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedMsg, setAcceptedMsg] = useState<string | null>(null);
  const [fiscalMsg, setFiscalMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [rfc, setRfc] = useState('');
  const [clabe, setClabe] = useState('');

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
      const payload = body as StatusPayload;
      setData(payload);
      setLegalName(payload.fiscal?.legalName ?? '');
      setRfc(payload.fiscal?.rfc ?? '');
      setClabe(payload.fiscal?.clabe ?? '');
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

  const saveFiscal = async () => {
    setFiscalMsg(null);
    setError(null);
    setSavingFiscal(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/me/commission-fiscal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ legal_name: legalName, rfc, clabe: clabe || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudieron guardar los datos fiscales');
        return;
      }
      setFiscalMsg('Datos fiscales guardados correctamente.');
      await load();
    } finally {
      setSavingFiscal(false);
    }
  };

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
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-3 w-full bg-gray-100 dark:bg-[#1a1a1a] rounded" />
      </div>
    );
  }

  if (!data) {
    if (error) {
      return (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
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
  const missing = Math.max(0, data.requiredOffers - data.qualifyingCount);
  const showFiscalForm = data.eligible || hasAccepted;

  return (
    <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/70 dark:bg-violet-950/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Comisiones (nivel creador)
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {data.qualifyingCount}/{data.requiredOffers} ofertas calificadas ({data.voteThreshold}+ votos c/u)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:underline"
        >
          {expanded ? 'Ocultar' : 'Ver'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="mt-2.5">
        <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          <span>Progreso</span>
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

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {hasAccepted ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 font-medium text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Activo
          </span>
        ) : data.eligible && data.fiscalComplete && data.programPubliclyActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-200">
            Listo para activar
          </span>
        ) : data.eligible ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-200">
            Elegible — completa fiscal
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-[#1a1a1a] px-2 py-0.5 font-medium text-gray-700 dark:text-gray-300">
            Te faltan {missing} ofertas calificadas
          </span>
        )}
        {data.fiscalComplete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 font-medium text-blue-800 dark:text-blue-200">
            <FileText className="h-3 w-3" />
            Fiscal OK
          </span>
        ) : showFiscalForm ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 font-medium text-orange-800 dark:text-orange-200">
            <AlertCircle className="h-3 w-3" />
            Falta RFC
          </span>
        ) : null}
        {!data.programPubliclyActive && data.eligible ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-[#1a1a1a] px-2 py-0.5 font-medium text-gray-600 dark:text-gray-400">
            <Lock className="h-3 w-3" />
            Programa en preparación
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 rounded-lg border border-violet-200/70 dark:border-violet-800/40 bg-white/70 dark:bg-[#141414]/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Regla: necesitas {data.requiredOffers} ofertas aprobadas/publicadas y cada una con al menos{' '}
            {data.voteThreshold} votos positivos.{' '}
            <Link href="/comisiones" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              Más información
            </Link>
          </p>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {fiscalMsg ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{fiscalMsg}</span>
            </div>
          ) : null}

          {acceptedMsg ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{acceptedMsg}</span>
            </div>
          ) : null}

          {showFiscalForm ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-[#1a1a1a]/80 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Datos fiscales para pagos</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Nombre legal y RFC son obligatorios. CLABE acelera transferencias. Un RFC solo puede usarse en una cuenta.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre legal completo</span>
                  <input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Como en tu constancia fiscal"
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#141414]"
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">RFC</span>
                  <input
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    placeholder="XAXX010101000"
                    maxLength={13}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono bg-white dark:bg-[#141414]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">CLABE (opcional)</span>
                  <input
                    value={clabe}
                    onChange={(e) => setClabe(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    placeholder="18 dígitos"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono bg-white dark:bg-[#141414]"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => saveFiscal()}
                disabled={savingFiscal}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold px-4 py-2 text-sm disabled:opacity-60"
              >
                {savingFiscal ? 'Guardando…' : 'Guardar datos fiscales'}
              </button>
            </div>
          ) : null}

          {data.canActivate ? (
            <div className="rounded-xl border border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/30 p-3 space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Cumples todos los requisitos. Para activar participación, acepta términos del programa (sección 8 de{' '}
                <Link href="/terms" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
                  Términos y Condiciones
                </Link>
                ).
              </p>
              <button
                type="button"
                onClick={() => accept()}
                disabled={accepting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
              >
                {accepting ? 'Guardando…' : 'Activar participación'}
              </button>
            </div>
          ) : null}

          {data.eligible && !hasAccepted && !data.programPubliclyActive ? (
            <div className="flex items-start gap-2 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              <Lock className="h-4 w-4 shrink-0 mt-0.5 text-gray-500" />
              <p>
                Ya cumples los requisitos de contenido. AVENTA anunciará por canales oficiales cuando el programa abra para activación y pagos.
              </p>
            </div>
          ) : null}

          {data.eligible && !hasAccepted && data.programPubliclyActive && !data.fiscalComplete ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Guarda tu nombre legal y RFC arriba antes de activar.
            </p>
          ) : null}

          {hasAccepted ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50/90 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Participación registrada</p>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 mt-0.5">
                  Términos versión {data.termsAcceptedVersion ?? data.termsVersion}. Los pagos se procesan manualmente cada mes tras revisión anti-fraude.
                </p>
              </div>
            </div>
          ) : null}

          {!data.eligible ? (
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
              Consejo: revisa en “Tus ofertas” cuáles ya superan {data.voteThreshold} votos positivos.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
