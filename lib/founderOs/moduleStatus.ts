import type { CeoPriority, HealthCategory } from '@/app/admin/owner/command/types';
import type { FounderModule } from './modules';

export type ModuleStatusLabel = 'Healthy' | 'Atención' | 'Crítico' | 'Sin datos' | 'Congelado' | 'Informativo';

export type ModuleStatus = {
  label: ModuleStatusLabel;
  summary: string | null;
  attention: CeoPriority[];
  updatedAt: string | null;
};

/** Estado de un módulo a partir de las mismas señales del Control Center. */
export function moduleStatus(module: FounderModule, health: HealthCategory[], priorities: CeoPriority[]): ModuleStatus {
  const attention = priorities.filter((p) => p.severity !== 'info' && module.teams.includes(p.team));
  if (module.healthArea == null) return { label: 'Informativo', summary: null, attention, updatedAt: null };

  const area = health.find((h) => h.id === module.healthArea);
  if (!area) return { label: 'Sin datos', summary: null, attention, updatedAt: null };

  let label: ModuleStatusLabel;
  if (area.level === 'CRITICAL' || attention.some((p) => p.severity === 'critical')) label = 'Crítico';
  else if (area.level === 'WARNING' || attention.some((p) => p.severity === 'high')) label = 'Atención';
  else if (area.level === 'FROZEN') label = 'Congelado';
  else if (area.level === 'UNKNOWN') label = 'Sin datos';
  else label = 'Healthy';

  return { label, summary: area.summary, attention, updatedAt: area.updatedAt };
}
