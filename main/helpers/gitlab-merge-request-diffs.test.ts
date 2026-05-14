import { describe, expect, it, vi } from 'vitest';
import {
  fetchGitLabMergeRequestDiffsWithFallback,
  type GitLabDiffTransport,
} from './gitlab-merge-request-diffs';

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function createTransport(input: Partial<GitLabDiffTransport>): GitLabDiffTransport {
  return {
    fetchJson: vi.fn(),
    fetchPagedJson: vi.fn(),
    fetchText: vi.fn(),
    getHttpStatus: (err) => (err instanceof HttpError ? err.status : null),
    ...input,
  };
}

describe('fetchGitLabMergeRequestDiffsWithFallback', () => {
  it('uses /diffs when available', async () => {
    const transport = createTransport({
      fetchPagedJson: vi
        .fn()
        .mockResolvedValue([{ old_path: 'a.ts', new_path: 'a.ts', diff: '+x' }]),
    });

    const result = await fetchGitLabMergeRequestDiffsWithFallback({
      endpoint: 'https://gitlab.example.test/api/v4',
      projectPathOrId: 'group/project',
      mergeRequestIid: 1,
      maxChangedFiles: 300,
      transport,
    });

    expect(result.source).toBe('diffs');
    expect(result.diagnostics).toEqual([]);
    expect(result.diffs[0]).toMatchObject({ old_path: 'a.ts', new_path: 'a.ts' });
  });

  it('falls back from /diffs 404 to /changes', async () => {
    const transport = createTransport({
      fetchPagedJson: vi.fn().mockRejectedValue(new HttpError(404)),
      fetchJson: vi.fn().mockResolvedValue({
        overflow: true,
        changes: [{ old_path: 'a.ts', new_path: 'a.ts', diff: '+x' }],
      }),
    });

    const result = await fetchGitLabMergeRequestDiffsWithFallback({
      endpoint: 'https://gitlab.example.test/api/v4',
      projectPathOrId: 'group/project',
      mergeRequestIid: 1,
      maxChangedFiles: 300,
      transport,
    });

    expect(result.source).toBe('changes');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'GITLAB_DIFFS_ENDPOINT_UNAVAILABLE',
      'GITLAB_CHANGES_FALLBACK_USED',
      'GITLAB_CHANGES_OVERFLOW',
    ]);
  });

  it('falls back from /changes 404 to /raw_diffs', async () => {
    const transport = createTransport({
      fetchPagedJson: vi.fn().mockRejectedValue(new HttpError(404)),
      fetchJson: vi.fn().mockRejectedValue(new HttpError(404)),
      fetchText: vi
        .fn()
        .mockResolvedValue(
          [
            'diff --git a/a.ts b/a.ts',
            '--- a/a.ts',
            '+++ b/a.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
          ].join('\n'),
        ),
    });

    const result = await fetchGitLabMergeRequestDiffsWithFallback({
      endpoint: 'https://gitlab.example.test/api/v4',
      projectPathOrId: 'group/project',
      mergeRequestIid: 1,
      maxChangedFiles: 300,
      transport,
    });

    expect(result.source).toBe('raw_diffs');
    expect(result.diffs[0]).toMatchObject({ old_path: 'a.ts', new_path: 'a.ts' });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'GITLAB_RAW_DIFFS_FALLBACK_USED',
    );
  });

  it('does not fallback on auth or server errors', async () => {
    const transport = createTransport({
      fetchPagedJson: vi.fn().mockRejectedValue(new HttpError(401)),
    });

    await expect(
      fetchGitLabMergeRequestDiffsWithFallback({
        endpoint: 'https://gitlab.example.test/api/v4',
        projectPathOrId: 'group/project',
        mergeRequestIid: 1,
        maxChangedFiles: 300,
        transport,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(transport.fetchJson).not.toHaveBeenCalled();
  });
});
