import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';

/** REAL = lectura directa · CALCULATED = derivado de lecturas reales · UNAVAILABLE = sin fuente o lectura fallida. */
export type Provenance = 'REAL' | 'CALCULATED' | 'UNAVAILABLE';

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

export const TEAM_LABEL: Record<TeamId, string> = {
  moderacion: 'Moderación',
  finanzas: 'Finanzas',
  growth: 'Growth',
  producto: 'Producto',
  hunter: 'Hunter',
  comunidad: 'Comunidad',
  operaciones: 'Operaciones',
};

export type HealthAreaId = 'PRODUCT' | 'COMMUNITY' | 'CATALOG' | 'HUNTER' | 'GROWTH' | 'MONETIZATION';

export type HealthCategory = {
  id: HealthAreaId;
  label: string;
  level: HealthLevel;
  /** Razón principal del estado, en lenguaje de negocio. */
  summary: string;
  signals: string[];
  team: TeamId;
  /** Momento del dato más reciente que sostiene el estado (ISO); null si no se conoce. */
  updatedAt: string | null;
  href: string;
  cta: string;
};

export type PrioritySeverity = 'critical' | 'high' | 'medium' | 'info';

export type CeoPriority = {
  id: string;
  severity: PrioritySeverity;
  team: TeamId;
  /** Título corto del problema. */
  problem: string;
  /** Motivo: la condición real que dispara la prioridad. */
  reason: string;
  /** Impacto en negocio si no se atiende. */
  impact: string;
  quantity: number | null;
  action: string;
  href: string;
  provenance: 'REAL' | 'CALCULATED';
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
