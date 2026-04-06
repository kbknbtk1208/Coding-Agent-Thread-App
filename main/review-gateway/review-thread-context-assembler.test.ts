import { describe, expect, it } from 'vitest';
import type { ReviewSnapshot } from '../../shared/domain/review';
import {
  createReviewLocalThread,
  type ReviewRunRecord,
  type ReviewSummaryDraft,
  type ReviewThreadDraft,
} from '../../shared/domain/review-draft';
import { ReviewThreadContextAssembler } from './review-thread-context-assembler';

function createRun(): ReviewRunRecord {
  return {
    runId: 'run-1',
    snapshotId: 'snapshot-1',
    reviewAgent: 'copilot',
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
    headline: 'Main issue is correctness around edge cases.',
    overview: 'The diff mostly looks good but one path may be ambiguous.',
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
    title: 'Potential off-by-one in nextValue',
    draftBody: 'The update may skip the zero case.',
    suggestion: 'Add a guard for the zero branch.',
    resolvedLocation: {
      kind: 'diff',
      fileId: 'file-1',
      filePath: 'src/thread.ts',
      startLine: 2,
      endLine: 2,
      side: 'new',
    },
    anchor: {
      fileId: 'file-1',
      filePath: 'src/thread.ts',
      startLine: 2,
      endLine: 2,
      side: 'new',
      kind: 'line',
    },
  };
}

function createSnapshot(): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: 'review-1',
    title: 'Add thread conversation support',
    description: 'Review description',
    baseSha: 'base',
    headSha: 'head',
    files: [
      {
        fileId: 'file-1',
        filePath: 'src/thread.ts',
        oldFilePath: null,
        changeType: 'modified',
        additions: 3,
        deletions: 1,
        patch: null,
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'loaded',
        oldContent: 'export function nextValue(input: number) {\n  return input;\n}\n',
        newContent:
          'export function nextValue(input: number) {\n  if (input === 0) {\n    return 1;\n  }\n  return input + 1;\n}\n',
        language: 'ts',
        providerContext: {
          remotePath: 'src/thread.ts',
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

describe('ReviewThreadContextAssembler', () => {
  it('builds a prompt scoped to the selected finding and thread history', async () => {
    const assembler = new ReviewThreadContextAssembler();
    const localThread = createReviewLocalThread(createDraft(), '2026-04-05T00:00:00.000Z');
    localThread.messages.push({
      localMessageId: 'thread-1:user:1',
      localThreadId: 'thread-1',
      role: 'user',
      source: 'user-reply',
      body: 'Can you explain the concrete failure mode?',
      createdAt: '2026-04-05T00:02:00.000Z',
    });

    const result = await assembler.build({
      snapshot: createSnapshot(),
      run: createRun(),
      summary: createSummary(),
      thread: localThread,
      userReply: 'What test would prove it?',
    });

    expect(result.followUpPrompt).toContain('## Review');
    expect(result.followUpPrompt).toContain('Add thread conversation support');
    expect(result.followUpPrompt).toContain('Potential off-by-one in nextValue');
    expect(result.followUpPrompt).toContain('What test would prove it?');
    expect(result.followUpPrompt).toContain('Can you explain the concrete failure mode?');
    expect(result.followUpPrompt).toContain('Add a guard for the zero branch.');
    expect(result.followUpPrompt).toContain('## File excerpt');
    expect(result.followUpPrompt).not.toContain('Other finding body');
  });
});
