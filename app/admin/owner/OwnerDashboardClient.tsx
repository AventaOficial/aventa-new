'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import LoadingState from '@/app/components/panel/LoadingState';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { buildIntelligenceFromData } from '@/lib/owner/buildIntelligence';
import OwnerHero from './components/OwnerHero';
import OwnerKpiStrip from './components/OwnerKpiStrip';
import RevenueSection from './components/RevenueSection';
import OwnerHealthCard from './components/OwnerHealthCard';
import AttentionRequired from './components/AttentionRequired';
import LiveActivitySection from './components/LiveActivitySection';
import BusinessPerformance from './components/BusinessPerformance';
import TopMarketsSection from './components/TopMarketsSection';
import AventaIntelligence from './components/AventaIntelligence';
import TeamHealthSection from './components/TeamHealthSection';
import MyPriorities from './components/MyPriorities';
import EndOfDayPreview from './components/EndOfDayPreview';

export default function OwnerDashboardClient() {
  const [data, setData] = useState<OwnerDashboardPayload | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Inicia sesión');
      setLoading(false);
      return;
    }

    const userRes = await supabase.auth.getUser();
    if (userRes.data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userRes.data.user.id)
        .maybeSingle();
      setDisplayName((profile as { display_name?: string } | null)?.display_name ?? null);
    }

    const res = await fetch('/api/admin/owner-dashboard', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === 'string' ? json.error : 'Error al cargar');
      setData(null);
      return;
    }
    setData(json as OwnerDashboardPayload);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return <LoadingState message="Cargando Command Center…" />;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!data) return null;

  const intelligence = buildIntelligenceFromData(data);
  const suggestedPriorities = intelligence.actions.map((a) => ({
    title: a.label,
    priority: a.priority,
  }));

  return (
    <div className="pb-12">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 transition-all duration-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <OwnerHero data={data} displayName={displayName} />
      <OwnerKpiStrip data={data} />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <RevenueSection data={data} />
        </div>
        <OwnerHealthCard data={data} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <AttentionRequired data={data} />
        <TeamHealthSection />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <LiveActivitySection data={data} />
        <TopMarketsSection data={data} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <BusinessPerformance data={data} />
        <AventaIntelligence data={data} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <MyPriorities suggested={suggestedPriorities} />
        <EndOfDayPreview data={data} />
      </div>

      {/* Detalle expandible — conserva KPIs legacy sin saturar el cockpit */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        >
          <span className="text-sm font-medium text-white/70">
            {showDetail ? 'Ocultar detalle operativo' : 'Ver detalle operativo completo'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-white/30">KPIs · mod · afiliación</span>
        </button>
        {showDetail ? (
          <div className="p-5 border-t border-white/[0.06] space-y-4 text-sm text-white/60">
            <p>
              <strong className="text-white/80">Moderación:</strong> {data.moderation.pending} pendientes · SLA{' '}
              {data.moderation.avgApprovalHours != null ? `${data.moderation.avgApprovalHours}h` : '—'}
            </p>
            <p>
              <strong className="text-white/80">Afiliación:</strong> {data.affiliation.programsActive}/
              {data.affiliation.programsTotal} programas · Amazon{' '}
              {data.affiliation.amazonTagConfigured ? '✓' : '✗'} · ML{' '}
              {data.affiliation.mercadolibreTagConfigured ? '✓' : '✗'}
            </p>
            <p>
              <strong className="text-white/80">Operaciones:</strong> integridad{' '}
              {data.operations.integrityOk === true ? 'OK' : data.operations.integrityOk === false ? 'falló' : '—'} ·
              cola {data.operations.writeQueuePending} pendientes
            </p>
            <p>
              <strong className="text-white/80">Calidad:</strong> 🟢 {data.offerHealth.verifiedAvailable} · 🟡{' '}
              {data.offerHealth.priceChanged} · 🔴 {data.offerHealth.outOfStock}
            </p>
            {data.dataGaps.length > 0 ? (
              <ul className="text-xs text-white/40 list-disc list-inside">
                {data.dataGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
