import type {
  GitLabDiscussion,
  GitLabMRDiff,
  GitLabNote,
} from '../../../shared/domain/review-provider';
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
import type { GitLabMergeRequestDetail } from '../clients/gitlab-review-client';

function mapChangeType(diff: GitLabMRDiff): ReviewSnapshotFile['changeType'] {
  if (diff.new_file) return 'added';
  if (diff.deleted_file) return 'deleted';
  if (diff.renamed_file) return 'renamed';
  return 'modified';
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

function createFileId(locator: ReviewSourceLocator, reviewId: string, filePath: string): string {
  return `${locator.provider}:${locator.host}:${reviewId}:${filePath}`;
}

function noteToComment(note: GitLabNote, filePath: string | null): ReviewComment {
  const position = note.position;
  let commentPosition: ReviewComment['position'] = null;
  if (position) {
    const startLine = position.line_range
      ? (position.line_range.start.new_line ?? position.line_range.start.old_line)
      : null;
    const endLine = position.line_range
      ? (position.line_range.end.new_line ?? position.line_range.end.old_line)
      : (position.new_line ?? position.old_line);
    commentPosition = {
      filePath: filePath ?? position.new_path,
      startLine,
      endLine,
      side: position.line_range?.start.type === 'old' || position.old_line !== null ? 'old' : 'new',
    };
  }

  return {
    commentId: String(note.id),
    author: note.author.username,
    body: note.body,
    createdAt: note.created_at,
    position: commentPosition,
  };
}

function buildThread(
  discussion: GitLabDiscussion,
  file: ReviewSnapshotFile | null,
): ReviewSnapshotThread {
  const firstNote = discussion.notes[0];
  const position = firstNote?.position;
  const location: ReviewDiscussionLocation = position
    ? {
        kind: 'diff',
        fileId: file?.fileId ?? '',
        filePath: position.new_path,
        startLine: position.line_range
          ? (position.line_range.start.new_line ?? position.line_range.start.old_line)
          : null,
        endLine: position.line_range
          ? (position.line_range.end.new_line ?? position.line_range.end.old_line)
          : (position.new_line ?? position.old_line),
        side:
          position.line_range?.start.type === 'old' || position.old_line !== null ? 'old' : 'new',
      }
    : {
        kind: 'overview',
      };

  return {
    threadId: `gitlab-discussion-${discussion.id}`,
    location,
    comments: discussion.notes.map((note) => noteToComment(note, position?.new_path ?? null)),
    isResolved: Boolean(firstNote?.resolved),
    isOutdated: false,
    providerContext: {
      remoteDiscussionId: discussion.id,
      remoteCommentIds: discussion.notes.map((note) => String(note.id)),
      anchorRefs: {
        notes: discussion.notes.map((note) => ({
          id: note.id,
          position: note.position ?? null,
          resolved: note.resolved,
        })),
      },
    },
  };
}

export function adaptGitLabSnapshot(args: {
  snapshotId: string;
  source: ReviewSourceDraft;
  locator: ReviewSourceLocator;
  detail: GitLabMergeRequestDetail;
  diffs: GitLabMRDiff[];
  discussions: GitLabDiscussion[];
}): ReviewSnapshot {
  const files = args.diffs.map<ReviewSnapshotFile>((diff) => {
    const filePath = diff.new_path;
    const { additions, deletions } = countDiffLines(diff.diff);
    return {
      fileId: createFileId(args.locator, String(args.detail.iid), filePath),
      filePath,
      oldFilePath: diff.renamed_file ? diff.old_path : null,
      changeType: mapChangeType(diff),
      additions,
      deletions,
      patch: diff.diff || null,
      isLargeDiff: diff.collapsed || diff.too_large,
      isBinary: false,
      contentStatus: 'idle',
      oldContent: '',
      newContent: '',
      language: inferLanguage(filePath),
      providerContext: {
        remotePath: diff.new_path,
        oldRemotePath: diff.old_path,
      },
    };
  });

  const fileByPath = new Map(files.map((file) => [file.filePath, file]));
  const discussionsNormalized = args.discussions.map((discussion) => {
    const firstNote = discussion.notes[0];
    const position = firstNote?.position;
    const targetPath = position?.new_path ?? position?.old_path ?? null;
    const file = targetPath ? (fileByPath.get(targetPath) ?? null) : null;
    return buildThread(discussion, file);
  });

  return {
    snapshotId: args.snapshotId,
    provider: 'gitlab',
    reviewId: String(args.detail.iid),
    title: args.detail.title,
    description: args.detail.description ?? '',
    baseSha: args.detail.diff_refs.base_sha,
    headSha: args.detail.diff_refs.head_sha,
    files,
    discussions: discussionsNormalized,
    providerContext: {
      host: args.source.host,
      reviewUrl: args.source.reviewUrl,
      anchorRefs: {
        provider: 'gitlab',
        mergeRequestIid: args.detail.iid,
        start_sha: args.detail.diff_refs.start_sha ?? null,
        discussions: Object.fromEntries(
          args.discussions.map((discussion) => [
            discussion.id,
            {
              notes: discussion.notes.map((note) => ({
                id: note.id,
                position: note.position ?? null,
                resolved: note.resolved,
              })),
            },
          ]),
        ),
      },
    },
  };
}
