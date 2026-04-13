import type { ReviewAnchor, ReviewSnapshotFile } from '../../shared/domain/review';

export type AnchorValidationFailureReason =
  | 'emptyBody'
  | 'fileNotFound'
  | 'largeDiff'
  | 'binaryFile'
  | 'ineligibleSide'
  | 'nullLines'
  | 'lineOutOfRange'
  | 'startAfterEnd';

export type AnchorValidationResult =
  | { ok: true }
  | { ok: false; reason: AnchorValidationFailureReason; message: string };

export class ReviewAnchorValidator {
  validateBody(body: string): AnchorValidationResult {
    if (!body.trim()) {
      return { ok: false, reason: 'emptyBody', message: 'Body must not be empty.' };
    }
    return { ok: true };
  }

  validateDiffAnchor(anchor: ReviewAnchor, file: ReviewSnapshotFile): AnchorValidationResult {
    if (file.isLargeDiff) {
      return {
        ok: false,
        reason: 'largeDiff',
        message: `File "${file.filePath}" has a large diff. Use overview location instead.`,
      };
    }

    if (file.isBinary) {
      return {
        ok: false,
        reason: 'binaryFile',
        message: `File "${file.filePath}" is binary. Use overview location instead.`,
      };
    }

    const ineligible = this.getIneligibilityReason(file, anchor.side);
    if (ineligible) {
      return { ok: false, reason: 'ineligibleSide', message: ineligible };
    }

    if (anchor.startLine === null || anchor.endLine === null) {
      return {
        ok: false,
        reason: 'nullLines',
        message: 'Diff anchor requires startLine and endLine.',
      };
    }

    if (anchor.startLine > anchor.endLine) {
      return {
        ok: false,
        reason: 'startAfterEnd',
        message: `startLine (${anchor.startLine}) must not be greater than endLine (${anchor.endLine}).`,
      };
    }

    const content = anchor.side === 'old' ? file.oldContent : file.newContent;
    if (content) {
      const lineCount = content.split('\n').length;
      if (anchor.startLine < 1 || anchor.endLine > lineCount) {
        return {
          ok: false,
          reason: 'lineOutOfRange',
          message: `Lines ${anchor.startLine}-${anchor.endLine} are out of range (file has ${lineCount} lines).`,
        };
      }
    }

    return { ok: true };
  }

  private getIneligibilityReason(file: ReviewSnapshotFile, side: 'old' | 'new'): string | null {
    if (file.changeType === 'added' && side === 'old') {
      return `File "${file.filePath}" is newly added; old-side comments are not allowed.`;
    }
    if (file.changeType === 'deleted' && side === 'new') {
      return `File "${file.filePath}" is deleted; new-side comments are not allowed.`;
    }
    return null;
  }
}
