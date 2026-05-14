import type { Poc3InlineCommentAnchor } from '../../../shared/poc3-domain/comment-publish';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';

export interface AnchorValidationResult {
  ok: boolean;
  message: string;
}

export function validateCommentBody(body: string): AnchorValidationResult {
  if (body.trim().length === 0) {
    return { ok: false, message: 'コメント本文を入力してください。' };
  }
  return { ok: true, message: '' };
}

export function validateInlineCommentAnchor(
  anchor: Poc3InlineCommentAnchor,
  sourceSnapshot: ReviewSourceSnapshot,
): AnchorValidationResult {
  if (anchor.endLine < 1) {
    return { ok: false, message: '行番号は 1 以上である必要があります。' };
  }
  if (anchor.startLine !== null && anchor.startLine > anchor.endLine) {
    return { ok: false, message: '開始行は終了行以下である必要があります。' };
  }

  const matchedFile = sourceSnapshot.changedFiles.find(
    (f) => f.path === anchor.filePath || f.oldPath === anchor.filePath,
  );
  if (!matchedFile) {
    return {
      ok: false,
      message: '現在の diff 上に存在しない行です。refresh 後に再選択してください。',
    };
  }

  const hunks = matchedFile.hunks;
  if (hunks.length === 0) {
    return {
      ok: false,
      message: '現在の diff 上に存在しない行です。refresh 後に再選択してください。',
    };
  }

  const startLine = anchor.startLine ?? anchor.endLine;
  const endLine = anchor.endLine;
  const isRight = anchor.side === 'RIGHT';

  const lineInHunk = (line: number): boolean => {
    for (const hunk of hunks) {
      if (isRight) {
        const hunkEnd = hunk.newStart + Math.max(hunk.newLines - 1, 0);
        if (line >= hunk.newStart && line <= hunkEnd) {
          return true;
        }
      } else {
        const hunkEnd = hunk.oldStart + Math.max(hunk.oldLines - 1, 0);
        if (line >= hunk.oldStart && line <= hunkEnd) {
          return true;
        }
      }
    }
    return false;
  };

  if (!lineInHunk(startLine) || !lineInHunk(endLine)) {
    return {
      ok: false,
      message: '現在の diff 上に存在しない行です。refresh 後に再選択してください。',
    };
  }

  return { ok: true, message: '' };
}
