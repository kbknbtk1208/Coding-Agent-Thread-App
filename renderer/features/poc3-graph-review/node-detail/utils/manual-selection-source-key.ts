import type { Poc3DiffLineSelection } from '../../provider-comments/diff-inline-selection';
import type { Poc3InlineCommentAnchor } from '../../../../../shared/poc3-domain/comment-publish';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function buildManualSelectionSourceKey(
  selection: Poc3DiffLineSelection,
  detail?: NodeDetailSnapshot,
  seed = 0,
): string {
  return [
    'manual-selection',
    seed,
    detail?.reviewWorkspaceId ?? '',
    detail?.revisionId ?? '',
    selection.filePath,
    selection.side,
    selection.startLine,
    selection.endLine,
  ].join(':');
}

export function selectionToAnchor(selection: Poc3DiffLineSelection): Poc3InlineCommentAnchor {
  return {
    kind: 'diff',
    filePath: selection.filePath,
    oldPath: selection.oldPath,
    side: selection.side,
    startLine: selection.startLine === selection.endLine ? null : selection.startLine,
    endLine: selection.endLine,
  };
}
