import type { CodeGraphSnapshot, CodeGraphNode } from '../../../shared/poc3-domain/graph';
import type {
  ReviewChangedFile,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type {
  Poc3AgentReviewDebugDowngrade,
  Poc3AgentReviewLocation,
} from '../../../shared/poc3-domain/agent-review';
import type { DiffDowngradeReason, ReviewFindingDraft } from '../../../shared/domain/review-draft';

export interface Poc3AgentReviewResolution {
  location: Poc3AgentReviewLocation;
  nodeId: string | null;
  debugDowngrade?: Poc3AgentReviewDebugDowngrade;
}

export class Poc3AgentReviewResolver {
  resolve(input: {
    finding: ReviewFindingDraft;
    graph: CodeGraphSnapshot;
    sourceSnapshot: ReviewSourceSnapshot;
  }): Poc3AgentReviewResolution {
    const { finding, graph, sourceSnapshot } = input;
    if (finding.location.kind === 'overview') {
      return { location: { kind: 'overview' }, nodeId: null };
    }

    const changedFile = findChangedFile(sourceSnapshot.changedFiles, finding.location.filePath);
    if (!changedFile) {
      return toDowngradedOverview('fileNotFound', finding);
    }
    const ineligible = getIneligibilityReason(changedFile, finding.location.side);
    if (ineligible) {
      return toDowngradedOverview(ineligible, finding);
    }
    const lineCount = maxLineNumber(changedFile, finding.location.side);
    if (!areLinesValid(finding.location.startLine, finding.location.endLine, lineCount)) {
      return toDowngradedOverview('lineOutOfRange', finding);
    }

    const node = findBestNode(graph.nodes, finding.location.filePath, finding.location.startLine);
    return {
      location: {
        kind: 'diff',
        filePath: changedFile.path,
        startLine: finding.location.startLine,
        endLine: finding.location.endLine,
        side: finding.location.side,
      },
      nodeId: node?.nodeId ?? null,
    };
  }
}

function findChangedFile(files: ReviewChangedFile[], filePath: string): ReviewChangedFile | null {
  return files.find((file) => file.path === filePath || file.oldPath === filePath) ?? null;
}

function getIneligibilityReason(
  file: ReviewChangedFile,
  side: 'old' | 'new',
): DiffDowngradeReason | null {
  if (file.status === 'added' && side !== 'new') {
    return 'ineligibleSide';
  }
  if (file.status === 'removed' && side !== 'old') {
    return 'ineligibleSide';
  }
  if (!file.patch) {
    return 'largeDiff';
  }
  return null;
}

function maxLineNumber(file: ReviewChangedFile, side: 'old' | 'new'): number {
  const ranges = file.hunks.map((hunk) =>
    side === 'old' ? hunk.oldStart + hunk.oldLines - 1 : hunk.newStart + hunk.newLines - 1,
  );
  return Math.max(0, ...ranges);
}

function areLinesValid(
  startLine: number | null,
  endLine: number | null,
  lineCount: number,
): boolean {
  if (startLine === null && endLine === null) {
    return true;
  }
  const start = startLine ?? endLine;
  const end = endLine ?? startLine;
  if (!start || !end || lineCount < 1) {
    return false;
  }
  return start >= 1 && end >= start && end <= lineCount;
}

function findBestNode(
  nodes: CodeGraphNode[],
  filePath: string,
  startLine: number | null,
): CodeGraphNode | null {
  const candidates = nodes.filter((node) => node.filePath === filePath);
  if (!startLine) {
    return candidates.find((node) => node.isDiffNode) ?? candidates[0] ?? null;
  }
  const containing = candidates
    .filter((node) => {
      const range = node.declarationRange;
      return range && range.startLine <= startLine && range.endLine >= startLine;
    })
    .sort((left, right) => rangeSpan(left.declarationRange) - rangeSpan(right.declarationRange));
  return containing[0] ?? candidates.find((node) => node.isDiffNode) ?? candidates[0] ?? null;
}

function rangeSpan(range: CodeGraphNode['declarationRange']): number {
  return range ? range.endLine - range.startLine : Number.MAX_SAFE_INTEGER;
}

function toDowngradedOverview(
  reason: DiffDowngradeReason,
  finding: ReviewFindingDraft,
): Poc3AgentReviewResolution {
  const location = finding.location.kind === 'diff' ? finding.location : null;
  return {
    location: { kind: 'overview' },
    nodeId: null,
    debugDowngrade: {
      reason,
      requestedFilePath: location?.filePath ?? null,
      requestedSide: location?.side ?? null,
      requestedStartLine: location?.startLine ?? null,
      requestedEndLine: location?.endLine ?? null,
    },
  };
}
