import { describe, expect, it } from 'vitest';
import { GITHUB_MOCK_COMMENTS, GITHUB_MOCK_FILES } from '../mock/github-mock-response';
import { adaptGitHubSnapshot } from './github-snapshot-adapter';

describe('adaptGitHubSnapshot', () => {
  it('normalizes diff and overview discussions', () => {
    const snapshot = adaptGitHubSnapshot({
      snapshotId: 'snapshot-gh',
      source: {
        provider: 'github',
        host: 'https://api.github.com',
        reviewUrl: 'https://github.com/octocat/hello-world/pull/1',
      },
      locator: {
        provider: 'github',
        host: 'https://api.github.com',
        owner: 'octocat',
        repo: 'hello-world',
        pullNumber: 1,
      },
      detail: {
        number: 1,
        title: 'Refactor date formatting and add Header component',
        body: 'Replace legacy date formatter with modern implementation.',
        base: { sha: 'base-sha' },
        head: { sha: 'head-sha' },
      },
      files: GITHUB_MOCK_FILES,
      reviewComments: GITHUB_MOCK_COMMENTS,
      issueComments: [
        {
          id: 9001,
          body: 'Please add a changelog entry.',
          user: { login: 'reviewer' },
          created_at: '2025-05-03T10:00:00Z',
          updated_at: '2025-05-03T10:00:00Z',
        },
      ],
    });

    expect(snapshot.snapshotId).toBe('snapshot-gh');
    expect(snapshot.baseSha).toBe('base-sha');
    expect(snapshot.headSha).toBe('head-sha');
    expect(snapshot.files).toHaveLength(GITHUB_MOCK_FILES.length);
    expect(snapshot.files[0]?.providerContext.remotePath).toBe('src/utils/format.ts');
    expect(snapshot.discussions.some((thread) => thread.location.kind === 'overview')).toBe(true);
    expect(snapshot.discussions.some((thread) => thread.location.kind === 'diff')).toBe(true);
  });
});
