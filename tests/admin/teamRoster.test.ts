import { describe, expect, it } from 'vitest';
import { TEAM_LABELS } from '@/lib/team/roles/teams';
import { teamRoleLabel } from '@/lib/team/roles/catalog';

describe('admin team roster labels', () => {
  it('expone etiquetas legibles para membresías', () => {
    expect(TEAM_LABELS.moderation).toBe('Moderación');
    expect(teamRoleLabel('moderation', 'moderator')).toBe('Moderador');
  });
});
