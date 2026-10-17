import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'docs/supabase-migrations/20261017_team_os_rls_legacy_role_cleanup.sql'),
  'utf8',
);

describe('Team OS RLS legacy role cleanup migration', () => {
  it('requires membership mapping before retiring legacy collaborator rows', () => {
    expect(migration).toContain('Team OS RLS cleanup blocked');
    expect(migration).toContain("tm.status IN ('ACTIVE', 'SUSPENDED')");
    expect(migration).toContain('DELETE FROM public.user_roles');
  });

  it('keeps global authority Owner-only and team permissions membership-based', () => {
    expect(migration).toContain("ur.role = 'owner'");
    expect(migration).toContain("public.has_active_team_role('moderation', ARRAY['moderator']::text[])");
    expect(migration).toContain("public.has_active_team_role('operations', NULL::text[])");
    expect(migration).not.toContain("ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])");
    expect(migration).toContain('Payout state changes remain globally Owner-only.');
  });

  it('does not delete ambiguous admin or manager legacy rows automatically', () => {
    expect(migration).not.toContain("('admin',");
    expect(migration).not.toContain("('gerente',");
  });
});
