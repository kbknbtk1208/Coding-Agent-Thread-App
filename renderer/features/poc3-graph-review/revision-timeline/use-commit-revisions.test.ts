import { describe, expect, it } from 'vitest';
import type { RefreshWorkspaceRevisionsResult } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { shouldInvalidateGraphAfterRefresh } from './use-commit-revisions';

function createRefreshResult(
  overrides: Partial<Extract<RefreshWorkspaceRevisionsResult, { ok: true }>> = {},
): Extract<RefreshWorkspaceRevisionsResult, { ok: true }> {
  return {
    ok: true,
    refresh: {
      refreshId: 'refresh-1',
      reviewWorkspaceId: 'workspace-1',
      status: 'completed',
      previousHeadSha: 'a'.repeat(40),
      latestHeadSha: 'a'.repeat(40),
      createdRevisionId: null,
      message: '最新 revision は取得済みです。',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    },
    view: {
      reviewWorkspaceId: 'workspace-1',
      activeRevisionId: 'revision-1',
      activeHeadSha: 'a'.repeat(40),
      commits: [],
      revisions: [],
      latestRefresh: null,
      outdatedThreadSummary: {
        count: 0,
        latestCheckedRevisionId: null,
      },
    },
    graphAnalysis: null,
    ...overrides,
  };
}

describe('shouldInvalidateGraphAfterRefresh', () => {
  it('invalidates graph even when refresh is no-op because remote comments may have changed', () => {
    expect(shouldInvalidateGraphAfterRefresh(createRefreshResult(), 'revision-1')).toBe(true);
  });

  it('invalidates graph when active revision changes', () => {
    expect(shouldInvalidateGraphAfterRefresh(createRefreshResult(), 'revision-old')).toBe(true);
  });

  it('does not invalidate graph for failed refresh result', () => {
    const result: RefreshWorkspaceRevisionsResult = {
      ok: false,
      reason: 'worktreeUpdateFailed',
      message: 'failed',
      refresh: null,
      view: null,
    };

    expect(shouldInvalidateGraphAfterRefresh(result, 'revision-1')).toBe(false);
  });
});
