'use client';

import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import RewardsProgramPanel from '@/app/me/RewardsProgramPanel';

export default function ProgramaPage() {
  return (
    <MeSectionPage title="Requisitos" lede="El programa usa sus reglas actuales. Tu nivel de comunidad no las cambia.">
      <RewardsProgramPanel />
    </MeSectionPage>
  );
}
