import { randomUUID } from 'crypto';
import {
  deriveAnchorKind,
  type ReviewAnchor,
  type ReviewDiscussionLocation,
  type ReviewSnapshot,
  type ReviewSnapshotFile,
} from '../../shared/domain/review';
import type {
  ReviewDraftStructuredResult,
  ReviewFindingDraft,
  ReviewThreadDraft,
} from '../../shared/domain/review-draft';

type ReviewResultNormalizerInputBase = {
  snapshot: ReviewSnapshot;
  runId: string;
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
};

export type ReviewResultNormalizerInput =
  | (ReviewResultNormalizerInputBase & {
      structuredResult: ReviewDraftStructuredResult;
      result?: never;
    })
  | (ReviewResultNormalizerInputBase & {
      result: ReviewDraftStructuredResult;
      structuredResult?: never;
    });

export class ReviewResultNormalizer {
  normalize(input: ReviewResultNormalizerInput): Promise<ReviewThreadDraft[]> {
    const structuredResult = input.structuredResult ?? input.result;

    if (!input.hydrateFile) {
      return Promise.resolve(
        structuredResult.findings.map((finding) =>
          this.buildThread(
            input.snapshot,
            input.runId,
            finding,
            this.resolveFindingSync(input.snapshot, finding),
          ),
        ),
      );
    }

    const hydrateFile = input.hydrateFile;
    const hydrateCache = new Map<string, Promise<ReviewSnapshotFile>>();

    const cachedHydrate = (fileId: string): Promise<ReviewSnapshotFile> => {
      const cached = hydrateCache.get(fileId);
      if (cached) {
        return cached;
      }
      const promise = hydrateFile(fileId);
      hydrateCache.set(fileId, promise);
      return promise;
    };

    return Promise.all(
      structuredResult.findings.map(async (finding) =>
        this.buildThread(
          input.snapshot,
          input.runId,
          finding,
          await this.resolveFindingAsync(input.snapshot, finding, cachedHydrate),
        ),
      ),
    );
  }

  private buildThread(
    snapshot: ReviewSnapshot,
    runId: string,
    finding: ReviewFindingDraft,
    resolved: { location: ReviewDiscussionLocation; anchor: ReviewAnchor | null },
  ): ReviewThreadDraft {
    return {
      localThreadId: `local-review-draft-${randomUUID()}`,
      snapshotId: snapshot.snapshotId,
      runId,
      findingId: finding.findingId,
      source: 'ai-review',
      state: 'draft',
      severity: finding.severity,
      category: finding.category,
      confidence: finding.confidence,
      title: finding.title,
      draftBody: this.composeDraftBody(finding),
      suggestion: finding.suggestion,
      resolvedLocation: resolved.location,
      anchor: resolved.anchor,
    };
  }

  private async resolveFindingAsync(
    snapshot: ReviewSnapshot,
    finding: ReviewFindingDraft,
    hydrateFile: (fileId: string) => Promise<ReviewSnapshotFile>,
  ): Promise<{ location: ReviewDiscussionLocation; anchor: ReviewAnchor | null }> {
    if (finding.location.kind === 'overview') {
      return this.toOverviewResult();
    }

    const matchedFile = this.findMatchingFile(snapshot, finding);
    if (!matchedFile || !this.isEligibleDiffFile(matchedFile, finding.location.side)) {
      return this.toOverviewResult();
    }

    const file =
      matchedFile.contentStatus === 'loaded' ? matchedFile : await hydrateFile(matchedFile.fileId);
    return this.resolveDiffLocation(file, finding);
  }

  private resolveFindingSync(
    snapshot: ReviewSnapshot,
    finding: ReviewFindingDraft,
  ): { location: ReviewDiscussionLocation; anchor: ReviewAnchor | null } {
    if (finding.location.kind === 'overview') {
      return this.toOverviewResult();
    }

    const matchedFile = this.findMatchingFile(snapshot, finding);
    if (!matchedFile || !this.isEligibleDiffFile(matchedFile, finding.location.side)) {
      return this.toOverviewResult();
    }

    return this.resolveDiffLocation(matchedFile, finding);
  }

  private findMatchingFile(
    snapshot: ReviewSnapshot,
    finding: ReviewFindingDraft,
  ): ReviewSnapshotFile | null {
    if (finding.location.kind !== 'diff') {
      return null;
    }

    const targetFilePath = finding.location.filePath;
    return (
      snapshot.files.find(
        (file) => file.filePath === targetFilePath || file.oldFilePath === targetFilePath,
      ) ?? null
    );
  }

  private resolveDiffLocation(
    file: ReviewSnapshotFile,
    finding: ReviewFindingDraft,
  ): { location: ReviewDiscussionLocation; anchor: ReviewAnchor | null } {
    if (finding.location.kind !== 'diff') {
      return this.toOverviewResult();
    }

    const content = finding.location.side === 'old' ? file.oldContent : file.newContent;
    const lines = splitLines(content);

    if (!this.areLinesValid(finding.location.startLine, finding.location.endLine, lines.length)) {
      return this.toOverviewResult();
    }

    if (finding.location.excerpt && !content.includes(normalizeExcerpt(finding.location.excerpt))) {
      return this.toOverviewResult();
    }

    const anchor: ReviewAnchor = {
      fileId: file.fileId,
      filePath: file.filePath,
      startLine: finding.location.startLine,
      endLine: finding.location.endLine,
      side: finding.location.side,
      kind: deriveAnchorKind(finding.location.startLine, finding.location.endLine),
    };

    return {
      anchor,
      location: {
        kind: 'diff',
        fileId: file.fileId,
        filePath: file.filePath,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        side: anchor.side,
      },
    };
  }

  private composeDraftBody(finding: ReviewFindingDraft): string {
    return finding.suggestion
      ? `${finding.body}\n\nSuggestion:\n${finding.suggestion}`
      : finding.body;
  }

  private toOverviewResult(): { location: ReviewDiscussionLocation; anchor: null } {
    return {
      location: {
        kind: 'overview',
      },
      anchor: null,
    };
  }

  private isEligibleDiffFile(file: ReviewSnapshotFile, side: 'old' | 'new'): boolean {
    if (!this.isValidSideForChangeType(file, side)) {
      return false;
    }

    return !file.isBinary && !file.isLargeDiff;
  }

  private isValidSideForChangeType(file: ReviewSnapshotFile, side: 'old' | 'new'): boolean {
    if (file.changeType === 'added') {
      return side === 'new';
    }
    if (file.changeType === 'deleted') {
      return side === 'old';
    }
    return true;
  }

  private areLinesValid(
    startLine: number | null,
    endLine: number | null,
    lineCount: number,
  ): boolean {
    if (startLine === null && endLine === null) {
      return true;
    }

    if (lineCount === 0) {
      return false;
    }

    const start = startLine ?? endLine;
    const end = endLine ?? startLine;
    if (!start || !end) {
      return false;
    }
    return start >= 1 && end >= start && end <= lineCount;
  }
}

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }

  return content.replace(/\r\n/g, '\n').split('\n');
}

function normalizeExcerpt(excerpt: string): string {
  return excerpt.replace(/\r\n/g, '\n');
}
