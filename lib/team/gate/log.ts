export function logTeamGate(code: string, userId: string | null): void {
  console.info(JSON.stringify({ scope: 'team_gate', code, userId }));
}
