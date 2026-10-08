import { afterEach, describe, expect, it } from 'vitest';
import { declaredMachineHunterIds, ingestSystemUserIds, type ActorType } from '@/lib/actors/actorType';
import { auditActors } from '@/lib/owner/actorAudit';

const ENV_KEYS = ['BOT_INGEST_USER_ID', 'MCP_BOT_AUTHOR_USER_IDS'] as const;
const previousEnv = new Map<string, string | undefined>();

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (!previousEnv.has(key)) previousEnv.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function directory(classes: Record<string, ActorType>) {
  return {
    classify(userId: string | null | undefined): ActorType {
      return classes[userId?.trim() ?? ''] ?? 'HUMAN';
    },
  };
}

describe('actor audit', () => {
  afterEach(() => {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previousEnv.clear();
  });

  it('usa el resolver y no convierte un sistema en humano', () => {
    setEnv('BOT_INGEST_USER_ID', 'bot-1');
    const authors = auditActors({
      authorIds: ['human-1', 'bot-1'],
      directory: directory({ 'bot-1': 'SYSTEM' }),
      machineClientIds: new Set(),
      declaredMachineHunterIds: declaredMachineHunterIds(),
      configuredSystemIds: ingestSystemUserIds(),
    });
    expect(authors?.map((row) => row.actorClass)).toEqual(['SYSTEM', 'HUMAN']);
    expect(authors?.find((row) => row.authorId === 'bot-1')).toMatchObject({
      matchedConfiguredSystem: true,
      source: 'configured_system',
    });
    expect(authors?.find((row) => row.authorId === 'human-1')?.source).toBe('resolver');
  });

  it('marca machine_clients y el cazador declarado sin leer nombres', () => {
    setEnv('MCP_BOT_AUTHOR_USER_IDS', 'declared-1');
    const authors = auditActors({
      authorIds: ['mcp-1', 'declared-1'],
      directory: directory({ 'mcp-1': 'MACHINE_HUNTER', 'declared-1': 'MACHINE_HUNTER' }),
      machineClientIds: new Set(['mcp-1']),
      declaredMachineHunterIds: declaredMachineHunterIds(),
      configuredSystemIds: ingestSystemUserIds(),
    });
    expect(authors?.find((row) => row.authorId === 'mcp-1')?.source).toBe('machine_clients');
    expect(authors?.find((row) => row.authorId === 'declared-1')?.source).toBe('declared_machine_hunter');
  });

  it('si el directorio no coincide con el resolver, no hay diagnóstico', () => {
    setEnv('BOT_INGEST_USER_ID', 'bot-1');
    expect(auditActors({
      authorIds: ['bot-1'],
      directory: directory({ 'bot-1': 'HUMAN' }),
      machineClientIds: new Set(),
      declaredMachineHunterIds: declaredMachineHunterIds(),
      configuredSystemIds: ingestSystemUserIds(),
    })).toBeNull();
  });
});
