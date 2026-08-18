import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireTeamBoard } from '@/lib/server/requireAdmin';
import { buildTeamBoardPayload } from '@/lib/admin/buildTeamBoard';
import {
  TEAM_WORK_BOARD_KEY,
  parseTeamWorkBoard,
  serializeTeamWorkBoard,
  seedDefaultTasks,
  newTaskId,
  type TeamWorkTask,
} from '@/lib/admin/teamBoard';

export async function GET(request: Request) {
  const auth = await requireTeamBoard(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const payload = await buildTeamBoardPayload(auth.role);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[admin/team-board] get', e);
    return NextResponse.json({ error: 'No se pudo cargar el tablero' }, { status: 500 });
  }
}

type PatchBody = {
  action?: string;
  text?: unknown;
  id?: unknown;
  done?: unknown;
};

export async function PATCH(request: Request) {
  const auth = await requireTeamBoard(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (action !== 'add' && action !== 'toggle' && action !== 'remove') {
    return NextResponse.json({ error: 'action inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: row, error: readErr } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', TEAM_WORK_BOARD_KEY)
    .maybeSingle();

  if (readErr) {
    console.error('[admin/team-board] read', readErr.message);
    return NextResponse.json({ error: 'No se pudo leer el tablero' }, { status: 500 });
  }

  let board = parseTeamWorkBoard(row?.value);
  if (board.tasks.length === 0) {
    board = { ...board, tasks: seedDefaultTasks() };
  }

  const nowIso = new Date().toISOString();

  if (action === 'add') {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 280) : '';
    if (text.length < 3) {
      return NextResponse.json({ error: 'Escribe una tarea de al menos 3 caracteres' }, { status: 400 });
    }
    if (board.tasks.length >= 40) {
      return NextResponse.json({ error: 'Máximo 40 tareas' }, { status: 400 });
    }
    const task: TeamWorkTask = { id: newTaskId(), text, done: false, createdAt: nowIso };
    board.tasks = [task, ...board.tasks];
  } else {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
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
    .upsert({ key: TEAM_WORK_BOARD_KEY, value: serializeTeamWorkBoard(board) }, { onConflict: 'key' });

  if (writeErr) {
    console.error('[admin/team-board] write', writeErr.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, board });
}
