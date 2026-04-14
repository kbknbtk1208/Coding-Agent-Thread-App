import { describe, expect, it } from 'vitest';
import type { ReviewAnchor, ReviewSnapshotFile } from '../../shared/domain/review';
import { ReviewAnchorValidator } from './review-anchor-validator';

function createFile(overrides: Partial<ReviewSnapshotFile> = {}): ReviewSnapshotFile {
  return {
    fileId: 'file-1',
    filePath: 'src/utils.ts',
    changeType: 'modified',
    isBinary: false,
    isLargeDiff: false,
    patch: null,
    additions: 3,
    deletions: 1,
    oldFilePath: null,
    language: 'typescript',
    oldContent: 'line 1\nline 2\nline 3\nline 4',
    newContent: 'line 1\nline 2\nline 3 updated\nline 4\nline 5',
    contentStatus: 'loaded',
    providerContext: {
      remotePath: 'src/utils.ts',
    },
    ...overrides,
  };
}

function createAnchor(overrides: Partial<ReviewAnchor> = {}): ReviewAnchor {
  return {
    kind: 'line',
    fileId: 'file-1',
    filePath: 'src/utils.ts',
    startLine: 2,
    endLine: 2,
    side: 'new',
    ...overrides,
  };
}

describe('ReviewAnchorValidator', () => {
  const validator = new ReviewAnchorValidator();

  describe('validateBody', () => {
    it('accepts non-empty body', () => {
      expect(validator.validateBody('Some review comment')).toEqual({ ok: true });
    });

    it('rejects empty string body', () => {
      const result = validator.validateBody('');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('emptyBody');
    });

    it('rejects whitespace-only body', () => {
      const result = validator.validateBody('   \n  ');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('emptyBody');
    });
  });

  describe('validateDiffAnchor', () => {
    it('accepts a valid line anchor on a modified file', () => {
      expect(validator.validateDiffAnchor(createAnchor(), createFile())).toEqual({ ok: true });
    });

    it('rejects binary files', () => {
      const result = validator.validateDiffAnchor(createAnchor(), createFile({ isBinary: true }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('binaryFile');
    });

    it('rejects large diff files', () => {
      const result = validator.validateDiffAnchor(
        createAnchor(),
        createFile({ isLargeDiff: true }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('largeDiff');
    });

    it('rejects old-side anchor on an added file', () => {
      const result = validator.validateDiffAnchor(
        createAnchor({ side: 'old' }),
        createFile({ changeType: 'added' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('ineligibleSide');
    });

    it('rejects new-side anchor on a deleted file', () => {
      const result = validator.validateDiffAnchor(
        createAnchor({ side: 'new' }),
        createFile({ changeType: 'deleted' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('ineligibleSide');
    });

    it('rejects null startLine or endLine', () => {
      const result = validator.validateDiffAnchor(
        createAnchor({ startLine: null, endLine: null }),
        createFile(),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('nullLines');
    });

    it('rejects startLine greater than endLine', () => {
      const result = validator.validateDiffAnchor(
        createAnchor({ startLine: 5, endLine: 2 }),
        createFile(),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('startAfterEnd');
    });

    it('rejects lines out of range when file content is loaded', () => {
      const file = createFile({ newContent: 'line 1\nline 2\nline 3' }); // 3 lines
      const result = validator.validateDiffAnchor(
        createAnchor({ startLine: 2, endLine: 5, side: 'new' }),
        file,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('lineOutOfRange');
    });

    it('skips line range check when content is not loaded', () => {
      const file = createFile({ newContent: '', oldContent: '', contentStatus: 'idle' });
      expect(
        validator.validateDiffAnchor(createAnchor({ startLine: 1, endLine: 99 }), file),
      ).toEqual({ ok: true });
    });

    it('accepts range anchors spanning multiple lines', () => {
      const file = createFile({ newContent: 'a\nb\nc\nd\ne' });
      expect(
        validator.validateDiffAnchor(
          createAnchor({ kind: 'range', startLine: 2, endLine: 4 }),
          file,
        ),
      ).toEqual({ ok: true });
    });
  });
});
