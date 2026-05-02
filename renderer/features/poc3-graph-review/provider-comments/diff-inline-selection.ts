export type DiffInlineActionKind = 'publish-comment' | 'agent-mention';

export interface Poc3DiffLineSelection {
  filePath: string;
  oldPath: string | null;
  side: 'LEFT' | 'RIGHT';
  startLine: number;
  endLine: number;
}

export type DiffSelectionState =
  | { status: 'idle' }
  | { status: 'selecting'; selection: Poc3DiffLineSelection }
  | {
      status: 'composing';
      selection: Poc3DiffLineSelection;
      actionKind: DiffInlineActionKind;
    };

export function normalizeDiffLineSelection(
  selection: Poc3DiffLineSelection,
): Poc3DiffLineSelection {
  const startLine = Math.min(selection.startLine, selection.endLine);
  const endLine = Math.max(selection.startLine, selection.endLine);
  return { ...selection, startLine, endLine };
}
