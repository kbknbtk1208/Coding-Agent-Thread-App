import { describe, expect, it } from 'vitest';
import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import type { ReviewLocalThread } from '../../shared/domain/review-draft';
import { ReviewSelectionContextAssembler } from './review-selection-context-assembler';

function createFile(overrides: Partial<ReviewSnapshotFile> = {}): ReviewSnapshotFile {
  return {
    fileId: 'file-1',
    filePath: 'src/example.ts',
    oldFilePath: null,
    changeType: 'modified',
    additions: 2,
    deletions: 1,
    patch: null,
    isLargeDiff: false,
    isBinary: false,
    contentStatus: 'loaded',
    oldContent: 'const oldValue = 1;\nexport const keep = oldValue;\n',
    newContent: [
      'const value = 1;',
      'const next = value + 1;',
      'export const keep = next;',
      'export const other = "ok";',
    ].join('\n'),
    language: 'typescript',
    providerContext: {
      remotePath: 'src/example.ts',
    },
    ...overrides,
  };
}

function createSnapshot(files: ReviewSnapshotFile[] = [createFile()]): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: 'pr-1',
    title: 'Test PR',
    description: 'Test description',
    baseSha: 'base',
    headSha: 'head',
    files,
    discussions: [
      {
        threadId: 'remote-thread-1',
        location: {
          kind: 'diff',
          fileId: 'file-1',
          filePath: 'src/example.ts',
          startLine: 2,
          endLine: 2,
          side: 'new',
        },
        comments: [],
        isResolved: false,
        isOutdated: false,
        providerContext: {
          remoteCommentIds: [],
          anchorRefs: {},
        },
      },
    ],
    providerContext: {
      host: 'https://github.com',
      reviewUrl: 'https://github.com/example/repo/pull/1',
      anchorRefs: {},
    },
  };
}

function createLocalThread(): ReviewLocalThread {
  return {
    localThreadId: 'draft-thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    draft: {
      localThreadId: 'draft-thread-1',
      snapshotId: 'snapshot-1',
      runId: 'run-1',
      findingId: 'finding-1',
      source: 'ai-review',
      state: 'draft',
      severity: 'medium',
      category: 'correctness',
      confidence: 'medium',
      title: 'Draft',
      draftBody: 'Draft body',
      resolvedLocation: {
        kind: 'diff',
        fileId: 'file-1',
        filePath: 'src/example.ts',
        startLine: 1,
        endLine: 3,
        side: 'new',
      },
      anchor: {
        fileId: 'file-1',
        filePath: 'src/example.ts',
        startLine: 1,
        endLine: 3,
        side: 'new',
        kind: 'range',
      },
    },
    messages: [],
    binding: null,
    replyStatus: 'idle',
    lastError: null,
    activeReplySessionId: null,
    activeReplySession: null,
  };
}

describe('ReviewSelectionContextAssembler', () => {
  it('builds a local prompt from only the selected file range and nearby ids', async () => {
    const assembler = new ReviewSelectionContextAssembler();
    const snapshot = createSnapshot([
      createFile(),
      createFile({ fileId: 'file-2', filePath: 'src/other.ts', newContent: 'SECRET_OTHER_FILE' }),
    ]);

    const assembly = await assembler.build({
      snapshot,
      reviewAgent: 'codex',
      fileId: 'file-1',
      side: 'new',
      startLine: 2,
      endLine: 3,
      question: 'この変更は安全？',
      localDraftThreads: [createLocalThread()],
    });

    expect(assembly.selection.selectedExcerpt).toContain('L2: const next = value + 1;');
    expect(assembly.selection.selectedExcerpt).toContain('L3: export const keep = next;');
    expect(assembly.selection.nearbyRemoteThreadIds).toEqual(['remote-thread-1']);
    expect(assembly.selection.nearbyDraftThreadIds).toEqual(['draft-thread-1']);
    expect(assembly.initialPrompt).toContain('この選択範囲と直接の影響範囲だけに答えること。');
    expect(assembly.initialPrompt).not.toContain('SECRET_OTHER_FILE');
  });

  it('rejects selections wider than 30 lines', async () => {
    const assembler = new ReviewSelectionContextAssembler();
    const file = createFile({
      newContent: Array.from({ length: 40 }, (_, index) => `line ${String(index + 1)}`).join('\n'),
    });

    await expect(
      assembler.build({
        snapshot: createSnapshot([file]),
        reviewAgent: 'codex',
        fileId: 'file-1',
        side: 'new',
        startLine: 1,
        endLine: 31,
        question: '広い？',
      }),
    ).rejects.toThrow('30 lines or fewer');
  });

  it('hydrates unloaded files before extracting the selected excerpt', async () => {
    const assembler = new ReviewSelectionContextAssembler();
    const idleFile = createFile({ contentStatus: 'idle', newContent: '' });
    const hydratedFile = createFile({ newContent: 'hydrated line' });

    const assembly = await assembler.build({
      snapshot: createSnapshot([idleFile]),
      reviewAgent: 'copilot',
      fileId: 'file-1',
      side: 'new',
      startLine: 1,
      endLine: 1,
      question: 'hydrate できる？',
      hydrateFile: async () => hydratedFile,
    });

    expect(assembly.selection.selectedExcerpt).toContain('L1: hydrated line');
  });
});
