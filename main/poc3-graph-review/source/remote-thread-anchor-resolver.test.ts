import { describe, expect, it } from 'vitest';
import type {
  ReviewChangedFile,
  ReviewRemoteThread,
} from '../../../shared/poc3-domain/source-snapshot';
import {
  buildRemoteThreadSummary,
  resolveRemoteThreadAnchors,
} from './remote-thread-anchor-resolver';

const changedFile: ReviewChangedFile = {
  path: 'src/example.ts',
  oldPath: null,
  status: 'modified',
  additions: 2,
  deletions: 1,
  patch: '@@ -10,3 +10,4 @@',
  hunks: [
    {
      filePath: 'src/example.ts',
      oldStart: 10,
      oldLines: 3,
      newStart: 10,
      newLines: 4,
      header: '@@ -10,3 +10,4 @@',
      changedNewLines: [11, 12],
      changedOldLines: [11],
    },
  ],
};

function createThread(overrides: Partial<ReviewRemoteThread>): ReviewRemoteThread {
  return {
    providerThreadId: 'thread-1',
    location: {
      kind: 'diff',
      filePath: 'src/example.ts',
      oldPath: null,
      startLine: null,
      endLine: 11,
      side: 'RIGHT',
    },
    anchorStatus: 'current',
    isResolved: null,
    isOutdated: null,
    comments: [
      {
        providerCommentId: 'comment-1',
        author: { login: 'alice', displayName: null, avatarUrl: null },
        body: 'comment',
        url: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
      },
    ],
    providerContext: {
      remoteDiscussionId: 'discussion-1',
      remoteCommentIds: ['comment-1'],
      anchorRefs: {},
    },
    ...overrides,
  };
}

describe('resolveRemoteThreadAnchors', () => {
  it('marks right-side threads inside current hunks as current', () => {
    const [thread] = resolveRemoteThreadAnchors({
      threads: [createThread({})],
      changedFiles: [changedFile],
      headSha: 'b'.repeat(40),
    });

    expect(thread.anchorStatus).toBe('current');
  });

  it('marks left-side threads outside current hunks as outdated', () => {
    const [thread] = resolveRemoteThreadAnchors({
      threads: [
        createThread({
          location: {
            kind: 'diff',
            filePath: 'src/example.ts',
            oldPath: null,
            startLine: null,
            endLine: 99,
            side: 'LEFT',
          },
        }),
      ],
      changedFiles: [changedFile],
      headSha: 'b'.repeat(40),
    });

    expect(thread.anchorStatus).toBe('outdated');
  });

  it('marks threads for files outside the diff as unanchored', () => {
    const [thread] = resolveRemoteThreadAnchors({
      threads: [
        createThread({
          location: {
            kind: 'diff',
            filePath: 'src/missing.ts',
            oldPath: null,
            startLine: null,
            endLine: 1,
            side: 'RIGHT',
          },
        }),
      ],
      changedFiles: [changedFile],
      headSha: 'b'.repeat(40),
    });

    expect(thread.anchorStatus).toBe('unanchored');
  });

  it('keeps provider-outdated threads archived even when their line is in a current hunk', () => {
    const [thread] = resolveRemoteThreadAnchors({
      threads: [createThread({ isOutdated: true })],
      changedFiles: [changedFile],
      headSha: 'b'.repeat(40),
    });

    expect(thread.anchorStatus).toBe('outdated');
  });

  it('builds summary only from current diff threads', () => {
    const summary = buildRemoteThreadSummary([
      createThread({ providerThreadId: 'current' }),
      createThread({ providerThreadId: 'outdated', anchorStatus: 'outdated' }),
      createThread({
        providerThreadId: 'overview',
        location: { kind: 'overview' },
        anchorStatus: 'overview',
      }),
    ]);

    expect(summary).toEqual([
      {
        providerThreadId: 'current',
        filePath: 'src/example.ts',
        line: 11,
        side: 'RIGHT',
        isResolved: null,
        commentCount: 1,
      },
    ]);
  });
});
