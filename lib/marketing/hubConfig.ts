import type { ComponentType } from 'react';
import { Clapperboard, Lightbulb, LineChart, Pencil, Send } from 'lucide-react';

export type MarketingTabId = 'ideas' | 'to_film' | 'editing' | 'published' | 'performance';

export type MarketingTabDef = {
  id: MarketingTabId;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export const MARKETING_TABS: MarketingTabDef[] = [
  { id: 'ideas', href: '/equipo/marketing', label: 'Ideas', icon: Lightbulb, exact: true },
  { id: 'to_film', href: '/equipo/marketing/grabar', label: 'Para grabar', icon: Clapperboard },
  { id: 'editing', href: '/equipo/marketing/edicion', label: 'En edición', icon: Pencil },
  { id: 'published', href: '/equipo/marketing/publicado', label: 'Publicado', icon: Send },
  { id: 'performance', href: '/equipo/marketing/rendimiento', label: 'Rendimiento', icon: LineChart },
];

export function resolveMarketingTab(pathname: string): MarketingTabId {
  if (pathname.startsWith('/equipo/marketing/grabar')) return 'to_film';
  if (pathname.startsWith('/equipo/marketing/edicion')) return 'editing';
  if (pathname.startsWith('/equipo/marketing/publicado')) return 'published';
  if (pathname.startsWith('/equipo/marketing/rendimiento')) return 'performance';
  return 'ideas';
}

export function tabToPipelineFilter(tab: MarketingTabId): MarketingTabId | 'all' | 'performance' {
  if (tab === 'ideas') return 'ideas';
  return tab;
}
