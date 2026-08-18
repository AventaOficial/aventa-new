import type { Metadata } from 'next';
import StaffShell from './components/StaffShell';

export const metadata: Metadata = {
  title: 'Equipo AVENTA',
  robots: { index: false, follow: false },
};

export default function EquipoLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
