import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveTeamPage } from '@/lib/team/gate/require';

export default async function TeamNoAccessPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') redirect('/team/gate?next=/team');
  if (entry.kind === 'select' || entry.kind === 'allow') redirect('/team/select');

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#737373]">Aventa</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Sin acceso a Team OS</h1>
      {entry.kind === 'unavailable' ? (
        <p className="mt-4 text-sm text-[#424245] dark:text-[#a1a1a6]">No pudimos comprobar tus equipos. Intenta de nuevo.</p>
      ) : (
        <div className="mt-4 space-y-2 text-sm text-[#424245] dark:text-[#a1a1a6]">
          <p>Tu cuenta todavía no tiene acceso a Team OS.</p>
          <p>No hay áreas asignadas a tu cuenta.</p>
        </div>
      )}
      <Link
        href="/"
        className="mt-8 inline-flex w-fit rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white"
      >
        Volver a Aventa
      </Link>
    </main>
  );
}
