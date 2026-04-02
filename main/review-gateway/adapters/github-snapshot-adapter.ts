import type { GitHubPRFile, GitHubPRReviewComment } from '../../../shared/domain/review-provider';
import type {
  ReviewComment,
  ReviewDiscussionLocation,
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSnapshotThread,
  ReviewSourceDraft,
  ReviewSourceLocator,
} from '../../../shared/domain/review';
import { inferLanguage } from '../infer-language';
import type { GitHubPullRequestDetail, GitHubIssueComment } from '../clients/github-review-client';

const LARGE_DIFF_THRESHOLD = 500;

function isBinaryLike(file: GitHubPRFile): boolean {
  return (
    file.patch === undefined && file.changes === 0 && file.additions === 0 && file.deletions === 0
  );
}

function mapChangeType(status: GitHubPRFile['status']): ReviewSnapshotFile['changeType'] {
  switch (status) {
    case 'added':
      return 'added';
    case 'removed':
      return 'deleted';
    case 'renamed':
    case 'copied':
      return 'renamed';
    default:
      return 'modified';
  }
}

function createFileId(locator: ReviewSourceLocator, reviewId: string, filePath: string): string {
  return `${locator.provider}:${locator.host}:${reviewId}:${filePath}`;
}

function toComment(
  comment: GitHubPRReviewComment | GitHubIssueComment,
  filePath: string | null,
): ReviewComment {
  const position =
    'path' in comment
      ? {
          filePath: filePath ?? comment.path,
          startLine: comment.start_line,
          endLine: comment.line,
          side: comment.side === 'LEFT' ? ('old' as const) : ('new' as const),
        }
      : null;

  return {
    commentId: String(comment.id),
    author: comment.user.login,
    body: comment.body,
    createdAt: comment.created_at,
    position,
  };
}

function buildDiffThread(
  root: GitHubPRReviewComment,
  replies: GitHubPRReviewComment[],
  fileId: string,
  providerContext: Record<string, unknown>,
): ReviewSnapshotThread {
  const location: ReviewDiscussionLocation = {
    kind: 'diff',
    fileId,
    filePath: root.path,
    startLine: root.start_line,
    endLine: root.line,
    side: root.side === 'LEFT' ? 'old' : 'new',
  };

  return {
    threadId: `github-review-comment-${root.id}`,
    location,
    comments: [root, ...replies].map((comment) => toComment(comment, root.path)),
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: String(root.id),
      remoteCommentIds: [root.id, ...replies.map((reply) => reply.id)].map(String),
      anchorRefs: providerContext,
    },
  };
}

function buildOverviewThread(comment: GitHubIssueComment): ReviewSnapshotThread {
  return {
    threadId: `github-issue-comment-${comment.id}`,
    location: {
      kind: 'overview',
    },
    comments: [toComment(comment, null)],
    isResolved: false,
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: String(comment.id),
      remoteCommentIds: [String(comment.id)],
      anchorRefs: {
        commentId: comment.id,
      },
    },
  };
}

export function adaptGitHubSnapshot(args: {
  snapshotId: string;
  source: ReviewSourceDraft;
  locator: ReviewSourceLocator;
  detail: GitHubPullRequestDetail;
  files: GitHubPRFile[];
  reviewComments: GitHubPRReviewComment[];
  issueComments: GitHubIssueComment[];
}): ReviewSnapshot {
  const commentMap = new Map<number, GitHubPRReviewComment[]>();
  const roots = args.reviewComments.filter((comment) => comment.in_reply_to_id === undefined);

  for (const comment of args.reviewComments) {
    if (comment.in_reply_to_id === undefined) {
      continue;
    }
    const existing = commentMap.get(comment.in_reply_to_id) ?? [];
    existing.push(comment);
    commentMap.set(comment.in_reply_to_id, existing);
  }

  const files = args.files.map<ReviewSnapshotFile>((file) => {
    const filePath = file.filename;
    return {
      fileId: createFileId(args.locator, String(args.detail.number), filePath),
      filePath,
      oldFilePath: file.previous_filename ?? null,
      changeType: mapChangeType(file.status),
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch ?? null,
      isLargeDiff: file.patch === undefined || file.changes >= LARGE_DIFF_THRESHOLD,
      isBinary: isBinaryLike(file),
      contentStatus: 'idle',
      oldContent: '',
      newContent: '',
      language: inferLanguage(filePath),
      providerContext: {
        remotePath: filePath,
        oldRemotePath: file.previous_filename ?? undefined,
        remoteFileId: file.sha,
      },
    };
  });

  const diffThreads = roots.flatMap((comment) => {
    const file = files.find((item) => item.filePath === comment.path);
    if (!file) {
      return [];
    }
    return [
      buildDiffThread(comment, commentMap.get(comment.id) ?? [], file.fileId, {
        path: comment.path,
        line: comment.line,
        start_line: comment.start_line,
        side: comment.side,
        commit_id: comment.commit_id,
        original_commit_id: comment.original_commit_id,
        diff_hunk: comment.diff_hunk,
      }),
    ];
  });

  const overviewThreads = args.issueComments.map(buildOverviewThread);

  return {
    snapshotId: args.snapshotId,
    provider: 'github',
    reviewId: String(args.detail.number),
    title: args.detail.title,
    description: args.detail.body ?? '',
    baseSha: args.detail.base.sha,
    headSha: args.detail.head.sha,
    files,
    discussions: [...diffThreads, ...overviewThreads],
    providerContext: {
      host: args.source.host,
      reviewUrl: args.source.reviewUrl,
      anchorRefs: {
        provider: 'github',
        pullNumber: args.detail.number,
        comments: Object.fromEntries(
          args.reviewComments.map((comment) => [
            String(comment.id),
            {
              path: comment.path,
              line: comment.line,
              start_line: comment.start_line,
              side: comment.side,
              in_reply_to_id: comment.in_reply_to_id ?? null,
              commit_id: comment.commit_id ?? null,
              original_commit_id: comment.original_commit_id ?? null,
              diff_hunk: comment.diff_hunk ?? null,
            },
          ]),
        ),
      },
    },
  };
}
