'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { OWNER_NAV_SECTIONS, type OwnerNavItem } from '@/lib/owner/navigation';
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

  const isActive = (item: OwnerNavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const navLink = (item: OwnerNavItem, secondary = false) => {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2.5 font-medium transition-all duration-200',
          secondary ? 'py-1.5 text-[11px]' : 'py-2 text-xs',
          collapsed && 'justify-center',
          active
            ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
            : 'text-white/45 hover:bg-white/[0.05] hover:text-white/70 border border-transparent'
        )}
      >
        <Icon className={cn('shrink-0', secondary ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-white/[0.06] bg-black/20 backdrop-blur-2xl transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-56'
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-white/[0.06]', collapsed ? 'justify-center px-2' : 'px-4')}>
        {!collapsed ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400/80">AVENTA</p>
            <p className="text-xs font-medium text-white/50">Founder OS</p>
          </div>
        ) : (
          <span className="text-lg font-bold text-violet-400">A</span>
        )}
      </div>

      <nav aria-label="Founder OS" className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-hide">
        {OWNER_NAV_SECTIONS.map((section) => {
          const more = section.more ?? [];
          const moreActive = more.some(isActive);
          return (
            <div key={section.id} data-owner-nav-section={section.id}>
              {!collapsed ? (
                <div className="mb-1 px-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{section.title}</p>
                  <p className="text-[10px] leading-snug text-white/30">{section.question}</p>
                </div>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={`${section.id}-${item.href}`}>{navLink(item)}</li>
                ))}
              </ul>
              {!collapsed && more.length > 0 ? (
                <details className="group mt-0.5" open={moreActive || undefined}>
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white/30 hover:text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden />
                    Más herramientas ({more.length})
                  </summary>
                  <ul className="mt-0.5 space-y-0.5 pl-2">
                    {more.map((item) => (
                      <li key={`${section.id}-more-${item.href}`}>{navLink(item, true)}</li>
                    ))}
                  </ul>
                </details>
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
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-white/30 hover:bg-white/[0.04] hover:text-white/50 transition-colors"
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
