import type { NodeFileContext } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { DiffAwareSourceBase } from '../diff-aware-source-model';

export function buildEffectiveSource(
  source: DiffAwareSourceBase | null,
  fileContext: NodeFileContext | null,
  range: { startLine: number; endLine: number } | null,
): DiffAwareSourceBase | null {
  if (!source || !fileContext || !range || source.filePath !== fileContext.filePath) {
    return source;
  }

  const startLine = Math.max(fileContext.startLine, range.startLine);
  const endLine = Math.min(fileContext.endLine, range.endLine);
  const lines = fileContext.content.split('\n');
  const startIndex = Math.max(0, startLine - fileContext.startLine);
  const endIndex = Math.max(startIndex, endLine - fileContext.startLine);
  return {
    ...fileContext,
    startLine,
    endLine,
    content: lines.slice(startIndex, endIndex + 1).join('\n'),
    highlightedLineNumbers: fileContext.highlightedLineNumbers.filter(
      (line) => line >= startLine && line <= endLine,
    ),
  };
}
