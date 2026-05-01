import { describe, expect, it } from 'vitest';
import {
  normalizeGitHubRemoteThreads,
  normalizeGitLabRemoteThreads,
} from './remote-thread-normalizer';

describe('normalizeGitHubRemoteThreads', () => {
  it('groups review comment replies by root comment', () => {
    const threads = normalizeGitHubRemoteThreads(
      [
        {
          id: 10,
          path: 'src/example.ts',
          line: 20,
          start_line: null,
          original_line: 20,
          original_start_line: null,
          side: 'RIGHT',
          body: 'root',
          html_url: 'https://github.example/comment/10',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:01:00.000Z',
          position: 1,
          original_position: 1,
          commit_id: 'b'.repeat(40),
          original_commit_id: 'b'.repeat(40),
          diff_hunk: '@@ -20 +20 @@',
          user: { login: 'alice', avatar_url: 'https://avatar.example/alice.png' },
        },
        {
          id: 11,
          in_reply_to_id: 10,
          path: 'src/example.ts',
          line: 20,
          start_line: null,
          original_line: 20,
          original_start_line: null,
          side: 'RIGHT',
          body: 'reply',
          html_url: 'https://github.example/comment/11',
          created_at: '2026-01-01T00:02:00.000Z',
          updated_at: '2026-01-01T00:02:00.000Z',
          position: 1,
          original_position: 1,
          commit_id: 'b'.repeat(40),
          original_commit_id: 'b'.repeat(40),
          diff_hunk: '@@ -20 +20 @@',
          user: { login: 'bob', avatar_url: null },
        },
      ],
      [],
      'b'.repeat(40),
    );

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      providerThreadId: 'github-review-comment:10',
      location: { kind: 'diff', filePath: 'src/example.ts', endLine: 20, side: 'RIGHT' },
      comments: [
        { providerCommentId: 'github-review-comment:10', author: { login: 'alice' }, body: 'root' },
        { providerCommentId: 'github-review-comment:11', author: { login: 'bob' }, body: 'reply' },
      ],
    });
  });

  it('normalizes issue comments as overview threads', () => {
    const threads = normalizeGitHubRemoteThreads(
      [],
      [
        {
          id: 20,
          body: 'overview',
          html_url: 'https://github.example/comment/20',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          user: { login: 'alice', avatar_url: null },
        },
      ],
      'b'.repeat(40),
    );

    expect(threads).toMatchObject([
      {
        providerThreadId: 'github-issue-comment:20',
        location: { kind: 'overview' },
        anchorStatus: 'overview',
      },
    ]);
  });
});

describe('normalizeGitLabRemoteThreads', () => {
  it('normalizes discussion positions as diff threads', () => {
    const threads = normalizeGitLabRemoteThreads([
      {
        id: 'discussion-1',
        notes: [
          {
            id: 30,
            body: 'gitlab comment',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: null,
            resolved: false,
            author: { username: 'alice', name: 'Alice', avatar_url: null },
            position: {
              base_sha: 'a'.repeat(40),
              head_sha: 'b'.repeat(40),
              start_sha: 'c'.repeat(40),
              new_path: 'src/example.ts',
              old_path: 'src/example.ts',
              new_line: 12,
              old_line: null,
              line_type: 'new',
              line_range: null,
            },
          },
        ],
      },
    ]);

    expect(threads).toMatchObject([
      {
        providerThreadId: 'gitlab-discussion:discussion-1',
        location: { kind: 'diff', filePath: 'src/example.ts', endLine: 12, side: 'RIGHT' },
        isResolved: false,
        comments: [{ providerCommentId: 'gitlab-note:30', author: { login: 'alice' } }],
      },
    ]);
  });
});
