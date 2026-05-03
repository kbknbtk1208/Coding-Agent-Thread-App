import {
  normalizeDiffLineSelection,
  type Poc3DiffLineSelection,
} from '../../provider-comments/diff-inline-selection';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';

export function groupFindingsByAwareLine(
  findings: NodeDetailSnapshot['findings'],
): Map<string, NodeDetailSnapshot['findings']> {
  const map = new Map<string, NodeDetailSnapshot['findings']>();
  const addFinding = (key: string, finding: NodeDetailSnapshot['findings'][number]) => {
    const current = map.get(key) ?? [];
    if (!current.some((entry) => entry.findingId === finding.findingId)) {
      current.push(finding);
    }
    map.set(key, current);
  };
  for (const finding of findings) {
    if (finding.line === null) {
      continue;
    }
    const line = finding.endLine ?? finding.line;
    if (finding.side === 'old') {
      addFinding(`LEFT:${line}`, finding);
      continue;
    }
    if (finding.side === 'new') {
      addFinding(`RIGHT:${line}`, finding);
      addFinding(`LINE:${line}`, finding);
      continue;
    }
    addFinding(`RIGHT:${line}`, finding);
    addFinding(`LEFT:${line}`, finding);
    addFinding(`LINE:${line}`, finding);
  }
  return map;
}

export function groupRemoteThreadsByAwareLine(
  threads: NodeDetailSnapshot['threads']['remote'],
): Map<string, NodeDetailSnapshot['threads']['remote']> {
  const map = new Map<string, NodeDetailSnapshot['threads']['remote']>();
  for (const thread of threads) {
    if (thread.location.kind !== 'diff') {
      continue;
    }
    const line = thread.location.endLine ?? thread.location.startLine;
    if (line === null) {
      continue;
    }
    const key = `${thread.location.side}:${line}`;
    const current = map.get(key) ?? [];
    current.push(thread);
    map.set(key, current);
  }
  return map;
}

export function awareLineLookupKey(line: DiffAwareSourceLine): string {
  if (line.side === 'LEFT' && line.oldLineNumber !== null) {
    return `LEFT:${line.oldLineNumber}`;
  }
  if (line.side === 'RIGHT' && line.newLineNumber !== null) {
    return `RIGHT:${line.newLineNumber}`;
  }
  if (line.newLineNumber !== null) {
    return `LINE:${line.newLineNumber}`;
  }
  return `LINE:${line.oldLineNumber ?? ''}`;
}

export function providerLineNumberForAwareLine(line: DiffAwareSourceLine): number | null {
  if (line.side === 'LEFT') {
    return line.oldLineNumber;
  }
  if (line.side === 'RIGHT') {
    return line.newLineNumber;
  }
  return null;
}

export function isSelectableDiffAwareLine(
  lines: DiffAwareSourceLine[],
  info: { filePath: string; side: 'LEFT' | 'RIGHT'; line: number },
): boolean {
  return lines.some(
    (line) =>
      line.filePath === info.filePath &&
      line.side === info.side &&
      providerLineNumberForAwareLine(line) === info.line &&
      line.selectableForProviderComment,
  );
}

export function isContiguousProviderSelection(
  lines: DiffAwareSourceLine[],
  selection: Poc3DiffLineSelection,
): boolean {
  const normalized = normalizeDiffLineSelection(selection);
  const providerLines = lines
    .filter(
      (line) =>
        line.filePath === normalized.filePath &&
        line.side === normalized.side &&
        line.selectableForProviderComment,
    )
    .map((line) => providerLineNumberForAwareLine(line))
    .filter((line): line is number => line !== null)
    .sort((a, b) => a - b);

  for (let line = normalized.startLine; line <= normalized.endLine; line++) {
    if (!providerLines.includes(line)) {
      return false;
    }
  }
  return true;
}
