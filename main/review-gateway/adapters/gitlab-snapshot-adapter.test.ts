import { describe, expect, it } from 'vitest';
import { GITLAB_MOCK_DIFFS, GITLAB_MOCK_DISCUSSIONS } from '../mock/gitlab-mock-response';
import { adaptGitLabSnapshot } from './gitlab-snapshot-adapter';

describe('adaptGitLabSnapshot', () => {
  it('keeps diff and overview threads separate', () => {
    const snapshot = adaptGitLabSnapshot({
      snapshotId: 'snapshot-gl',
      source: {
        provider: 'gitlab',
        host: 'https://gitlab.example.com',
        reviewUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
      },
      locator: {
        provider: 'gitlab',
        host: 'https://gitlab.example.com',
        projectPathOrId: 'group/project',
        mergeRequestIid: 1,
      },
      detail: {
        iid: 1,
        title: 'Add session TTL and expiration support',
        description: 'Introduce time-based session validity.',
        diff_refs: { base_sha: 'base-sha', head_sha: 'head-sha' },
      },
      diffs: GITLAB_MOCK_DIFFS,
      discussions: [
        ...GITLAB_MOCK_DISCUSSIONS,
        {
          id: 'disc-overview',
          notes: [
            {
              id: 9999,
              body: 'General overview note.',
              author: {
                username: 'reviewer',
                id: 104,
                avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/104/avatar.png',
              },
              resolved: false,
              created_at: '2025-05-03T12:00:00Z',
              updated_at: '2025-05-03T12:00:00Z',
            },
          ],
        },
      ],
    });

    expect(snapshot.snapshotId).toBe('snapshot-gl');
    expect(snapshot.files).toHaveLength(GITLAB_MOCK_DIFFS.length);
    expect(snapshot.files.some((file) => file.changeType === 'renamed')).toBe(true);
    expect(snapshot.discussions.some((thread) => thread.location.kind === 'overview')).toBe(true);
    expect(snapshot.discussions.some((thread) => thread.location.kind === 'diff')).toBe(true);
  });
});
