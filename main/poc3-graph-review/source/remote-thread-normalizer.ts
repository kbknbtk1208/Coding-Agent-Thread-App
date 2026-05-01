import type {
  ReviewRemoteComment,
  ReviewRemoteCommentAuthor,
  ReviewRemoteThread,
  ReviewRemoteThreadLocation,
} from '../../../shared/poc3-domain/source-snapshot';

interface GithubReviewComment {
  id: number;
  in_reply_to_id?: number | null;
  path: string;
  line?: number | null;
  original_line?: number | null;
  start_line?: number | null;
  original_start_line?: number | null;
  side?: string | null;
  start_side?: string | null;
  body: string;
  html_url?: string | null;
  created_at: string;
  updated_at: string;
  commit_id?: string | null;
  original_commit_id?: string | null;
  diff_hunk?: string | null;
  position?: number | null;
  original_position?: number | null;
  user: { login: string; avatar_url?: string | null } | null;
}

interface GithubIssueComment {
  id: number;
  body: string;
  html_url?: string | null;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url?: string | null } | null;
}

interface GitlabNote {
  id: number;
  body: string;
  created_at: string;
  updated_at?: string | null;
  resolved?: boolean | null;
  author: { username: string; name?: string | null; avatar_url?: string | null } | null;
  position?: {
    base_sha?: string | null;
    head_sha?: string | null;
    start_sha?: string | null;
    new_path?: string | null;
    old_path?: string | null;
    new_line?: number | null;
    old_line?: number | null;
    line_type?: string | null;
    line_range?: unknown;
  } | null;
}

interface GitlabDiscussion {
  id: string;
  notes: GitlabNote[];
}

function toGithubAuthor(user: GithubReviewComment['user']): ReviewRemoteCommentAuthor {
  return {
    login: user?.login ?? 'unknown',
    displayName: null,
    avatarUrl: user?.avatar_url ?? null,
  };
}

function toGitlabAuthor(author: GitlabNote['author']): ReviewRemoteCommentAuthor {
  return {
    login: author?.username ?? 'unknown',
    displayName: author?.name ?? null,
    avatarUrl: author?.avatar_url ?? null,
  };
}

function toGithubReviewComment(raw: GithubReviewComment): ReviewRemoteComment {
  return {
    providerCommentId: `github-review-comment:${raw.id}`,
    author: toGithubAuthor(raw.user),
    body: raw.body,
    url: raw.html_url ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at ?? null,
  };
}

function toGithubIssueComment(raw: GithubIssueComment): ReviewRemoteComment {
  return {
    providerCommentId: `github-issue-comment:${raw.id}`,
    author: toGithubAuthor(raw.user),
    body: raw.body,
    url: raw.html_url ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at ?? null,
  };
}

export function normalizeGitHubRemoteThreads(
  reviewComments: GithubReviewComment[],
  issueComments: GithubIssueComment[],
  headSha: string,
): ReviewRemoteThread[] {
  const threads: ReviewRemoteThread[] = [];

  const roots = reviewComments.filter((c) => !c.in_reply_to_id);
  const repliesById = new Map<number, GithubReviewComment[]>();
  for (const c of reviewComments) {
    if (c.in_reply_to_id) {
      const list = repliesById.get(c.in_reply_to_id) ?? [];
      list.push(c);
      repliesById.set(c.in_reply_to_id, list);
    }
  }

  for (const root of roots) {
    const replies = repliesById.get(root.id) ?? [];
    const comments: ReviewRemoteComment[] = [
      toGithubReviewComment(root),
      ...replies.map((r) => toGithubReviewComment(r)),
    ];

    const side = root.side === 'LEFT' ? 'LEFT' : 'RIGHT';
    const startLine = root.start_line ?? root.original_start_line ?? null;
    const endLine = root.line ?? root.original_line ?? null;

    const location: ReviewRemoteThreadLocation = {
      kind: 'diff',
      filePath: root.path,
      oldPath: null,
      startLine,
      endLine,
      side,
    };

    const isOutdated =
      root.position == null ||
      (root.original_commit_id != null && root.original_commit_id !== headSha);

    threads.push({
      providerThreadId: `github-review-comment:${root.id}`,
      location,
      anchorStatus: 'current',
      isResolved: null,
      isOutdated: isOutdated ? true : null,
      comments,
      providerContext: {
        remoteDiscussionId: String(root.id),
        remoteCommentIds: [root.id, ...replies.map((r) => r.id)].map(String),
        anchorRefs: {
          commit_id: root.commit_id,
          original_commit_id: root.original_commit_id,
          diff_hunk: root.diff_hunk,
          position: root.position,
          original_position: root.original_position,
        },
      },
    });
  }

  for (const issue of issueComments) {
    threads.push({
      providerThreadId: `github-issue-comment:${issue.id}`,
      location: { kind: 'overview' },
      anchorStatus: 'overview',
      isResolved: null,
      isOutdated: null,
      comments: [toGithubIssueComment(issue)],
      providerContext: {
        remoteDiscussionId: String(issue.id),
        remoteCommentIds: [String(issue.id)],
        anchorRefs: {},
      },
    });
  }

  return threads;
}

export function normalizeGitLabRemoteThreads(
  discussions: GitlabDiscussion[],
): ReviewRemoteThread[] {
  const threads: ReviewRemoteThread[] = [];

  for (const discussion of discussions) {
    if (discussion.notes.length === 0) {
      continue;
    }

    const firstNote = discussion.notes[0];
    const position = firstNote?.position;
    const comments: ReviewRemoteComment[] = discussion.notes.map((note) => ({
      providerCommentId: `gitlab-note:${note.id}`,
      author: toGitlabAuthor(note.author),
      body: note.body,
      url: null,
      createdAt: note.created_at,
      updatedAt: note.updated_at ?? null,
    }));

    const isResolved = discussion.notes.some((n) => n.resolved === true)
      ? true
      : discussion.notes.every((n) => n.resolved === false)
        ? false
        : null;

    if (!position || (!position.new_path && !position.old_path)) {
      threads.push({
        providerThreadId: `gitlab-discussion:${discussion.id}`,
        location: { kind: 'overview' },
        anchorStatus: 'overview',
        isResolved,
        isOutdated: null,
        comments,
        providerContext: {
          remoteDiscussionId: discussion.id,
          remoteCommentIds: discussion.notes.map((n) => String(n.id)),
          anchorRefs: {},
        },
      });
      continue;
    }

    const filePath = position.new_path || position.old_path || '';
    const side: 'LEFT' | 'RIGHT' = position.line_type === 'old' ? 'LEFT' : 'RIGHT';
    const endLine = side === 'RIGHT' ? (position.new_line ?? null) : (position.old_line ?? null);

    const location: ReviewRemoteThreadLocation = {
      kind: 'diff',
      filePath,
      oldPath: position.old_path ?? null,
      startLine: null,
      endLine,
      side,
    };

    threads.push({
      providerThreadId: `gitlab-discussion:${discussion.id}`,
      location,
      anchorStatus: 'current',
      isResolved,
      isOutdated: null,
      comments,
      providerContext: {
        remoteDiscussionId: discussion.id,
        remoteCommentIds: discussion.notes.map((n) => String(n.id)),
        anchorRefs: {
          base_sha: position.base_sha,
          head_sha: position.head_sha,
          start_sha: position.start_sha,
          line_range: position.line_range,
        },
      },
    });
  }

  return threads;
}
