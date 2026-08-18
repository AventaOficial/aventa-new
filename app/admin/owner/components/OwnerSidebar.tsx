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

      <nav className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-hide">
        {OWNER_NAV_SECTIONS.map((section) => (
          <div key={section.id}>
            {!collapsed ? (
              <p className="px-2 mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
                {section.title}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <li key={`${section.id}-${item.href}-${item.label}`}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all duration-200',
                        collapsed && 'justify-center',
                        active
                          ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                          : 'text-white/45 hover:bg-white/[0.05] hover:text-white/70 border border-transparent'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
