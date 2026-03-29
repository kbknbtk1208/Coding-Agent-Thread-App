export type ReviewProvider = 'github' | 'gitlab';

export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ReviewCommentPosition {
  filePath: string;
  /** Start line (1-based), null for file-level comments */
  startLine: number | null;
  /** End line (1-based), null for single-line comments */
  endLine: number | null;
  /** 'old' = left side, 'new' = right side */
  side: 'old' | 'new';
}

export interface ReviewAnchor {
  fileId: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  side: 'old' | 'new';
  kind: 'line' | 'range' | 'file';
}

export interface ReviewComment {
  commentId: string;
  author: string;
  body: string;
  position: ReviewCommentPosition;
  createdAt: string;
}

export interface ReviewThread {
  threadId: string;
  anchor: ReviewAnchor;
  comments: ReviewComment[];
  isResolved: boolean;
}

export interface NormalizedDiffFile {
  fileId: string;
  filePath: string;
  oldFilePath: string | null;
  changeType: DiffChangeType;
  oldContent: string;
  newContent: string;
  language: string;
  additions: number;
  deletions: number;
  isLargeDiff: boolean;
  threads: ReviewThread[];
}

export interface NormalizedReviewData {
  reviewId: string;
  provider: ReviewProvider;
  title: string;
  description: string;
  files: NormalizedDiffFile[];
}

/** Derive the anchor kind from start/end line numbers. */
export function deriveAnchorKind(
  startLine: number | null,
  endLine: number | null,
): ReviewAnchor['kind'] {
  if (startLine === null && endLine === null) return 'file';
  if (startLine !== null && endLine !== null && startLine !== endLine) return 'range';
  return 'line';
}
