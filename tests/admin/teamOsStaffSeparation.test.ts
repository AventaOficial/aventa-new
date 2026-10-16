import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Team OS vs staff del panel', () => {
  it('/admin/team no monta el panel de user_roles', () => {
    const page = read('app/admin/team/page.tsx');
    expect(page).toContain('TeamManagementClient');
    expect(page).not.toContain('TeamRolesPanel');
  });

  it('/admin/staff-roles usa la API staff-roles', () => {
    const page = read('app/admin/staff-roles/page.tsx');
    expect(page).toContain('TeamRolesPanel');
    const panel = read('app/admin/team/TeamRolesPanel.tsx');
    expect(panel).toContain('/api/admin/staff-roles');
    expect(panel).not.toContain("fetch('/api/admin/team'");
  });

  it('membresías Team OS siguen protegidas por requireOwner en la API', () => {
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
