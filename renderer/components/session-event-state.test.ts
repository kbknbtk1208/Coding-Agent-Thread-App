import { describe, expect, it } from 'vitest';
import type { AppSession, ConversationTurn } from '../../shared/domain/agent';
import { mergeAppSessionSnapshot } from './session-event-state';

function createTurn(
  intermediateSegments: ConversationTurn['intermediateSegments'],
  overrides: Partial<ConversationTurn> = {},
): ConversationTurn {
  return {
    turnId: 'turn-1',
    messageId: 'message-1',
    prompt: 'review this diff',
    response: '',
    intermediateSegments,
    responseMode: 'structured',
    structuredSchemaName: 'review-draft',
    structuredOutputMode: 'normal',
    status: 'running',
    startedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

function createSession(turn: ConversationTurn): AppSession {
  return {
    appSessionId: 'session-1',
    agent: 'codex',
    cwd: 'C:/workspace',
    status: 'running',
    capabilities: ['structuredOutput'],
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    turns: [turn],
    streamBuffer: {
      content: '',
      messageId: 'message-1',
    },
    pendingPermissions: [],
  };
}

describe('mergeAppSessionSnapshot', () => {
  it('preserves newer intermediate segments when a stale snapshot arrives later', () => {
    const existingSession = createSession(
      createTurn([
        {
          kind: 'progress',
          progressKind: 'tool',
          segmentId: 'turn-1:segment:1',
          text: 'ツールを呼び出しています',
          updatedAt: '2026-04-03T00:00:01.000Z',
        },
        {
          kind: 'message',
          segmentId: 'turn-1:segment:2',
          text: '解析しています',
          updatedAt: '2026-04-03T00:00:02.000Z',
        },
      ]),
    );
    const staleSnapshot = createSession(
      createTurn([
        {
          kind: 'progress',
          progressKind: 'tool',
          segmentId: 'turn-1:segment:1',
          text: 'ツールを呼び出しています',
          updatedAt: '2026-04-03T00:00:01.000Z',
        },
      ]),
    );

    const merged = mergeAppSessionSnapshot(existingSession, staleSnapshot);

    expect(merged.turns[0]?.intermediateSegments).toEqual(
      existingSession.turns[0]?.intermediateSegments,
    );
  });

  it('keeps the richer event-driven segment when timestamps tie', () => {
    const existingSession = createSession(
      createTurn([
        {
          kind: 'message',
          segmentId: 'turn-1:segment:1',
          text: '解析しています',
          updatedAt: '2026-04-03T00:00:01.000Z',
        },
      ]),
    );
    const staleSnapshot = createSession(
      createTurn([
        {
          kind: 'progress',
          progressKind: 'tool',
          segmentId: 'turn-1:segment:1',
          text: '解析',
          updatedAt: '2026-04-03T00:00:01.000Z',
        },
      ]),
    );

    const merged = mergeAppSessionSnapshot(existingSession, staleSnapshot);

    expect(merged.turns[0]?.intermediateSegments).toEqual(
      existingSession.turns[0]?.intermediateSegments,
    );
  });
});
