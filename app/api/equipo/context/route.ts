import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { loadActiveMemberships } from '@/lib/team/gate/memberships';
import { withPlatformOwner } from '@/lib/team/authz/platformRole';
import { readAuthenticatedUserId } from '@/lib/team/gate/session';
import { isPlatformOwner } from '@/lib/server/platformOwner';
import {
  canAdvancedModerationFromMemberships,
  compatibilityStaffRole,
  listStaffDepartmentsFromMemberships,
  staffHomePathFromMemberships,
  staffNavLabel,
} from '@/lib/staff/membershipNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await readAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isOwner = await isPlatformOwner(userId);
  const loaded = await loadActiveMemberships(userId);
  if (!loaded.ok) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
  const memberships = await withPlatformOwner(userId, loaded.memberships);
  const active = memberships.filter((m) => m.status === 'ACTIVE');
  if (!isOwner && active.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  const departments = listStaffDepartmentsFromMemberships(memberships, isOwner);
  const role = compatibilityStaffRole(memberships, isOwner);

  return NextResponse.json({
    is_owner: isOwner,
    role,
    nav_label: staffNavLabel(memberships, isOwner),
    home_path: staffHomePathFromMemberships(memberships, isOwner),
    display_name: (profile as { display_name?: string | null } | null)?.display_name ?? null,
    can_advanced_moderation: canAdvancedModerationFromMemberships(memberships, isOwner),
    departments: departments.map((d) => ({
      id: d.id,
      label: d.label,
      subtitle: d.subtitle,
      href: d.href,
    })),
  });
}
