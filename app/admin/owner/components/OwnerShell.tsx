'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OwnerSidebar from './OwnerSidebar';
import OwnerHeader from './OwnerHeader';
import LoadingState from '@/app/components/panel/LoadingState';
import { cn } from '@/app/components/panel/utils';

/** El CEO Dashboard (/admin/owner) y sus vistas usan el lienzo completo; la navegación se abre desde el header. */
const CEO_DASHBOARD_PATH = '/admin/owner';
const CEO_DASHBOARD_BG = { backgroundColor: '#0b0b14', backgroundImage: 'radial-gradient(ellipse 70% 40% at 15% -10%, rgba(124,58,237,0.10), transparent)' };

export default function OwnerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCeoDashboard = pathname === CEO_DASHBOARD_PATH;
  const isCeoVista = pathname.startsWith('/admin/owner/vista');
  const isCeoCanvas = isCeoDashboard || isCeoVista;
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('aventa-owner-sidebar-collapsed') === 'true',
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('aventa-owner-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setReady(true);
        return;
      }
      supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const row = data as { display_name?: string | null; avatar_url?: string | null } | null;
          setDisplayName(row?.display_name ?? null);
          setAvatarUrl(row?.avatar_url ?? null);
          setReady(true);
        });
    });
  }, []);

  if (!ready) {
    return (
      <div className="aventa-panel-route owner-os-bg min-h-screen" style={isCeoCanvas ? CEO_DASHBOARD_BG : undefined}>
        <LoadingState message="Iniciando Founder OS…" />
      </div>
    );
  }

  return (
    <div className="aventa-panel-route owner-os-bg min-h-screen flex text-white" style={isCeoCanvas ? CEO_DASHBOARD_BG : undefined}>
      {/* Desktop sidebar */}
      {isCeoCanvas ? null : (
        <div className="hidden lg:flex shrink-0">
          <OwnerSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
        </div>
      )}

      {/* Sidebar overlay (móvil; en el CEO Dashboard también en desktop) */}
      {mobileNavOpen ? (
        <>
          <div
            className={cn('fixed inset-0 z-40 bg-black/60', !isCeoCanvas && 'lg:hidden')}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className={cn('fixed inset-y-0 left-0 z-50', !isCeoCanvas && 'lg:hidden')}>
            <OwnerSidebar collapsed={false} onNavigate={() => setMobileNavOpen(false)} onToggleCollapse={() => {}} showCollapse={false} />
          </div>
        </>
      ) : null}

      <div className="flex flex-1 flex-col min-w-0 min-h-screen">
        <OwnerHeader
          displayName={displayName}
          avatarUrl={avatarUrl}
          onMenuClick={() => setMobileNavOpen((v) => !v)}
          menuOpen={mobileNavOpen}
          onPanelClick={isCeoCanvas ? () => setMobileNavOpen((v) => !v) : () => setSidebarCollapsed((v) => !v)}
          panelLabel={isCeoCanvas ? 'Abrir navegación de Founder OS' : sidebarCollapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        />
        <main className="flex-1 overflow-y-auto">
          <div className={cn('mx-auto w-full', isCeoVista ? 'max-w-none' : 'px-4 py-6', isCeoDashboard ? 'max-w-[1600px] lg:px-5 lg:py-3' : isCeoVista ? '' : 'max-w-[1440px] lg:px-8 lg:py-8')}>{children}</div>
        </main>
      </div>
    </div>
  );
}
