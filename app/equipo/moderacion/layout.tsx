import ModerationHubShell from '@/app/admin/moderation/ModerationHubShell';

export default function EquipoModeracionLayout({ children }: { children: React.ReactNode }) {
  return <ModerationHubShell mode="workspace">{children}</ModerationHubShell>;
}
