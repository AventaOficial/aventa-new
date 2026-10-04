'use client';

import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import TeamBoard, { viewFor } from '../board';

export default function EquipoVistaPage() {
  const params = useParams<{ team: string }>();
  const data = viewFor(params.team);
  if (!data) notFound();
  return <TeamBoard data={data} />;
}
