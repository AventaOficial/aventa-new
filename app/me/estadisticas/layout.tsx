import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tu actividad',
  description: 'Tu actividad y progreso en Aventa.',
};

export default function EstadisticasLayout({ children }: { children: React.ReactNode }) {
  return children;
}
