import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionSnapshot } from '../../shared/contracts/agent-ipc';
import type { ReviewSnapshot } from '../../shared/domain/review';
import type {
  ReviewDraftEnvelope,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadDraft,
} from '../../shared/domain/review-draft';
import { ReviewDraftStore } from './review-draft-store';
import { ReviewThreadReplyCoordinator } from './review-thread-reply-coordinator';

function createRun(reviewAgent: ReviewRunRecord['reviewAgent']): ReviewRunRecord {
  return {
    runId: 'run-1',
    snapshotId: 'snapshot-1',
    reviewAgent,
    lensId: 'general',
    instructions: 'review',
    rootAppSessionId: 'root-session-1',
    status: 'completed',
    resultSource: 'codexOutputSchema',
    createdAt: '2026-04-05T00:00:00.000Z',
    completedAt: '2026-04-05T00:01:00.000Z',
  };
}

function createSummary(): ReviewSummaryDraft {
  return {
    headline: 'headline',
    overview: 'overview',
    positives: [],
    risks: [],
  };
}

function createDraft(): ReviewThreadDraft {
  return {
    localThreadId: 'thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    findingId: 'finding-1',
    source: 'ai-review',
    state: 'draft',
    severity: 'high',
    category: 'correctness',
    confidence: 'high',
    title: 'Possible off-by-one',
    draftBody: 'The zero branch may be skipped.',
    suggestion: 'Add a guard.',
    resolvedLocation: {
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/file.ts',
      startLine: 2,
      endLine: 2,
      side: 'new',
    },
    anchor: {
      fileId: 'file-1',
      filePath: 'src/file.ts',
      startLine: 2,
      endLine: 2,
      side: 'new',
      kind: 'line',
    },
  };
}

function createEnvelope(reviewAgent: ReviewRunRecord['reviewAgent']): ReviewDraftEnvelope {
  return {
    kind: 'structured',
    run: createRun(reviewAgent),
    summary: createSummary(),
    threads: [createDraft()],
  };
}

function createSnapshot(): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: 'review-1',
    title: 'Review title',
    description: 'Review description',
    baseSha: 'base',
    headSha: 'head',
    files: [
      {
        fileId: 'file-1',
        filePath: 'src/file.ts',
        oldFilePath: null,
        changeType: 'modified',
        additions: 3,
        deletions: 1,
        patch: null,
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'loaded',
        oldContent: 'export function value(input: number) {\n  return input;\n}\n',
        newContent:
          'export function value(input: number) {\n  if (input === 0) {\n    return 1;\n  }\n  return input + 1;\n}\n',
        language: 'ts',
        providerContext: {
          remotePath: 'src/file.ts',
        },
      },
    ],
    discussions: [],
    providerContext: {
      host: 'github.com',
      reviewUrl: 'https://example.test/review/1',
      anchorRefs: {},
    },
  };
}

function createSession(
  appSessionId: string,
  status: AgentSessionSnapshot['status'],
  agent: AgentSessionSnapshot['agent'],
  finalResult?: AgentSessionSnapshot['finalResult'],
): AgentSessionSnapshot {
  return {
    appSessionId,
    agent,
    cwd: 'C:/workspace',
    status,
    capabilities: [],
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:10.000Z',
    turns: [
      {
        turnId: `turn-${appSessionId}`,
        messageId: `message-${appSessionId}`,
        prompt: 'prompt',
        response: finalResult?.kind === 'richText' ? finalResult.content : '',
        intermediateSegments: [],
        responseMode: 'richText',
        status,
        startedAt: '2026-04-05T00:00:00.000Z',
        completedAt: status === 'completed' ? '2026-04-05T00:00:10.000Z' : undefined,
        result: finalResult,
      },
    ],
    streamBuffer: {
      content: '',
      messageId: status === 'completed' ? null : `message-${appSessionId}`,
    },
    finalResult,
    pendingPermissions: [],
  };
}

describe('ReviewThreadReplyCoordinator', () => {
  it('forks Codex threads from the root session and reuses the same discussion session for follow-ups', async () => {
    const store = new ReviewDraftStore();
    store.saveEnvelope('snapshot-1', createEnvelope('codex'));

    const forkSession = vi.fn(async () => createSession('thread-session-1', 'completed', 'codex'));
    const continueConversation = vi.fn(async () =>
      createSession('thread-session-1', 'completed', 'codex'),
    );
    const sendFollowUp = vi
      .fn()
      .mockResolvedValueOnce(createSession('thread-session-1', 'starting', 'codex'))
      .mockResolvedValueOnce(createSession('thread-session-1', 'starting', 'codex'));
    const awaitSettled = vi
      .fn()
      .mockResolvedValueOnce(
        createSession('thread-session-1', 'completed', 'codex', {
          kind: 'richText',
          format: 'markdown',
          content: 'First assistant reply',
          source: 'richText',
        }),
      )
      .mockResolvedValueOnce(
        createSession('thread-session-1', 'completed', 'codex', {
          kind: 'richText',
          format: 'markdown',
          content: 'Second assistant reply',
          source: 'richText',
        }),
      );

    const coordinator = new ReviewThreadReplyCoordinator({
      agentGateway: {
        awaitSettled,
        continueConversation,
        forkSession,
        sendFollowUp,
        startSession: vi.fn(),
      },
      draftStore: store,
      now: () => '2026-04-05T00:02:00.000Z',
    });

    const begun = await coordinator.beginDraftThreadReply({
      snapshot: createSnapshot(),
      run: createRun('codex'),
      summary: createSummary(),
      localThreadId: 'thread-1',
      body: 'Can you confirm the failure mode?',
      cwd: 'C:/workspace',
    });

    expect(forkSession).toHaveBeenCalledWith({ appSessionId: 'root-session-1' });
    expect(sendFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        appSessionId: 'thread-session-1',
        responseMode: 'richText',
      }),
    );
    expect(begun.binding.strategy).toBe('codex-fork');
    expect(store.getLocalThread('snapshot-1', 'thread-1')?.replyStatus).toBe('replying');
    expect(store.getLocalThread('snapshot-1', 'thread-1')?.messages.at(-1)?.body).toBe(
      'Can you confirm the failure mode?',
    );

    const resolved = await coordinator.awaitDraftThreadReplyResult({
      replyId: begun.reply.replyId,
      snapshotId: begun.reply.snapshotId,
      localThreadId: begun.reply.localThreadId,
      appSessionId: begun.reply.appSessionId,
    });
    expect(resolved.replyStatus).toBe('idle');
    expect(resolved.messages.at(-1)?.body).toBe('First assistant reply');
    expect(resolved.activeReplySessionId).toBeNull();

    const secondBegun = await coordinator.beginDraftThreadReply({
      snapshot: createSnapshot(),
      run: createRun('codex'),
      summary: createSummary(),
      localThreadId: 'thread-1',
      body: 'Thanks. What test would catch it?',
      cwd: 'C:/workspace',
    });
    await coordinator.awaitDraftThreadReplyResult({
      replyId: secondBegun.reply.replyId,
      snapshotId: secondBegun.reply.snapshotId,
      localThreadId: secondBegun.reply.localThreadId,
      appSessionId: secondBegun.reply.appSessionId,
    });

    expect(continueConversation).toHaveBeenCalledWith({ appSessionId: 'thread-session-1' });
    expect(sendFollowUp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appSessionId: 'thread-session-1',
      }),
    );
    expect(store.getLocalThread('snapshot-1', 'thread-1')?.messages.at(-1)?.body).toBe(
      'Second assistant reply',
    );
  });

  it('starts Copilot threads with app-side rehydrate instead of forking', async () => {
    const store = new ReviewDraftStore();
    store.saveEnvelope('snapshot-1', createEnvelope('copilot'));

    const startSession = vi.fn(async () =>
      createSession('thread-session-2', 'starting', 'copilot'),
    );
    const coordinator = new ReviewThreadReplyCoordinator({
      agentGateway: {
        awaitSettled: vi.fn(async () =>
          createSession('thread-session-2', 'completed', 'copilot', {
            kind: 'richText',
            format: 'markdown',
            content: 'Copilot reply',
            source: 'richText',
          }),
        ),
        continueConversation: vi.fn(),
        forkSession: vi.fn(),
        sendFollowUp: vi.fn(),
        startSession,
      },
      draftStore: store,
      now: () => '2026-04-05T00:02:00.000Z',
    });

    const begun = await coordinator.beginDraftThreadReply({
      snapshot: createSnapshot(),
      run: createRun('copilot'),
      summary: createSummary(),
      localThreadId: 'thread-1',
      body: 'Can you restate the recommendation?',
      cwd: 'C:/workspace',
    });

    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'copilot',
        cwd: 'C:/workspace',
        responseMode: 'richText',
      }),
    );
    expect(begun.binding.strategy).toBe('app-side-rehydrate');
    const resolved = await coordinator.awaitDraftThreadReplyResult({
      replyId: begun.reply.replyId,
      snapshotId: begun.reply.snapshotId,
      localThreadId: begun.reply.localThreadId,
      appSessionId: begun.reply.appSessionId,
    });
    expect(resolved.messages.at(-1)?.body).toBe('Copilot reply');
  });
});
