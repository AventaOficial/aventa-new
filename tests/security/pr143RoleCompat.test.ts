import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, 'docs/supabase-migrations', name), 'utf8');

describe('PR #143 role compatibility', () => {
  it('admin_mark_payout_status autoriza por user_roles owner/admin', () => {
    const sql = read('20261015_admin_payout_staff_auth.sql');
    expect(sql).toMatch(/FROM public\.user_roles ur/);
    expect(sql).toMatch(/'owner', 'admin'/);
    expect(sql).not.toMatch(/FROM public\.profiles/);
  });

  it('sincroniza staff profiles.role → user_roles sin duplicar', () => {
    const sql = read('20261016_staff_roles_profile_sync.sql');
    expect(sql).toMatch(/INSERT INTO public\.user_roles/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/column_name = 'role'/);
  });

  it('endurece vistas sensibles y RPC admin', () => {
    const sql = read('20261015_security_definer_access_hardening.sql');
    expect(sql).toMatch(/security_invoker = true/);
    expect(sql).toMatch(/daily_system_metrics/);
    expect(sql).toMatch(/REVOKE EXECUTE/);
  });
});
