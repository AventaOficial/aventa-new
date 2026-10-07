'use client';

import AchievementCollection from '@/app/components/achievements/AchievementCollection';
import { MeSpaceShell } from '@/app/me/dashboard/MeSectionPage';
import { LogrosHeroAside } from '@/app/me/logros/LogrosBoard';

export default function LogrosPage() {
  return (
    <MeSpaceShell
      tone="night"
      wide
      asideBare
      title="Mis"
      accent="logros"
      lede="Completa logros, sube de nivel y demuestra que eres un verdadero cazador de ofertas en Aventa."
      note={<span className="block h-1 w-16 rounded-full bg-violet-500" aria-hidden />}
      aside={<LogrosHeroAside />}
    >
      <AchievementCollection variant="full" appearance="night" />
    </MeSpaceShell>
  );
}
