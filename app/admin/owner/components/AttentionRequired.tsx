'use client';

import GlassCard from '@/app/components/panel/GlassCard';
import AlertCard from '@/app/components/panel/AlertCard';
import EmptyState from '@/app/components/panel/EmptyState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';

export default function AttentionRequired({ data }: { data: OwnerDashboardPayload }) {
  const alerts = data.alerts.slice(0, 5);

  return (
    <GlassCard variant="dark" padding="lg" className="h-full">
      <SectionHeader title="Attention Required" subtitle="Máximo 5 problemas importantes" variant="dark" />
      <div className="mt-4 space-y-2">
        {alerts.length === 0 ? (
          <EmptyState title="Todo está bajo control." variant="dark" className="py-6" />
        ) : (
          alerts.map((a) => (
            <AlertCard
              key={a.id}
              severity={a.severity === 'red' ? 'critical' : 'attention'}
              title={a.title}
              impact={a.detail}
              href={data.recommendedAction.href}
            />
          ))
        )}
      </div>
    </GlassCard>
  );
}
