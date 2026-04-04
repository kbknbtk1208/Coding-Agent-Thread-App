import { describe, expect, it } from 'vitest';
import type { ReviewSnapshot } from '../../shared/domain/review';
import { ReviewContextAssembler } from './review-context-assembler';

function createSnapshot(): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: '42',
    title: 'Add review draft pipeline',
    description: 'Adds orchestration and schema handling.',
    baseSha: 'base-sha',
    headSha: 'head-sha',
    files: [
      {
        fileId: 'file-1',
        filePath: 'main/review-gateway/review-gateway.ts',
        oldFilePath: null,
        changeType: 'modified',
        additions: 10,
        deletions: 2,
        patch: '@@ -1 +1 @@\n+const a = 1;',
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'idle',
        oldContent: '',
        newContent: '',
        language: 'ts',
        providerContext: {
          remotePath: 'main/review-gateway/review-gateway.ts',
        },
      },
      {
        fileId: 'file-2',
        filePath: 'renderer/features/review/review-page.tsx',
        oldFilePath: null,
        changeType: 'modified',
        additions: 500,
        deletions: 0,
        patch: '@@ -1 +1 @@\n+large',
        isLargeDiff: true,
        isBinary: false,
        contentStatus: 'idle',
        oldContent: '',
        newContent: '',
        language: 'tsx',
        providerContext: {
          remotePath: 'renderer/features/review/review-page.tsx',
        },
      },
    ],
    discussions: [
      {
        threadId: 'thread-1',
        location: {
          kind: 'overview',
        },
        comments: [
          {
            commentId: 'comment-1',
            author: 'reviewer',
            body: 'Please cover this path with tests.',
            createdAt: '2026-01-01T00:00:00Z',
            position: null,
          },
        ],
        isResolved: false,
        isOutdated: false,
        providerContext: {
          remoteCommentIds: ['comment-1'],
          anchorRefs: {},
        },
      },
    ],
    providerContext: {
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/acme/repo/pull/42',
      anchorRefs: {},
    },
  };
}

describe('ReviewContextAssembler', () => {
  it('includes schema and overview fallback guardrails', () => {
    const assembler = new ReviewContextAssembler();
    const result = assembler.build({
      snapshot: createSnapshot(),
      instructions: '設計とテストの観点でレビューして',
      lensId: 'general',
    });

    expect(result.prompt).toContain('Structured schema: review-draft');
    expect(result.prompt).toContain('use location.kind = overview');
    expect(result.prompt).toContain(
      'Files marked large-diff or binary may only receive overview findings.',
    );
  });

  it('marks omitted files when patch budget is exceeded', () => {
    const assembler = new ReviewContextAssembler({
      maxPromptChars: 350,
    });
    const result = assembler.build({
      snapshot: createSnapshot(),
      instructions: '総合レビュー',
      lensId: 'general',
    });

    expect(result.omittedFiles.length).toBeGreaterThan(0);
    expect(result.prompt).toContain('Omitted files due to prompt budget:');
  });
});
