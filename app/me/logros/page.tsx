'use client';

import AchievementCollection from '@/app/components/achievements/AchievementCollection';
import { MeSpaceShell, meHeroAccentClass } from '@/app/me/dashboard/MeSectionPage';
import { LogrosHeroAside } from '@/app/me/logros/LogrosBoard';

export default function LogrosPage() {
  return (
    <MeSpaceShell
      tone="night"
      wide
      integrated
      accentClassName={meHeroAccentClass}
      title="Tus hazañas"
      accent="hablan por ti."
      lede="Descubre lo que has conseguido y lo que todavía puedes desbloquear."
      aside={<LogrosHeroAside />}
    >
      <AchievementCollection variant="full" appearance="night" />
    </MeSpaceShell>
  );
}
