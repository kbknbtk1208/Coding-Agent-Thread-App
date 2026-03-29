import type {
  GitLabDiscussion,
  GitLabMRDiff,
  GitLabNote,
} from '../../../shared/domain/review-provider';
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

function mapChangeType(diff: GitLabMRDiff): DiffChangeType {
  if (diff.new_file) return 'added';
  if (diff.deleted_file) return 'deleted';
  if (diff.renamed_file) return 'renamed';
  return 'modified';
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  const lines = diff.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }
  return { additions, deletions };
}

function noteToComment(note: GitLabNote): ReviewComment {
  const position = note.position;
  let startLine: number | null = null;
  let endLine: number | null = null;
  let side: 'old' | 'new' = 'new';

  if (position) {
    if (position.line_range) {
      startLine = position.line_range.start.new_line ?? position.line_range.start.old_line;
      endLine = position.line_range.end.new_line ?? position.line_range.end.old_line;
      side = position.line_range.start.type === 'old' ? 'old' : 'new';
    } else {
      endLine = position.new_line ?? position.old_line;
      startLine = null;
      side = position.new_line !== null ? 'new' : 'old';
    }
  }

  return {
    commentId: String(note.id),
    author: note.author.username,
    body: note.body,
    position: {
      filePath: position?.new_path ?? '',
      startLine,
      endLine,
      side,
    },
    createdAt: note.created_at,
  };
}

function buildThreads(
  discussions: GitLabDiscussion[],
  filePath: string,
  fileId: string,
): ReviewThread[] {
  return discussions
    .filter((disc) => {
      const firstNote = disc.notes[0];
      return (
        firstNote?.position?.new_path === filePath || firstNote?.position?.old_path === filePath
      );
    })
    .map((disc) => {
      const firstNote = disc.notes[0];
      const isResolved = firstNote ? firstNote.resolved : false;
      const rootComment = noteToComment(firstNote);

      const anchor: ReviewAnchor = {
        fileId,
        filePath: rootComment.position.filePath,
        startLine: rootComment.position.startLine,
        endLine: rootComment.position.endLine,
        side: rootComment.position.side,
        kind: deriveAnchorKind(rootComment.position.startLine, rootComment.position.endLine),
      };

      return {
        threadId: `gl-thread-${disc.id}`,
        anchor,
        comments: disc.notes.map(noteToComment),
        isResolved,
      };
    });
}

export function adaptGitLab(
  diffs: GitLabMRDiff[],
  discussions: GitLabDiscussion[],
  fileContents: Record<string, { oldContent: string; newContent: string }>,
  reviewId: string,
): NormalizedReviewData {
  const normalizedFiles: NormalizedDiffFile[] = diffs.map((diff) => {
    const contents = fileContents[diff.new_path] ?? fileContents[diff.old_path];
    const { additions, deletions } = countDiffLines(diff.diff);
    const isLargeDiff = diff.collapsed || diff.too_large;
    const fileId = `gitlab-${reviewId}-${diff.new_path}`;

    return {
      fileId,
      filePath: diff.new_path,
      oldFilePath: diff.renamed_file ? diff.old_path : null,
      changeType: mapChangeType(diff),
      oldContent: contents?.oldContent ?? '',
      newContent: contents?.newContent ?? '',
      language: inferLanguage(diff.new_path),
      additions,
      deletions,
      isLargeDiff,
      threads: buildThreads(discussions, diff.new_path, fileId),
    };
  });

  return {
    reviewId,
    provider: 'gitlab',
    title: 'Add session TTL and expiration support',
    description:
      'Introduce time-based session validity with configurable TTL and refresh capability.',
    files: normalizedFiles,
  };
}
