import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plaza',
  description: 'Solicitudes de ofertas, conversaciones y avisos de la comunidad AVENTA.',
};

export default function PlazaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
