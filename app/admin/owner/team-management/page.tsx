import { redirect } from 'next/navigation';

/** Unificado en /admin/team?tab=membresias */
export default function OwnerTeamManagementRedirect() {
  redirect('/admin/team?tab=membresias');
}
