-- Applied to staging and production on 2026-10-18, after RLS and function cutover.
-- Only remove legacy moderator rows when an equivalent ACTIVE Team OS moderation membership exists.
-- Owner/global authority is untouched. Unmapped admin/gerente roles are intentionally not auto-deleted.

DELETE FROM public.user_roles ur
WHERE ur.role = 'moderator'
  AND EXISTS (
    SELECT 1
    FROM public.team_memberships m
    WHERE m.user_id = ur.user_id
      AND m.team_id = 'moderation'
      AND m.role IN ('moderator','senior_moderator','moderation_lead')
      AND m.status = 'ACTIVE'
  );
