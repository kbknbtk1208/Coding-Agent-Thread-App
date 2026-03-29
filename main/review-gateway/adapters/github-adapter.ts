import type { GitHubPRFile, GitHubPRReviewComment } from '../../../shared/domain/review-provider';
import type {
  DiffChangeType,
  NormalizedDiffFile,
  NormalizedReviewData,
  ReviewAnchor,
  ReviewComment,
  ReviewThread,
} from '../../../shared/domain/review';
import { deriveAnchorKind } from '../../../shared/domain/review';
import { inferLanguage } from '../infer-language';

const LARGE_DIFF_THRESHOLD = 500;

function mapChangeType(status: GitHubPRFile['status']): DiffChangeType {
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

function buildThreads(
  comments: GitHubPRReviewComment[],
  filePath: string,
  fileId: string,
): ReviewThread[] {
  const fileComments = comments.filter((c) => c.path === filePath);
  const rootComments = fileComments.filter((c) => c.in_reply_to_id === undefined);
  const replyMap = new Map<number, GitHubPRReviewComment[]>();

  for (const c of fileComments) {
    if (c.in_reply_to_id !== undefined) {
      const existing = replyMap.get(c.in_reply_to_id);
      if (existing) {
        existing.push(c);
      } else {
        replyMap.set(c.in_reply_to_id, [c]);
      }
    }
  }

  return rootComments.map((root) => {
    const replies = replyMap.get(root.id) ?? [];
    const allComments: ReviewComment[] = [root, ...replies].map((c) => ({
      commentId: String(c.id),
      author: c.user.login,
      body: c.body,
      position: {
        filePath: c.path,
        startLine: c.start_line,
        endLine: c.line,
        side: c.side === 'LEFT' ? ('old' as const) : ('new' as const),
      },
      createdAt: c.created_at,
    }));

    const rootSide: 'old' | 'new' = root.side === 'LEFT' ? 'old' : 'new';
    const anchor: ReviewAnchor = {
      fileId,
      filePath: root.path,
      startLine: root.start_line,
      endLine: root.line,
      side: rootSide,
      kind: deriveAnchorKind(root.start_line, root.line),
    };

    return {
      threadId: `gh-thread-${root.id}`,
      anchor,
      comments: allComments,
      isResolved: false,
    };
  });
}

export function adaptGitHub(
  files: GitHubPRFile[],
  comments: GitHubPRReviewComment[],
  fileContents: Record<string, { oldContent: string; newContent: string }>,
  reviewId: string,
): NormalizedReviewData {
  const normalizedFiles: NormalizedDiffFile[] = files.map((file) => {
    const contents = fileContents[file.filename];
    const isLargeDiff = !file.patch || file.changes >= LARGE_DIFF_THRESHOLD;
    const fileId = `github-${reviewId}-${file.filename}`;

    return {
      fileId,
      filePath: file.filename,
      oldFilePath: file.previous_filename ?? null,
      changeType: mapChangeType(file.status),
      oldContent: contents?.oldContent ?? '',
      newContent: contents?.newContent ?? '',
      language: inferLanguage(file.filename),
      additions: file.additions,
      deletions: file.deletions,
      isLargeDiff,
      threads: buildThreads(comments, file.filename, fileId),
    };
  });

  return {
    reviewId,
    provider: 'github',
    title: 'Refactor date formatting and add Header component',
    description:
      'Replace legacy date formatter with modern implementation and add a reusable Header component.',
    files: normalizedFiles,
  };
}
