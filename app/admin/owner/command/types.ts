import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';

export type Provenance = 'REAL' | 'DERIVED' | 'UNKNOWN';

export type HealthLevel = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' | 'FROZEN';

export type SourceState<T> = {
  status: 'loading' | 'success' | 'error';
  data: T | null;
  error: string | null;
  fetchedAt: number | null;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  active: boolean;
  link: string | null;
  updated_at: string | null;
};

export type CommandData = {
  base: SourceState<OwnerDashboardPayload>;
  command: SourceState<OwnerCommandPayload>;
  gerencia: SourceState<GerenciaPayload>;
  announcements: SourceState<AnnouncementRow[]>;
};

export type TeamId = 'moderacion' | 'finanzas' | 'growth' | 'producto' | 'hunter' | 'comunidad' | 'operaciones';

export type HealthCategory = {
  id: 'PRODUCT' | 'OPERATIONS' | 'COMMUNITY' | 'MONETIZATION' | 'INFRASTRUCTURE' | 'GROWTH';
  label: string;
  level: HealthLevel;
  summary: string;
  signals: string[];
  team: TeamId;
};

export type PrioritySeverity = 'critical' | 'high' | 'medium' | 'low';

export type CeoPriority = {
  id: string;
  severity: PrioritySeverity;
  team: TeamId;
  problem: string;
  impact: string;
  quantity: number | null;
  action: string;
  href: string;
  provenance: 'REAL' | 'DERIVED';
};

export type DerivedGoal = {
  id: string;
  label: string;
  current: number | null;
  target: number | null;
  done: boolean | null;
  href: string;
  rule: string;
};
