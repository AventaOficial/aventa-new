/**
 * Diagnóstico de actor para el comando de owner.
 * La clase sale de resolveActorTypeFromSignals. Si no coincide con el directorio, no hay dato.
 * No incluye valores de entorno, secretos ni cookies.
 */
import { resolveActorTypeFromSignals, type ActorType } from '@/lib/actors/actorType';
import { classifySupplyAuthor, type SupplyDirectory } from '@/lib/owner/supplyIntelligence';

export type ActorAuditSource =
  | 'unattributed'
  | 'declared_machine_hunter'
  | 'machine_clients'
  | 'configured_system'
  | 'resolver';

export type ActorAuditEntry = {
  authorId: string;
  actorClass: ActorType | 'UNATTRIBUTED';
  matchedMachineClient: boolean;
  matchedConfiguredSystem: boolean;
  matchedDeclaredMachineHunter: boolean;
  source: ActorAuditSource;
};

export function auditActors(input: {
  authorIds: string[];
  directory: SupplyDirectory;
  machineClientIds: ReadonlySet<string>;
  declaredMachineHunterIds: readonly string[];
  configuredSystemIds: readonly string[];
}): ActorAuditEntry[] | null {
  if (!input.directory) return null;
  const declared = new Set(input.declaredMachineHunterIds);
  const systems = new Set(input.configuredSystemIds);
  const authors: ActorAuditEntry[] = [];
  for (const rawId of [...new Set(input.authorIds)].sort()) {
    const authorId = rawId.trim();
    if (!authorId) continue;
    const actorClass = classifySupplyAuthor(authorId, input.directory);
    if (actorClass === 'UNAVAILABLE' || actorClass === 'UNATTRIBUTED') return null;
    const matchedMachineClient = input.machineClientIds.has(authorId);
    const resolved = resolveActorTypeFromSignals(authorId, matchedMachineClient);
    if (resolved !== actorClass) return null;
    const matchedDeclaredMachineHunter = declared.has(authorId);
    const matchedConfiguredSystem = systems.has(authorId);
    const source: ActorAuditSource = matchedDeclaredMachineHunter
      ? 'declared_machine_hunter'
      : matchedMachineClient
        ? 'machine_clients'
        : matchedConfiguredSystem
          ? 'configured_system'
          : 'resolver';
    authors.push({
      authorId,
      actorClass,
      matchedMachineClient,
      matchedConfiguredSystem,
      matchedDeclaredMachineHunter,
      source,
    });
  }
  return authors;
}
