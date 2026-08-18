'use client';

import Link from 'next/link';
import GlassCard from '@/app/components/panel/GlassCard';
import HealthIndicator from '@/app/components/panel/HealthIndicator';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { computeOwnerHealth } from '@/lib/owner/computeOwnerHealth';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';

export default function OwnerHealthCard({ data }: { data: OwnerDashboardPayload }) {
  const { overall, dimensions } = computeOwnerHealth(data);

  return (
    <GlassCard variant="dark" padding="lg" className="h-full">
      <SectionHeader title="AVENTA Health" variant="dark" />
      <div className="mt-4">
        <HealthIndicator score={overall} dimensions={dimensions} size="md" />
      </div>
      <Link
        href="/admin/health"
        className="mt-4 inline-block text-xs font-medium text-violet-400 hover:text-violet-300"
      >
        Ver sistema completo →
      </Link>
    </GlassCard>
  );
}
