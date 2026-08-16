import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Estadísticas',
  description: 'Tu nivel, puntos y cómo mejorar en AVENTA.',
};

export default function EstadisticasLayout({ children }: { children: React.ReactNode }) {
  return children;
}
