import { redirect } from 'next/navigation';

/**
 * Legacy route retained only as a compatibility redirect.
 * Collaborators are managed exclusively through Team OS.
 * Global admin authority remains Owner-only.
 */
export default function AdminStaffRolesPage() {
  redirect('/admin/team');
}
