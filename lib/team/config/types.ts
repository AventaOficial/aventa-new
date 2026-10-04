import type { TeamPermission } from '../permissions/registry';
import type { TeamId } from '../roles/teams';

/** Identidad de producto. No concede acceso. */
export type TeamIconName = 'shield' | 'crosshair' | 'sprout' | 'box' | 'messages' | 'activity' | 'landmark';

export type TeamNavigationDefinition = {
  id: string;
  label: string;
  permission: TeamPermission;
};

export type TeamNavigationItem = TeamNavigationDefinition & {
  href: `/team/${TeamId}`;
};

export type TeamMetadata = {
  teamId: TeamId;
  displayName: string;
  shortDescription: string;
  tagline: string;
  homeLine: string;
  icon: TeamIconName;
  accentClass: string;
  navigation: readonly TeamNavigationDefinition[];
};

export type TeamSwitcherEntry = {
  teamId: TeamId;
  displayName: string;
  roleLabel: string;
  current: boolean;
};

export type TeamShellContext = {
  teamId: TeamId;
  roleLabel: string;
  greeting: string;
  personName: string;
  navigation: readonly TeamNavigationItem[];
  switcher: readonly TeamSwitcherEntry[];
};
