import { describe, expect, it, vi } from 'vitest';
import type { ReviewDraftStructuredResult } from '../../shared/domain/review-draft';
import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import { ReviewResultNormalizer } from './review-result-normalizer';

function createSnapshot(): ReviewSnapshot {
  return {
    snapshotId: 'snapshot-1',
    provider: 'github',
    reviewId: '42',
    title: 'Review title',
    description: '',
    baseSha: 'base',
    headSha: 'head',
    files: [
      {
        fileId: 'file-1',
        filePath: 'src/new.ts',
        oldFilePath: 'src/old.ts',
        changeType: 'renamed',
        additions: 3,
        deletions: 1,
        patch: '@@ -1,2 +1,3 @@',
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'loaded',
        oldContent: 'const oldValue = 1;\nreturn oldValue;\n',
        newContent: 'const newValue = 1;\nreturn newValue;\nconsole.log(newValue);\n',
        language: 'ts',
        providerContext: {
          remotePath: 'src/new.ts',
          oldRemotePath: 'src/old.ts',
        },
      },
      {
        fileId: 'file-2',
        filePath: 'src/deleted.ts',
        oldFilePath: null,
        changeType: 'deleted',
        additions: 0,
        deletions: 4,
        patch: '@@ -1,4 +0,0 @@',
        isLargeDiff: false,
        isBinary: false,
        contentStatus: 'loaded',
        oldContent: 'a\nb\nc\nd\n',
        newContent: '',
        language: 'ts',
        providerContext: {
          remotePath: 'src/deleted.ts',
        },
      },
    ],
    discussions: [],
    providerContext: {
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/acme/repo/pull/42',
      anchorRefs: {},
    },
  };
}

function createResult(): ReviewDraftStructuredResult {
  return {
    type: 'review-draft',
    summary: {
      headline: 'headline',
      overview: 'overview',
      positives: [],
      risks: [],
    },
    findings: [
      {
        findingId: 'f1',
        title: 'rename path is accepted',
        body: 'body',
        severity: 'medium',
        category: 'maintainability',
        confidence: 'high',
        location: {
          kind: 'diff',
          filePath: 'src/old.ts',
          startLine: 1,
          endLine: 2,
          side: 'old',
          excerpt: 'const oldValue = 1;',
        },
      },
      {
        findingId: 'f2',
        title: 'invalid line falls back to overview',
        body: 'body',
        severity: 'high',
        category: 'correctness',
        confidence: 'medium',
        location: {
          kind: 'diff',
          filePath: 'src/new.ts',
          startLine: 99,
          endLine: 100,
          side: 'new',
        },
      },
      {
        findingId: 'f3',
        title: 'unknown file falls back to overview',
        body: 'body',
        severity: 'low',
        category: 'docs',
        confidence: 'low',
        location: {
          kind: 'diff',
          filePath: 'src/missing.ts',
          startLine: 1,
          endLine: 1,
          side: 'new',
        },
      },
    ],
  };
}

describe('ReviewResultNormalizer', () => {
  it('resolves valid diff anchors, including renamed files', async () => {
    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot: createSnapshot(),
      runId: 'run-1',
      structuredResult: createResult(),
    });

    expect(threads[0]?.anchor?.fileId).toBe('file-1');
    expect(threads[0]?.resolvedLocation.kind).toBe('diff');
  });

  it('downgrades invalid anchors to overview findings', async () => {
    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot: createSnapshot(),
      runId: 'run-1',
      structuredResult: createResult(),
    });

    expect(threads[1]?.anchor).toBeNull();
    expect(threads[1]?.resolvedLocation).toEqual({ kind: 'overview' });
    expect(threads[1]?.debugDowngrade?.reason).toBe('lineOutOfRange');
    expect(threads[1]?.debugDowngrade?.requestedFilePath).toBe('src/new.ts');
    expect(threads[1]?.debugDowngrade?.requestedSide).toBe('new');

    expect(threads[2]?.anchor).toBeNull();
    expect(threads[2]?.resolvedLocation).toEqual({ kind: 'overview' });
    expect(threads[2]?.debugDowngrade?.reason).toBe('fileNotFound');
    expect(threads[2]?.debugDowngrade?.requestedFilePath).toBe('src/missing.ts');
  });

  it('does not attach debugDowngrade to findings that were originally overview', async () => {
    const normalizer = new ReviewResultNormalizer();
    const result: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: { headline: 'h', overview: 'o', positives: [], risks: [] },
      findings: [
        {
          findingId: 'f-overview',
          title: 'intentional overview',
          body: 'body',
          severity: 'low',
          category: 'docs',
          confidence: 'low',
          location: { kind: 'overview' },
        },
      ],
    };
    const threads = await normalizer.normalize({
      snapshot: createSnapshot(),
      runId: 'run-1',
      structuredResult: result,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('overview');
    expect(threads[0]?.debugDowngrade).toBeUndefined();
  });

  it('attaches ineligibleSide reason when side mismatches changeType', async () => {
    const snapshot = createSnapshot();
    const result: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: { headline: 'h', overview: 'o', positives: [], risks: [] },
      findings: [
        {
          findingId: 'f-side',
          title: 'new side on deleted file',
          body: 'body',
          severity: 'low',
          category: 'docs',
          confidence: 'low',
          location: {
            kind: 'diff',
            filePath: 'src/deleted.ts',
            startLine: 1,
            endLine: 1,
            side: 'new',
          },
        },
      ],
    };
    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-side',
      structuredResult: result,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('overview');
    expect(threads[0]?.debugDowngrade?.reason).toBe('ineligibleSide');
    expect(threads[0]?.debugDowngrade?.requestedFilePath).toBe('src/deleted.ts');
    expect(threads[0]?.debugDowngrade?.requestedSide).toBe('new');
  });

  it('attaches binaryFile reason for binary files', async () => {
    const snapshot = createSnapshot();
    (snapshot.files[0] as (typeof snapshot.files)[0]).isBinary = true;
    const result: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: { headline: 'h', overview: 'o', positives: [], risks: [] },
      findings: [
        {
          findingId: 'f-bin',
          title: 'binary file finding',
          body: 'body',
          severity: 'low',
          category: 'docs',
          confidence: 'low',
          location: {
            kind: 'diff',
            filePath: 'src/new.ts',
            startLine: 1,
            endLine: 1,
            side: 'new',
          },
        },
      ],
    };
    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-bin',
      structuredResult: result,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('overview');
    expect(threads[0]?.debugDowngrade?.reason).toBe('binaryFile');
  });

  it('keeps diff anchors even when excerpt is missing from content', async () => {
    const snapshot = createSnapshot();
    const result: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: { headline: 'h', overview: 'o', positives: [], risks: [] },
      findings: [
        {
          findingId: 'f-excerpt',
          title: 'stale excerpt finding',
          body: 'body',
          severity: 'medium',
          category: 'correctness',
          confidence: 'medium',
          location: {
            kind: 'diff',
            filePath: 'src/new.ts',
            startLine: 1,
            endLine: 1,
            side: 'new',
            excerpt: 'this text does not exist in the file',
          },
        },
      ],
    };
    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-excerpt',
      structuredResult: result,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('diff');
    expect(threads[0]?.anchor).toEqual(
      expect.objectContaining({
        fileId: 'file-1',
        filePath: 'src/new.ts',
        startLine: 1,
        endLine: 1,
        side: 'new',
      }),
    );
    expect(threads[0]?.debugDowngrade).toBeUndefined();
  });
});

describe('hydrateFile を使った lazy 解決', () => {
  function createSnapshotWithIdleFile(): ReviewSnapshot {
    return {
      snapshotId: 'snapshot-2',
      provider: 'github',
      reviewId: '99',
      title: 'Hydrate test',
      description: '',
      baseSha: 'base',
      headSha: 'head',
      files: [
        {
          fileId: 'file-idle',
          filePath: 'src/lazy.ts',
          oldFilePath: null,
          changeType: 'modified',
          additions: 2,
          deletions: 0,
          patch: '@@ -1,1 +1,3 @@',
          isLargeDiff: false,
          isBinary: false,
          contentStatus: 'idle',
          oldContent: '',
          newContent: '',
          language: 'ts',
          providerContext: {
            remotePath: 'src/lazy.ts',
          },
        },
        {
          fileId: 'file-added-idle',
          filePath: 'src/added.ts',
          oldFilePath: null,
          changeType: 'added',
          additions: 3,
          deletions: 0,
          patch: '@@ -0,0 +1,3 @@',
          isLargeDiff: false,
          isBinary: false,
          contentStatus: 'idle',
          oldContent: '',
          newContent: '',
          language: 'ts',
          providerContext: {
            remotePath: 'src/added.ts',
          },
        },
        {
          fileId: 'file-deleted-idle',
          filePath: 'src/deleted.ts',
          oldFilePath: null,
          changeType: 'deleted',
          additions: 0,
          deletions: 3,
          patch: '@@ -1,3 +0,0 @@',
          isLargeDiff: false,
          isBinary: false,
          contentStatus: 'idle',
          oldContent: '',
          newContent: '',
          language: 'ts',
          providerContext: {
            remotePath: 'src/deleted.ts',
          },
        },
      ],
      discussions: [],
      providerContext: {
        host: 'https://api.github.com',
        reviewUrl: 'https://github.com/acme/repo/pull/99',
        anchorRefs: {},
      },
    };
  }

  it('contentStatus が idle のファイルを hydrate してから diff anchor を解決する', async () => {
    const snapshot = createSnapshotWithIdleFile();
    const hydratedFile: ReviewSnapshotFile = {
      ...(snapshot.files[0] as ReviewSnapshotFile),
      contentStatus: 'loaded',
      oldContent: 'const x = 1;\n',
      newContent: 'const x = 1;\nconst y = 2;\nconst z = 3;\n',
    };

    const hydrateFile = vi.fn().mockResolvedValue(hydratedFile);

    const structuredResult: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: [],
        risks: [],
      },
      findings: [
        {
          findingId: 'f-lazy',
          title: 'finding on lazy file',
          body: 'body',
          severity: 'medium',
          category: 'maintainability',
          confidence: 'high',
          location: {
            kind: 'diff',
            filePath: 'src/lazy.ts',
            startLine: 2,
            endLine: 3,
            side: 'new',
          },
        },
      ],
    };

    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-hydrate',
      structuredResult,
      hydrateFile,
    });

    expect(hydrateFile).toHaveBeenCalledWith('file-idle');
    expect(threads[0]?.resolvedLocation.kind).toBe('diff');
    expect(threads[0]?.anchor?.fileId).toBe('file-idle');
  });

  it('hydrate 後も side 判定が正しく機能する（added file に old side は overview）', async () => {
    const snapshot = createSnapshotWithIdleFile();
    const hydratedAddedFile: ReviewSnapshotFile = {
      ...(snapshot.files[1] as ReviewSnapshotFile),
      contentStatus: 'loaded',
      oldContent: '',
      newContent: 'line1\nline2\nline3\n',
    };

    const hydrateFile = vi.fn().mockResolvedValue(hydratedAddedFile);

    const structuredResult: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: [],
        risks: [],
      },
      findings: [
        {
          findingId: 'f-added-old',
          title: 'old side on added file',
          body: 'body',
          severity: 'low',
          category: 'docs',
          confidence: 'low',
          location: {
            kind: 'diff',
            filePath: 'src/added.ts',
            startLine: 1,
            endLine: 1,
            side: 'old',
          },
        },
      ],
    };

    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-added',
      structuredResult,
      hydrateFile,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('overview');
    expect(threads[0]?.anchor).toBeNull();
    expect(threads[0]?.debugDowngrade?.reason).toBe('ineligibleSide');
    expect(threads[0]?.debugDowngrade?.requestedSide).toBe('old');
  });

  it('hydrate 後も side 判定が正しく機能する（deleted file に new side は overview）', async () => {
    const snapshot = createSnapshotWithIdleFile();
    const hydratedDeletedFile: ReviewSnapshotFile = {
      ...(snapshot.files[2] as ReviewSnapshotFile),
      contentStatus: 'loaded',
      oldContent: 'line1\nline2\nline3\n',
      newContent: '',
    };

    const hydrateFile = vi.fn().mockResolvedValue(hydratedDeletedFile);

    const structuredResult: ReviewDraftStructuredResult = {
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: [],
        risks: [],
      },
      findings: [
        {
          findingId: 'f-deleted-new',
          title: 'new side on deleted file',
          body: 'body',
          severity: 'low',
          category: 'docs',
          confidence: 'low',
          location: {
            kind: 'diff',
            filePath: 'src/deleted.ts',
            startLine: 1,
            endLine: 1,
            side: 'new',
          },
        },
      ],
    };

    const normalizer = new ReviewResultNormalizer();
    const threads = await normalizer.normalize({
      snapshot,
      runId: 'run-deleted',
      structuredResult,
      hydrateFile,
    });

    expect(threads[0]?.resolvedLocation.kind).toBe('overview');
    expect(threads[0]?.anchor).toBeNull();
    expect(threads[0]?.debugDowngrade?.reason).toBe('ineligibleSide');
    expect(threads[0]?.debugDowngrade?.requestedSide).toBe('new');
  });
});
