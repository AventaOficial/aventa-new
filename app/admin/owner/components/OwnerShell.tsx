'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import OwnerSidebar from './OwnerSidebar';
import OwnerHeader from './OwnerHeader';
import LoadingState from '@/app/components/panel/LoadingState';

export default function OwnerShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('aventa-owner-sidebar-collapsed');
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

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
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          setDisplayName((data as { display_name?: string } | null)?.display_name ?? null);
          setReady(true);
        });
    });
  }, []);

  if (!ready) {
    return (
      <div className="aventa-panel-route owner-os-bg min-h-screen">
        <LoadingState message="Iniciando Founder OS…" />
      </div>
    );
  }

  return (
    <div className="aventa-panel-route owner-os-bg min-h-screen flex text-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <OwnerSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileNavOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <OwnerSidebar collapsed={false} onNavigate={() => setMobileNavOpen(false)} onToggleCollapse={() => {}} showCollapse={false} />
          </div>
        </>
      ) : null}

      <div className="flex flex-1 flex-col min-w-0 min-h-screen">
        <OwnerHeader
          displayName={displayName}
          onMenuClick={() => setMobileNavOpen((v) => !v)}
          menuOpen={mobileNavOpen}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
