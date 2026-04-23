import type { DiffHunkRange } from '../../../shared/poc3-domain/source-snapshot';

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s?(.*))?$/;

export function parseUnifiedDiffHunks(filePath: string, patch: string | null): DiffHunkRange[] {
  if (!patch) {
    return [];
  }

  const hunks: DiffHunkRange[] = [];
  let current: DiffHunkRange | null = null;
  let oldCursor = 0;
  let newCursor = 0;

  for (const line of patch.split(/\r?\n/)) {
    const headerMatch = HUNK_HEADER_PATTERN.exec(line);
    if (headerMatch) {
      current = {
        filePath,
        oldStart: Number(headerMatch[1]),
        oldLines: Number(headerMatch[2] ?? '1'),
        newStart: Number(headerMatch[3]),
        newLines: Number(headerMatch[4] ?? '1'),
        header: headerMatch[5]?.trim() || null,
        changedNewLines: [],
        changedOldLines: [],
      };
      hunks.push(current);
      oldCursor = current.oldStart;
      newCursor = current.newStart;
      continue;
    }

    if (!current || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    const marker = line[0];
    if (marker === '+') {
      current.changedNewLines.push(newCursor);
      newCursor += 1;
      continue;
    }
    if (marker === '-') {
      current.changedOldLines.push(oldCursor);
      oldCursor += 1;
      continue;
    }
    oldCursor += 1;
    newCursor += 1;
  }

  return hunks;
}
