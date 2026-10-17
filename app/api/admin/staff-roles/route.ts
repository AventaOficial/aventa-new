import { NextResponse } from 'next/server';

const STAFF_ROLES_RETIRED = {
  error: 'La gestión de colaboradores se realiza exclusivamente en Team OS.',
  code: 'STAFF_ROLES_RETIRED',
  team_os_path: '/admin/team',
};

function retiredRoute() {
  return NextResponse.json(STAFF_ROLES_RETIRED, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Legacy endpoint disabled permanently.
 * Team OS membership APIs are the only supported collaborator-management path.
 * user_roles is reserved for global Owner authority only.
 */
export function GET() {
  return retiredRoute();
}

export function POST() {
  return retiredRoute();
}

export function PATCH() {
  return retiredRoute();
}

export function DELETE() {
  return retiredRoute();
}
