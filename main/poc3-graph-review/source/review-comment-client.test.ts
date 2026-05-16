import { describe, expect, it, vi } from 'vitest';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import { postGitLabInlineComment } from './review-comment-client';

function createSourceSnapshot(): ReviewSourceSnapshot {
  return {
    sourceSnapshotId: 'source-1',
    revisionId: 'revision-1',
    provider: 'gitlab',
    reviewId: '1',
    title: 'MR',
    description: '',
    baseSha: 'old-base',
    headSha: 'old-head',
    startSha: 'old-start',
    diffVersion: null,
    changedFiles: [],
    remoteThreads: [],
    remoteThreadsSummary: [],
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('postGitLabInlineComment', () => {
  it('refreshes diff refs before retrying a stale position rejection', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('stale', { status: 422 }))
      .mockResolvedValueOnce(
        Response.json([
          {
            base_commit_sha: 'latest-base',
            head_commit_sha: 'latest-head',
            start_commit_sha: 'latest-start',
          },
        ]),
      )
      .mockResolvedValueOnce(Response.json({ id: 'discussion-1', notes: [{ id: 10 }] }));

    const result = await postGitLabInlineComment({
      kind: 'gitlab',
      baseUrl: 'https://gitlab.example.test',
      token: 'token',
      projectPathOrId: 'group/project',
      mergeRequestIid: '1',
      body: 'comment',
      sourceSnapshot: createSourceSnapshot(),
      anchor: {
        kind: 'diff',
        filePath: 'src/a.ts',
        oldPath: null,
        startLine: null,
        endLine: 5,
        side: 'RIGHT',
      },
      fetchImpl,
    });

    expect(result.providerThreadId).toBe('gitlab-discussion:discussion-1');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/versions?per_page=1&page=1');
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body)) as {
      position: Record<string, string>;
    };
    expect(retryBody.position).toMatchObject({
      base_sha: 'latest-base',
      head_sha: 'latest-head',
      start_sha: 'latest-start',
    });
  });
});
