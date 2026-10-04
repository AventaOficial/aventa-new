import Link from 'next/link';
import { redirect } from 'next/navigation';
import { teamMetadata } from '@/lib/team/config/catalog';
import { teamRoleLabel } from '@/lib/team/roles/catalog';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { TeamMark } from '../shell/TeamMark';

export default async function TeamSelectPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') redirect('/team/gate?next=/team/select');
  if (entry.kind === 'no-access' || entry.kind === 'unavailable' || entry.kind === 'forbidden') {
    redirect('/team/no-access');
  }
  if (entry.kind !== 'select' || entry.memberships.length === 0) redirect('/team/no-access');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#737373]">Aventa Team OS</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">Elige tu área</h1>
      <p className="mt-2 text-sm text-[#424245] dark:text-[#a1a1a6]">Solo aparecen los equipos activos de tu cuenta.</p>
      <ul className="mt-8 flex flex-col gap-3">
        {entry.memberships.map((membership) => {
          const metadata = teamMetadata(membership.teamId);
          return (
            <li key={membership.teamId}>
              <Link
                href={`/team/${membership.teamId}`}
                className="flex items-center gap-4 rounded-2xl border border-[#d2d2d7] bg-white px-4 py-4 dark:border-[#2a2a2a] dark:bg-[#141414]"
              >
                <TeamMark teamId={membership.teamId} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{metadata.displayName}</span>
                  <span className="mt-1 block text-sm text-[#737373]">{metadata.shortDescription}</span>
                  <span className="mt-1 block text-sm text-[#424245] dark:text-[#a1a1a6]">
                    {teamRoleLabel(membership.teamId, membership.role)}
                  </span>
                </span>
                <span className="text-sm font-medium text-violet-600 dark:text-violet-400">Entrar</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
