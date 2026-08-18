'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { StaffWorkBoard } from '@/lib/staff/workBoard';

export default function MarketingTasksStrip({
  board,
  taskPct,
  onTasksChange,
}: {
  board: StaffWorkBoard;
  taskPct: number;
  onTasksChange: () => void;
}) {
  const { session } = useAuth();
  const [newTask, setNewTask] = useState('');
  const [saving, setSaving] = useState(false);

  const patch = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      await fetch('/api/staff/tasks', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ department: 'marketing', ...payload }),
      });
      onTasksChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-500/15 bg-emerald-50/40 dark:bg-emerald-950/15 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Today&apos;s checklist</h2>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">{taskPct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-emerald-200/60 dark:bg-emerald-900/40 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${taskPct}%` }}
        />
      </div>
      <ul className="space-y-2">
        {board.tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void patch({ action: 'toggle', id: t.id, done: !t.done })}
              className="flex items-start gap-2 w-full text-left text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {t.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
              )}
              <span className={t.done ? 'line-through opacity-60' : ''}>{t.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTask.trim().length >= 3) {
              void patch({ action: 'add', text: newTask.trim() }).then(() => setNewTask(''));
            }
          }}
          placeholder="Añadir tarea…"
          className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-xs"
        />
        <button
          type="button"
          disabled={saving || newTask.trim().length < 3}
          onClick={() => void patch({ action: 'add', text: newTask.trim() }).then(() => setNewTask(''))}
          className="rounded-xl bg-emerald-600 text-white p-2 disabled:opacity-50"
          aria-label="Añadir"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
