'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import ModerationFocusWorkspace from '@/app/components/moderation/ModerationFocusWorkspace';

type Hunter = { id: string; name: string };

export default function AdminModerationHunterPage() {
  const { session } = useAuth();
  const [hunters, setHunters] = useState<Hunter[]>([]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    fetch('/api/admin/moderation/machine-hunters', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : { hunters: [] }))
      .then((body: { hunters?: Hunter[] }) => setHunters(body.hunters ?? []))
      .catch(() => setHunters([]));
  }, [session?.access_token]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2 text-xs">
        <p className="text-white/50">Cola pendiente de máquina. La decisión sigue siendo humana.</p>
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {hunters.map((hunter) => (
            <span key={hunter.id} className="rounded-full border border-white/15 px-2 py-1">
              {hunter.name}
            </span>
          ))}
          {hunters.length === 0 ? <span className="px-2 py-1 text-white/50">Sin hunters de máquina activos</span> : null}
        </div>
      </div>
      <ModerationFocusWorkspace mode="admin" sourceTab="bot" queueBasePath="/admin/moderation/hunter" />
    </div>
  );
}
