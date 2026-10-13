'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  OWNER_NAV_SECTIONS,
  isOwnerNavItemActive,
  ownerNavLocation,
  ownerNavSectionForPath,
  type OwnerNavItem,
  type OwnerNavSection,
} from '@/lib/owner/navigation';
import { cn } from '@/app/components/panel/utils';

export default function OwnerSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapse = true,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  showCollapse?: boolean;
}) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState(() => ownerNavSectionForPath(pathname));
  const activeHref = ownerNavLocation(pathname)?.item.href ?? null;

  useEffect(() => {
    setOpenId(ownerNavSectionForPath(pathname));
  }, [pathname]);

  const navLink = (item: OwnerNavItem) => {
    const Icon = item.icon;
    const active = activeHref ? item.href === activeHref : isOwnerNavItemActive(item, pathname);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors',
          collapsed && 'justify-center',
          active ? 'bg-violet-600/25 text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-violet-300' : 'text-white/40')} />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    );
  };

  const list = (section: OwnerNavSection) => (
    <ul className="flex flex-col gap-0.5">
      {section.items.map((item) => (
        <li key={`${section.id}-${item.href}`}>{navLink(item)}</li>
      ))}
    </ul>
  );

  const label = (text: string) => (
    <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{text}</p>
  );

  const ver = OWNER_NAV_SECTIONS.filter((s) => s.audience === 'VER');
  const hacer = OWNER_NAV_SECTIONS.filter((s) => s.audience === 'HACER');
  const tecnico = OWNER_NAV_SECTIONS.filter((s) => s.audience === 'TECNICO');

  const accordion = (section: OwnerNavSection) => {
    const open = collapsed || openId === section.id;
    return (
      <div key={section.id} data-owner-nav-section={section.id} data-open={open ? 'true' : 'false'}>
        {collapsed ? null : (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpenId((current) => (current === section.id ? '' : section.id))}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
          >
            <span className="text-[11px] font-semibold text-white/60">{section.title.charAt(0) + section.title.slice(1).toLowerCase()}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/30 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        {open ? list(section) : null}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full max-w-full flex-col border-r border-white/[0.06] bg-[#0c0c16]',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-white/[0.06]', collapsed ? 'justify-center px-2' : 'px-4')}>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">AVENTA</p>
            <p className="text-xs font-medium text-white/50">CEO OS</p>
          </div>
        ) : (
          <span className="text-lg font-bold text-violet-300">A</span>
        )}
      </div>

      <nav aria-label="CEO OS" className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {ver.map((section) => (
          <div key={section.id} data-owner-nav-section={section.id} data-open="true">
            {collapsed ? null : label('CEO Dashboard')}
            {list(section)}
          </div>
        ))}

        <div className="space-y-1">
          {collapsed ? null : label('Hacer')}
          {hacer.map(accordion)}
        </div>

        <div className="space-y-1 border-t border-white/[0.06] pt-3">{tecnico.map(accordion)}</div>
      </nav>

      <div className="border-t border-white/[0.06] p-2">
        {showCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-white/35 hover:bg-white/[0.04] hover:text-white/60"
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed ? <span className="text-[10px]">Colapsar</span> : null}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
