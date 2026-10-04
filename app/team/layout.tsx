import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Team OS',
  robots: { index: false, follow: false },
};

export default function TeamLayout({ children }: { children: ReactNode }) {
  return children;
}
