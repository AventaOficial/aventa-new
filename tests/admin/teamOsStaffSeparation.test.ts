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
});
