import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Team OS como único sistema de colaboradores', () => {
  it('/admin/team monta solo la gestión de membresías Team OS', () => {
    const page = read('app/admin/team/page.tsx');
    expect(page).toContain('TeamManagementClient');
    expect(page).not.toContain('TeamRolesPanel');
    expect(existsSync(join(root, 'app/admin/team/TeamRolesPanel.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/admin/staff-roles/TeamRolesPanel.tsx'))).toBe(false);
  });

  it('/admin/staff-roles redirige a Team OS y no ofrece un panel duplicado', () => {
    const page = read('app/admin/staff-roles/page.tsx');
    expect(page).toContain("redirect('/admin/team')");
    expect(page).not.toContain('TeamRolesPanel');

    const navigation = read('lib/admin/navigation.ts');
    expect(navigation).not.toContain("href: '/admin/staff-roles'");
  });

  it('las APIs legacy de staff están retiradas con 410 Gone', () => {
    const staffRoute = read('app/api/admin/staff-roles/route.ts');
    expect(staffRoute).toContain('status: 410');
    expect(staffRoute).toContain('STAFF_ROLES_RETIRED');
    expect(staffRoute).not.toContain("from('user_roles')");
    expect(staffRoute).not.toContain(".insert({ user_id:");
    expect(staffRoute).not.toContain(".delete().eq('user_id'");

    const oldAlias = read('app/api/admin/team/route.ts');
    expect(oldAlias).toContain("from '../staff-roles/route'");
    expect(oldAlias).toContain('DELETE');
  });

  it('membresías Team OS siguen protegidas por autorización Owner-only', () => {
    const route = read('app/api/admin/owner/team-management/members/route.ts');
    expect(route).toContain('ownerId');
    expect(route).not.toContain('requireTeamManagement');
  });

  it('credenciales Team OS usan requireOwner, no user_roles', () => {
    const route = read('app/api/admin/team-os/users/[userId]/access/route.ts');
    expect(route).toContain('requireOwner');
    expect(route).not.toContain('user_roles');
  });

  it('la migración RLS usa permisos allowlisted y membresías ACTIVE', () => {
    const rls = read('docs/supabase-migrations/20261018_team_os_rls_policy_cutover.sql');
    expect(rls).toContain('public.team_os_has_permission');
    expect(rls).toContain("m.status='ACTIVE'");
    expect(rls).toContain('REVOKE ALL ON FUNCTION public.team_os_user_has_permission(text,uuid) FROM PUBLIC, anon, authenticated');
    expect(rls).toContain("'moderation.offers.decide'");
    expect(rls).toContain("'finance.overview.read'");
  });

  it('solo borra moderators legacy cuando hay una membresía ACTIVE equivalente', () => {
    const cleanup = read('docs/supabase-migrations/20261018_remove_mapped_legacy_moderators.sql');
    expect(cleanup).toContain("ur.role = 'moderator'");
    expect(cleanup).toContain("m.team_id = 'moderation'");
    expect(cleanup).toContain("m.status = 'ACTIVE'");
    expect(cleanup).not.toContain("DELETE FROM public.user_roles WHERE role <> 'owner'");
  });

  it('la mutación de payout continúa siendo owner-only', () => {
    const sql = read('docs/supabase-migrations/20261018_team_os_legacy_auth_functions_production.sql');
    expect(sql).toContain("ur.role='owner'");
    expect(sql).not.toContain("ur.role IN ('owner','admin')");
  });

  it('los RPCs antiguos de staff quedan revocados en staging', () => {
    const sql = read('docs/supabase-migrations/STAGING_20261018_team_os_legacy_role_rpc_shutdown.sql');
    expect(sql).toContain('legacy_staff_role_management_disabled');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.grant_role(uuid,text,text)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.revoke_role(uuid,text)');
  });
});
