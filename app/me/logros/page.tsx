'use client';

import { Trophy } from 'lucide-react';
import AchievementCollection from '@/app/components/achievements/AchievementCollection';
import { MeSpaceShell } from '@/app/me/dashboard/MeSectionPage';
import { LogrosHeroAside } from '@/app/me/logros/LogrosBoard';

export default function LogrosPage() {
  return (
    <MeSpaceShell
      tone="night"
      wide
      asideBare
      eyebrow="Logros"
      mark={<Trophy className="h-3.5 w-3.5" aria-hidden />}
      title="Tus hazañas"
      accent="hablan por ti."
      lede="Descubre lo que has conseguido y lo que todavía puedes desbloquear."
      note={<span className="block h-1 w-16 rounded-full bg-violet-500" aria-hidden />}
      aside={<LogrosHeroAside />}
    >
      <AchievementCollection variant="full" appearance="night" />
    </MeSpaceShell>
  );
}
