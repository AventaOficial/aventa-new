'use client';

import GlassCard from '@/app/components/panel/GlassCard';
import ActivityFeed, { type ActivityItem } from '@/app/components/panel/ActivityFeed';
import EmptyState from '@/app/components/panel/EmptyState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';

function buildActivityItems(data: OwnerDashboardPayload): ActivityItem[] {
  const items: ActivityItem[] = [];
  const now = new Date(data.generatedAt);

  if (data.today.offersApproved != null && data.today.offersApproved > 0) {
    items.push({
      id: 'approved',
      type: 'Moderación',
      message: `${data.today.offersApproved} ofertas aprobadas hoy`,
      time: 'Hoy',
      tone: 'success',
    });
  }

  if (data.today.newUsers != null && data.today.newUsers > 0) {
    items.push({
      id: 'users',
      type: 'Usuarios',
      message: `${data.today.newUsers} nuevos registros`,
      time: 'Hoy',
      tone: 'info',
    });
  }

  if (data.economy.day.realCents != null && data.economy.day.realCents > 0) {
    items.push({
      id: 'commission',
      type: 'Finanzas',
      message: 'Ingreso registrado en ledger (hoy)',
      time: 'Hoy',
      tone: 'success',
    });
  }

  if (data.operations.writeQueuePending > 0) {
    items.push({
      id: 'queue',
      type: 'Automations',
      message: `${data.operations.writeQueuePending} jobs en cola de escritura`,
      time: 'En vivo',
      tone: data.operations.writeQueueFailed > 0 ? 'warning' : 'default',
    });
  }

  if (data.moderation.pending > 0) {
    items.push({
      id: 'pending',
      type: 'Cola',
      message: `${data.moderation.pending} ofertas pendientes de revisión`,
      time: 'En vivo',
      tone: 'warning',
    });
  }

  if (data.alerts.length > 0) {
    items.push({
      id: 'alert',
      type: 'Alerta',
      message: data.alerts[0].title,
      time: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      tone: data.alerts[0].severity === 'red' ? 'warning' : 'default',
    });
  }

  return items.slice(0, 8);
}

export default function LiveActivitySection({ data }: { data: OwnerDashboardPayload }) {
  const items = buildActivityItems(data);

  return (
    <GlassCard variant="dark" padding="lg">
      <SectionHeader title="Live Activity" subtitle="Señal operativa, no ruido" variant="dark" />
      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState title="Sin actividad relevante reciente." variant="dark" className="py-4" />
        ) : (
          <ActivityFeed items={items} variant="dark" />
        )}
      </div>
    </GlassCard>
  );
}
