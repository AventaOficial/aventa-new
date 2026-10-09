/**
 * Checklist de restauración. No restaura nada.
 * Sale con código 2 si no hay un punto recuperable.
 */
import { execSync } from 'node:child_process';

const PROJECTS = [
  { name: 'production', ref: 'mkgsrpsuvedwwlzmzmzh' },
  { name: 'staging', ref: 'oojshofrpbfwsiypcecr' },
];

function listBackups(ref) {
  const raw = execSync(`npx supabase backups list --project-ref ${ref} -o json`, {
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

const report = [];
for (const project of PROJECTS) {
  let listed = null;
  try {
    listed = listBackups(project.ref);
  } catch {
    report.push({
      project: project.name,
      ref: project.ref,
      list: 'unavailable',
      restorable: false,
      restoreTarget: 'new-project-only',
    });
    continue;
  }
  const count = Array.isArray(listed?.backups) ? listed.backups.length : 0;
  report.push({
    project: project.name,
    ref: project.ref,
    pitr: listed?.pitr_enabled === true,
    walg: listed?.walg_enabled === true,
    listedBackups: count,
    restorable: listed?.pitr_enabled === true || count > 0,
    restoreTarget: 'new-project-only',
  });
}

console.log(JSON.stringify({
  checklist: [
    'Confirmar que el destino no es mkgsrpsuvedwwlzmzmzh',
    'Restaurar solo en un proyecto nuevo',
    'Comparar tablas offers, profiles y user_roles',
    'Abrir /api/health y /api/feed/home en la app apuntando a ese proyecto',
  ],
  rpo: 'no medible: no hay punto de recuperación listado',
  rto: 'no medible: no se ejecutó un restore',
  projects: report,
}, null, 2));

if (report.some((row) => !row.restorable)) process.exitCode = 2;
