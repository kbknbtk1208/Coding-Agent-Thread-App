import { describe, expect, it, vi } from 'vitest';
import { resolveGitLabDiffRefs } from './gitlab-diff-refs';

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

describe('resolveGitLabDiffRefs', () => {
  it('does not call /versions when MR diff refs are complete', async () => {
    const fetchPagedJson = vi.fn();
    const result = await resolveGitLabDiffRefs({
      endpoint: 'https://gitlab.example.test/api/v4',
      projectPathOrId: 'group/project',
      mergeRequestIid: 1,
      mrDiffRefs: { base_sha: 'base', head_sha: 'head', start_sha: 'start' },
      transport: { fetchPagedJson, getHttpStatus: () => null },
    });

    expect(fetchPagedJson).not.toHaveBeenCalled();
    expect(result.refs).toEqual({ baseSha: 'base', headSha: 'head', startSha: 'start' });
  });

  it('fills missing refs from /versions and reports diagnostics', async () => {
    const result = await resolveGitLabDiffRefs({
      endpoint: 'https://gitlab.example.test/api/v4',
      projectPathOrId: 'group/project',
      mergeRequestIid: 1,
      mrDiffRefs: { base_sha: 'base', head_sha: null, start_sha: null },
      mrSha: 'mr-head',
      transport: {
        fetchPagedJson: vi
          .fn()
          .mockResolvedValue([
            {
              base_commit_sha: 'version-base',
              head_commit_sha: 'version-head',
              start_commit_sha: 'start',
            },
          ]),
        getHttpStatus: () => null,
      },
    });

    expect(result.refs).toEqual({ baseSha: 'base', headSha: 'mr-head', startSha: 'start' });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'GITLAB_DIFF_REFS_FALLBACK_USED',
    ]);
  });

  it('throws on non fallback /versions errors', async () => {
    await expect(
      resolveGitLabDiffRefs({
        endpoint: 'https://gitlab.example.test/api/v4',
        projectPathOrId: 'group/project',
        mergeRequestIid: 1,
        mrDiffRefs: null,
        transport: {
          fetchPagedJson: vi.fn().mockRejectedValue(new HttpError(500)),
          getHttpStatus: (err) => (err instanceof HttpError ? err.status : null),
        },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
