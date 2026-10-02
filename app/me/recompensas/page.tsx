'use client';

import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import MyRewardsHistory from '@/app/me/MyRewardsHistory';

export default function RecompensasPage() {
  return (
    <MeSectionPage title="Recompensas" lede="Cada estado sale del historial. Entregada solo aparece cuando el registro ya está certificado.">
      <MyRewardsHistory />
    </MeSectionPage>
  );
}
