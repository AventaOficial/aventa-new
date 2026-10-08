'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { OWNER_NAV_SECTIONS, ownerNavSectionForPath, type OwnerNavItem } from '@/lib/owner/navigation';
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

  useEffect(() => {
    setOpenId(ownerNavSectionForPath(pathname));
  }, [pathname]);

  const isActive = (item: OwnerNavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const navLink = (item: OwnerNavItem) => {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors',
          collapsed && 'justify-center',
          active
            ? 'bg-violet-500/15 text-violet-200 border border-violet-500/25'
            : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80 border border-transparent',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full max-w-full flex-col border-r border-white/[0.06] bg-black/25 backdrop-blur-2xl',
        collapsed ? 'w-[68px]' : 'w-60',
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

      <nav aria-label="CEO OS" className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
        {OWNER_NAV_SECTIONS.map((section) => {
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
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{section.title}</span>
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/30 transition-transform', open && 'rotate-180')} />
                </button>
              )}
              {open ? (
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={`${section.id}-${item.href}`}>{navLink(item)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
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
