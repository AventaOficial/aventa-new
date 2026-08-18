import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { staffTasksConfigKey } from '@/lib/staff/departments';
import {
  parseStaffWorkBoard,
  seedDefaultTasks,
  serializeStaffWorkBoard,
  newTaskId,
  type StaffWorkTask,
} from '@/lib/staff/workBoard';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';

const DEPTS: StaffDepartmentId[] = [
  'home',
  'moderacion',
  'marketing',
  'contabilidad',
  'operaciones',
  'gerencia',
];

export async function PATCH(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const rawDept = typeof body?.department === 'string' ? body.department : 'home';
  const department = DEPTS.includes(rawDept as StaffDepartmentId) ? (rawDept as StaffDepartmentId) : 'home';

  if (!canAccessStaffDepartment(auth.role, department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (action !== 'add' && action !== 'toggle' && action !== 'remove') {
    return NextResponse.json({ error: 'action inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const key = staffTasksConfigKey(department);
  const { data: row, error: readErr } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: 'No se pudo leer tareas' }, { status: 500 });
  }

  let board = parseStaffWorkBoard(row?.value, department);
  if (board.tasks.length === 0) {
    board = { ...board, tasks: seedDefaultTasks(department) };
  }

  const nowIso = new Date().toISOString();

  if (action === 'add') {
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 280) : '';
    if (text.length < 3) {
      return NextResponse.json({ error: 'Texto muy corto' }, { status: 400 });
    }
    const task: StaffWorkTask = { id: newTaskId(), text, done: false, createdAt: nowIso };
    board.tasks = [task, ...board.tasks];
  } else {
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    if (action === 'toggle') {
      board.tasks = board.tasks.map((t) => (t.id === id ? { ...t, done: body.done === true } : t));
    } else {
      board.tasks = board.tasks.filter((t) => t.id !== id);
    }
  }

  board.updatedAt = nowIso;
  board.updatedBy = auth.user.id;

  const { error: writeErr } = await supabase
    .from('app_config')
    .upsert({ key, value: serializeStaffWorkBoard(board) }, { onConflict: 'key' });

  if (writeErr) {
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, board });
}
