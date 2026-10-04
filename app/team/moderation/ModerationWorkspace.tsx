'use client';

import { useState } from 'react';
import ModerationFocusWorkspace from '@/app/components/moderation/ModerationFocusWorkspace';
import type { FocusSourceTab } from '@/lib/moderation/focusTypes';

function sourceTabFromCola(cola: string | null): FocusSourceTab {
  if (cola === 'bot' || cola === 'users') return cola;
  return 'all';
}

/** La cola, el claim y los botones existentes. Team OS solo elige la entrada. */
export function ModerationWorkspace() {
  const [cola] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('cola'),
  );

  return (
    <section id="cola" className="mt-4">
      <ModerationFocusWorkspace
        mode="workspace"
        sourceTab={sourceTabFromCola(cola)}
        queueBasePath="/team/moderation"
      />
    </section>
  );
}
