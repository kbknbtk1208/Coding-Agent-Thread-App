import type {
  NodeCodeExcerpt,
  NodeDetailSnapshot,
  NodeDiffExcerpt,
  NodeFileContext,
  NodeFunctionCode,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export type DiffAwareLineSide = 'LEFT' | 'RIGHT';

export type DiffAwareLineKind = 'context' | 'added' | 'removed' | 'unchanged' | 'hunk';

export interface DiffAwareSourceLine {
  key: string;
  kind: DiffAwareLineKind;
  filePath: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  displayLineNumber: number | null;
  side: DiffAwareLineSide | null;
  text: string;
  selectableForProviderComment: boolean;
  selectableForAgentMention: boolean;
  inSourceRange: boolean;
  inDiffHunk: boolean;
}

export type DiffAwareSourceBase = NodeCodeExcerpt | NodeFunctionCode | NodeFileContext;

export interface BuildDiffAwareSourceLinesInput {
  source: DiffAwareSourceBase | null;
  diffExcerpt?: NodeDiffExcerpt | null;
  diffSummary?: NodeDetailSnapshot['diffSummary'] | null;
  filePath?: string | null;
}

type ParsedDiffLine =
  | { type: 'hunk'; text: string }
  | {
      type: 'line';
      marker: ' ' | '+' | '-';
      oldLineNumber: number | null;
      newLineNumber: number | null;
      text: string;
    };

export function buildDiffAwareSourceLines({
  source,
  diffExcerpt,
  diffSummary,
  filePath,
}: BuildDiffAwareSourceLinesInput): DiffAwareSourceLine[] {
  const resolvedFilePath = source?.filePath ?? diffExcerpt?.filePath ?? filePath ?? '';
  const patch = resolvePatch(diffExcerpt, diffSummary);
  const diffRows = parseUnifiedDiffRows(patch);

  if (!source) {
    return diffRows.map((row, index) => diffRowToAwareLine(row, resolvedFilePath, `diff:${index}`));
  }

  const sourceLines = source.content.split('\n');
  const sourceStart = source.startLine;
  const sourceEnd = source.startLine + sourceLines.length - 1;
  const beforeByNewLine = new Map<number, DiffAwareSourceLine[]>();
  const diffByNewLine = new Map<number, DiffAwareSourceLine>();
  const afterByNewLine = new Map<number, DiffAwareSourceLine[]>();
  let pendingRemoved: DiffAwareSourceLine[] = [];
  let lastRightLineInRange: number | null = null;

  const flushPendingRemovedAfterLastRight = () => {
    if (pendingRemoved.length === 0) {
      return;
    }
    if (lastRightLineInRange !== null) {
      const current = afterByNewLine.get(lastRightLineInRange) ?? [];
      afterByNewLine.set(lastRightLineInRange, current.concat(pendingRemoved));
      pendingRemoved = [];
    }
  };
  const flushPendingRemovedToNearestSourceLine = () => {
    if (pendingRemoved.length === 0) {
      return;
    }
    const anchorOldLine = pendingRemoved[0]?.oldLineNumber;
    if (anchorOldLine === null || anchorOldLine === undefined) {
      pendingRemoved = [];
      return;
    }
    const anchorLine = Math.min(sourceEnd, Math.max(sourceStart, anchorOldLine));
    const current = beforeByNewLine.get(anchorLine) ?? [];
    beforeByNewLine.set(anchorLine, current.concat(pendingRemoved));
    pendingRemoved = [];
  };

  for (let index = 0; index < diffRows.length; index++) {
    const row = diffRows[index];
    if (row.type === 'hunk') {
      flushPendingRemovedAfterLastRight();
      flushPendingRemovedToNearestSourceLine();
      lastRightLineInRange = null;
      continue;
    }

    if (row.marker === '-') {
      pendingRemoved.push(diffRowToAwareLine(row, source.filePath, `removed:${index}`));
      continue;
    }

    const newLine = row.newLineNumber;
    if (newLine === null) {
      continue;
    }

    if (newLine >= sourceStart && newLine <= sourceEnd) {
      if (pendingRemoved.length > 0) {
        const current = beforeByNewLine.get(newLine) ?? [];
        beforeByNewLine.set(newLine, current.concat(pendingRemoved));
        pendingRemoved = [];
      }
      diffByNewLine.set(newLine, diffRowToAwareLine(row, source.filePath, `right:${index}`));
      lastRightLineInRange = newLine;
    } else if (newLine < sourceStart) {
      pendingRemoved = [];
    } else {
      flushPendingRemovedAfterLastRight();
      flushPendingRemovedToNearestSourceLine();
    }
  }
  flushPendingRemovedAfterLastRight();
  flushPendingRemovedToNearestSourceLine();

  const lines: DiffAwareSourceLine[] = [];
  for (let index = 0; index < sourceLines.length; index++) {
    const text = sourceLines[index];
    const lineNumber = source.startLine + index;
    lines.push(...(beforeByNewLine.get(lineNumber) ?? []));
    const diffLine = diffByNewLine.get(lineNumber);
    if (diffLine) {
      lines.push(diffLine);
    } else {
      lines.push({
        key: `unchanged:${source.filePath}:${lineNumber}`,
        kind: 'unchanged',
        filePath: source.filePath,
        oldLineNumber: null,
        newLineNumber: lineNumber,
        displayLineNumber: lineNumber,
        side: null,
        text,
        selectableForProviderComment: false,
        selectableForAgentMention: true,
        inSourceRange: true,
        inDiffHunk: false,
      });
    }
    lines.push(...(afterByNewLine.get(lineNumber) ?? []));
  }

  return lines;
}

export function parseUnifiedDiffRows(
  content: string | string[] | null | undefined,
): ParsedDiffLine[] {
  const text = Array.isArray(content) ? content.join('\n') : (content ?? '');
  if (text.trim().length === 0) {
    return [];
  }

  const rows: ParsedDiffLine[] = [];
  let currentOldLine: number | null = null;
  let currentNewLine: number | null = null;

  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      currentOldLine = parsed?.oldStart ?? null;
      currentNewLine = parsed?.newStart ?? null;
      rows.push({ type: 'hunk', text: line });
      continue;
    }

    if (line.startsWith('+')) {
      rows.push({
        type: 'line',
        marker: '+',
        oldLineNumber: null,
        newLineNumber: currentNewLine,
        text: line.slice(1),
      });
      currentNewLine = currentNewLine === null ? null : currentNewLine + 1;
      continue;
    }

    if (line.startsWith('-')) {
      rows.push({
        type: 'line',
        marker: '-',
        oldLineNumber: currentOldLine,
        newLineNumber: null,
        text: line.slice(1),
      });
      currentOldLine = currentOldLine === null ? null : currentOldLine + 1;
      continue;
    }

    rows.push({
      type: 'line',
      marker: ' ',
      oldLineNumber: currentOldLine,
      newLineNumber: currentNewLine,
      text: line.startsWith(' ') ? line.slice(1) : line,
    });
    currentOldLine = currentOldLine === null ? null : currentOldLine + 1;
    currentNewLine = currentNewLine === null ? null : currentNewLine + 1;
  }

  return rows;
}

function resolvePatch(
  diffExcerpt: NodeDiffExcerpt | null | undefined,
  diffSummary: NodeDetailSnapshot['diffSummary'] | null | undefined,
): string | string[] {
  if (diffExcerpt?.patch && diffExcerpt.patch.trim().length > 0) {
    return diffExcerpt.patch;
  }
  if (diffSummary?.patch && diffSummary.patch.trim().length > 0) {
    return diffSummary.patch;
  }
  if (diffExcerpt?.hunkHeaders && diffExcerpt.hunkHeaders.length > 0) {
    return diffExcerpt.hunkHeaders;
  }
  return diffSummary?.hunks.map((hunk) => hunk.header) ?? '';
}

function diffRowToAwareLine(
  row: ParsedDiffLine,
  filePath: string,
  keyPrefix: string,
): DiffAwareSourceLine {
  if (row.type === 'hunk') {
    return {
      key: `${keyPrefix}:hunk`,
      kind: 'hunk',
      filePath,
      oldLineNumber: null,
      newLineNumber: null,
      displayLineNumber: null,
      side: null,
      text: row.text,
      selectableForProviderComment: false,
      selectableForAgentMention: false,
      inSourceRange: false,
      inDiffHunk: true,
    };
  }

  const side = row.marker === '-' ? 'LEFT' : 'RIGHT';
  const lineNumber = side === 'LEFT' ? row.oldLineNumber : row.newLineNumber;
  return {
    key: `${keyPrefix}:${side}:${lineNumber ?? ''}:${row.text}`,
    kind: row.marker === '+' ? 'added' : row.marker === '-' ? 'removed' : 'context',
    filePath,
    oldLineNumber: row.oldLineNumber,
    newLineNumber: row.newLineNumber,
    displayLineNumber: lineNumber,
    side,
    text: row.text,
    selectableForProviderComment: lineNumber !== null,
    selectableForAgentMention: true,
    inSourceRange: row.marker !== '-',
    inDiffHunk: true,
  };
}

function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const matched = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (!matched) {
    return null;
  }
  return {
    oldStart: Number(matched[1]),
    newStart: Number(matched[2]),
  };
}
