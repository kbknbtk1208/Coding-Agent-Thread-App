import { randomUUID } from 'crypto';
import {
  deriveAnchorKind,
  type ReviewAnchor,
  type ReviewDiscussionLocation,
  type ReviewSnapshot,
  type ReviewSnapshotFile,
} from '../../shared/domain/review';
import type {
  DiffDowngradeReason,
  ReviewDraftStructuredResult,
  ReviewFindingDraft,
  ReviewFindingLocationInput,
  ReviewThreadDraft,
  ReviewThreadDraftDebugDowngrade,
} from '../../shared/domain/review-draft';

type ResolveResult = {
  location: ReviewDiscussionLocation;
  anchor: ReviewAnchor | null;
  debugDowngrade?: ReviewThreadDraftDebugDowngrade;
};

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
    resolved: ResolveResult,
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
      ...(resolved.debugDowngrade ? { debugDowngrade: resolved.debugDowngrade } : {}),
    };
  }

  private async resolveFindingAsync(
    snapshot: ReviewSnapshot,
    finding: ReviewFindingDraft,
    hydrateFile: (fileId: string) => Promise<ReviewSnapshotFile>,
  ): Promise<ResolveResult> {
    if (finding.location.kind === 'overview') {
      return this.toOverviewResult();
    }

    const loc = finding.location;
    const matchedFile = this.findMatchingFile(snapshot, finding);
    if (!matchedFile) {
      return this.toDowngradedOverview('fileNotFound', loc);
    }

    const ineligibleReason = this.getIneligibilityReason(matchedFile, loc.side);
    if (ineligibleReason) {
      return this.toDowngradedOverview(ineligibleReason, loc);
    }

    const file =
      matchedFile.contentStatus === 'loaded' ? matchedFile : await hydrateFile(matchedFile.fileId);
    return this.resolveDiffLocation(file, finding);
  }

  private resolveFindingSync(snapshot: ReviewSnapshot, finding: ReviewFindingDraft): ResolveResult {
    if (finding.location.kind === 'overview') {
      return this.toOverviewResult();
    }

    const loc = finding.location;
    const matchedFile = this.findMatchingFile(snapshot, finding);
    if (!matchedFile) {
      return this.toDowngradedOverview('fileNotFound', loc);
    }

    const ineligibleReason = this.getIneligibilityReason(matchedFile, loc.side);
    if (ineligibleReason) {
      return this.toDowngradedOverview(ineligibleReason, loc);
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
  ): ResolveResult {
    if (finding.location.kind !== 'diff') {
      return this.toOverviewResult();
    }

    const loc = finding.location;
    const content = loc.side === 'old' ? file.oldContent : file.newContent;
    const lines = splitLines(content);

    if (!this.areLinesValid(loc.startLine, loc.endLine, lines.length)) {
      return this.toDowngradedOverview('lineOutOfRange', loc);
    }

    const anchor: ReviewAnchor = {
      fileId: file.fileId,
      filePath: file.filePath,
      startLine: loc.startLine,
      endLine: loc.endLine,
      side: loc.side,
      kind: deriveAnchorKind(loc.startLine, loc.endLine),
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

  private toOverviewResult(): ResolveResult {
    return {
      location: { kind: 'overview' },
      anchor: null,
    };
  }

  private toDowngradedOverview(
    reason: DiffDowngradeReason,
    loc: Extract<ReviewFindingLocationInput, { kind: 'diff' }>,
  ): ResolveResult {
    return {
      location: { kind: 'overview' },
      anchor: null,
      debugDowngrade: {
        reason,
        requestedFilePath: loc.filePath,
        requestedSide: loc.side,
        requestedStartLine: loc.startLine,
        requestedEndLine: loc.endLine,
      },
    };
  }

  private getIneligibilityReason(
    file: ReviewSnapshotFile,
    side: 'old' | 'new',
  ): DiffDowngradeReason | null {
    if (!this.isValidSideForChangeType(file, side)) {
      return 'ineligibleSide';
    }
    if (file.isBinary) {
      return 'binaryFile';
    }
    if (file.isLargeDiff) {
      return 'largeDiff';
    }
    return null;
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
