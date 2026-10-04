import { Activity, Box, Crosshair, Landmark, MessagesSquare, Shield, Sprout, type LucideIcon } from 'lucide-react';
import { teamMetadata } from '@/lib/team/config/catalog';
import type { TeamIconName } from '@/lib/team/config/types';
import type { TeamId } from '@/lib/team/roles/teams';

const ICONS: Record<TeamIconName, LucideIcon> = {
  shield: Shield,
  crosshair: Crosshair,
  sprout: Sprout,
  box: Box,
  messages: MessagesSquare,
  activity: Activity,
  landmark: Landmark,
};

export function TeamMark({ teamId, size = 'md' }: { teamId: TeamId; size?: 'sm' | 'md' }) {
  const metadata = teamMetadata(teamId);
  const Icon = ICONS[metadata.icon];
  const box = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-2xl text-white ${metadata.accentClass}`}>
      <Icon className={icon} aria-hidden="true" />
    </span>
  );
}
