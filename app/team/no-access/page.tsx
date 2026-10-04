import { redirect } from 'next/navigation';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { TeamFrame } from '../frame';

export default async function TeamNoAccessPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') redirect('/team/gate?next=/team');
  if (entry.kind === 'select' || entry.kind === 'allow') redirect('/team/select');

  return (
    <TeamFrame title="Sin acceso a Team OS">
      <p className="text-sm text-[#424245] dark:text-[#a1a1a6]">
        {entry.kind === 'unavailable'
          ? 'No pudimos comprobar tus equipos. Intenta de nuevo.'
          : 'Tu cuenta no tiene un equipo activo.'}
      </p>
    </TeamFrame>
  );
}
