import type { AgentSessionSnapshot, StartSessionInput } from '../../shared/contracts/agent-ipc';
import type { ReviewSnapshot } from '../../shared/domain/review';
import { describe, expect, it, vi } from 'vitest';
import { ReviewDraftStore } from './review-draft-store';
import { ReviewRunCoordinator } from './review-run-coordinator';

function createSnapshot(): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: '42',
    title: 'Title',
    description: 'Description',
    baseSha: 'base',
    headSha: 'head',
    files: [
      {
        fileId: 'file-1',
        filePath: 'src/file.ts',
        oldFilePath: null,
        changeType: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1 @@\n+const value = 1;',
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'loaded',
        oldContent: 'const value = 0;\n',
        newContent: 'const value = 1;\n',
        language: 'ts',
        providerContext: {
          remotePath: 'src/file.ts',
        },
      },
    ],
    discussions: [],
    providerContext: {
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/acme/repo/pull/42',
      anchorRefs: {},
    },
  };
}

function createStartedSession(appSessionId: string): AgentSessionSnapshot {
  return {
    appSessionId,
    agent: 'codex',
    cwd: 'C:/workspace',
    status: 'starting',
    capabilities: ['structuredOutput'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    turns: [
      {
        turnId: 'turn-1',
        messageId: 'message-1',
        prompt: 'review this diff',
        response: '',
        intermediateSegments: [],
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        structuredOutputMode: 'normal',
        status: 'starting',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    streamBuffer: {
      content: '',
      messageId: 'message-1',
    },
    finalResult: undefined,
    lastError: undefined,
    pendingPermissions: [],
  };
}

function createSettledSnapshot(
  appSessionId: string,
  finalResult: AgentSessionSnapshot['finalResult'],
): AgentSessionSnapshot {
  return {
    ...createStartedSession(appSessionId),
    finalResult,
    status: 'completed',
    updatedAt: '2026-01-01T00:00:10.000Z',
    turns: [
      {
        ...createStartedSession(appSessionId).turns[0]!,
        completedAt: '2026-01-01T00:00:10.000Z',
        status: 'completed',
      },
    ],
    streamBuffer: {
      content: '',
      messageId: null,
    },
  };
}

describe('ReviewRunCoordinator', () => {
  it('returns run metadata immediately and defers awaiting settlement', async () => {
    const startSession = vi.fn(async (_input: StartSessionInput) =>
      createStartedSession('app-session-1'),
    );
    const awaitSettled = vi.fn(async (_appSessionId: string) =>
      createSettledSnapshot('app-session-1', undefined),
    );
    const store = new ReviewDraftStore();
    const coordinator = new ReviewRunCoordinator({
      agentGateway: { startSession, awaitSettled },
      draftStore: store,
      now: () => '2026-01-01T00:00:00.000Z',
      cwdResolver: () => 'C:/workspace',
    });

    const begun = await coordinator.beginDraftReview({
      snapshot: createSnapshot(),
      reviewAgent: 'codex',
      instructions: 'テスト観点でレビュー',
    });

    expect(begun.run.rootAppSessionId).toBe('app-session-1');
    expect(begun.session.appSessionId).toBe('app-session-1');
    expect(begun.run.status).toBe('drafting_review');
    expect(awaitSettled).not.toHaveBeenCalled();
    expect(store.getRuns('snapshot-1')).toHaveLength(1);
  });

  it('stores structured review runs with rootAppSessionId after awaiting result', async () => {
    const startSession = vi.fn(async (_input: StartSessionInput) =>
      createStartedSession('app-session-1'),
    );
    const awaitSettled = vi.fn(async (_appSessionId: string) =>
      createSettledSnapshot('app-session-1', {
        kind: 'structured',
        schemaName: 'review-draft',
        source: 'codexOutputSchema',
        fallbackRichText: '{"type":"review-draft"}',
        data: {
          type: 'review-draft',
          summary: {
            headline: 'headline',
            overview: 'overview',
            positives: [],
            risks: [],
          },
          findings: [
            {
              findingId: 'f1',
              title: 'title',
              body: 'body',
              severity: 'medium',
              category: 'tests',
              confidence: 'high',
              location: {
                kind: 'diff',
                filePath: 'src/file.ts',
                startLine: 1,
                endLine: 1,
                side: 'new',
              },
            },
          ],
        },
      }),
    );
    const store = new ReviewDraftStore();
    const coordinator = new ReviewRunCoordinator({
      agentGateway: { startSession, awaitSettled },
      draftStore: store,
      now: () => '2026-01-01T00:00:00.000Z',
      cwdResolver: () => 'C:/workspace',
    });

    const snapshot = createSnapshot();
    const begun = await coordinator.beginDraftReview({
      snapshot,
      reviewAgent: 'codex',
      instructions: 'テスト観点でレビュー',
    });
    const envelope = await coordinator.awaitDraftReviewResult({
      snapshot,
      run: begun.run,
    });

    expect(envelope.kind).toBe('structured');
    expect(store.getRuns('snapshot-1')).toHaveLength(1);
    expect(store.getRuns('snapshot-1')[0]).toEqual(
      expect.objectContaining({
        rootAppSessionId: 'app-session-1',
        status: 'completed',
      }),
    );
    expect(store.getLatestEnvelope('snapshot-1')?.kind).toBe('structured');
    if (envelope.kind !== 'structured') {
      return;
    }
    expect(envelope.threads[0]?.title).toBe('title');
    expect(store.getLocalThreads('snapshot-1')[0]?.messages).toEqual([
      expect.objectContaining({
        source: 'initial-finding',
        role: 'assistant',
        body: 'body',
      }),
    ]);
  });

  it('stores fallback rich text envelopes when structured parsing fails', async () => {
    const coordinator = new ReviewRunCoordinator({
      agentGateway: {
        startSession: vi.fn(async () => createStartedSession('app-session-2')),
        awaitSettled: vi.fn(async () =>
          createSettledSnapshot('app-session-2', {
            kind: 'richText',
            format: 'markdown',
            content: '# fallback',
            source: 'structuredParseFallback',
            structuredParseFailureReason: 'schemaValidationFailed',
            structuredSchemaName: 'review-draft',
          }),
        ),
      },
      draftStore: new ReviewDraftStore(),
      now: () => '2026-01-01T00:00:00.000Z',
      cwdResolver: () => 'C:/workspace',
    });

    const snapshot = createSnapshot();
    const begun = await coordinator.beginDraftReview({
      snapshot,
      reviewAgent: 'copilot',
      instructions: '設計レビュー',
    });
    const envelope = await coordinator.awaitDraftReviewResult({
      snapshot,
      run: begun.run,
    });

    expect(envelope).toEqual(
      expect.objectContaining({
        kind: 'fallback-richText',
        reason: 'schemaValidationFailed',
      }),
    );
  });

  it('surfaces the settled session error when no final result is returned', async () => {
    const coordinator = new ReviewRunCoordinator({
      agentGateway: {
        startSession: vi.fn(async () => createStartedSession('app-session-3')),
        awaitSettled: vi.fn(
          async (_appSessionId: string): Promise<AgentSessionSnapshot> => ({
            ...createSettledSnapshot('app-session-3', undefined),
            lastError: {
              code: 'CODEX_TURN_FAILED',
              message: 'Codex turn failed: invalid_json_schema (location.oneOf is not permitted).',
              retryable: false,
            },
            status: 'failed',
          }),
        ),
      },
      draftStore: new ReviewDraftStore(),
      now: () => '2026-01-01T00:00:00.000Z',
      cwdResolver: () => 'C:/workspace',
    });

    const snapshot = createSnapshot();
    const begun = await coordinator.beginDraftReview({
      snapshot,
      reviewAgent: 'codex',
      instructions: '設計レビュー',
    });

    await expect(
      coordinator.awaitDraftReviewResult({
        snapshot,
        run: begun.run,
      }),
    ).rejects.toThrow('Codex turn failed: invalid_json_schema (location.oneOf is not permitted).');
  });
});
