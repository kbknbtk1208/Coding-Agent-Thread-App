import type {
  DiffHunkRange,
  ReviewChangedFile,
  ReviewRemoteThread,
} from '../../../shared/poc3-domain/source-snapshot';

export function resolveRemoteThreadAnchors(input: {
  threads: ReviewRemoteThread[];
  changedFiles: ReviewChangedFile[];
  headSha: string;
}): ReviewRemoteThread[] {
  const { threads, changedFiles } = input;

  const fileByPath = new Map<string, ReviewChangedFile>();
  for (const file of changedFiles) {
    fileByPath.set(file.path, file);
    if (file.oldPath) {
      fileByPath.set(file.oldPath, file);
    }
  }

  return threads.map((thread): ReviewRemoteThread => {
    if (thread.location.kind === 'overview') {
      return { ...thread, anchorStatus: 'overview' };
    }

    const { filePath, startLine, endLine, side } = thread.location;
    const file = fileByPath.get(filePath);

    if (!file) {
      return { ...thread, anchorStatus: 'unanchored' };
    }

    const line = endLine ?? startLine;
    if (line === null) {
      return { ...thread, anchorStatus: 'unanchored' };
    }

    if (thread.isOutdated) {
      return { ...thread, anchorStatus: 'outdated' };
    }

    const isInCurrentHunk =
      side === 'RIGHT'
        ? isLineInHunks(line, file.hunks, 'new')
        : isLineInHunks(line, file.hunks, 'old');

    if (isInCurrentHunk) {
      return { ...thread, anchorStatus: 'current' };
    }

    return { ...thread, anchorStatus: 'outdated' };
  });
}

function isLineInHunks(line: number, hunks: DiffHunkRange[], mode: 'new' | 'old'): boolean {
  for (const hunk of hunks) {
    const start = mode === 'new' ? hunk.newStart : hunk.oldStart;
    const count = mode === 'new' ? hunk.newLines : hunk.oldLines;
    const end = start + count - 1;
    if (line >= start && line <= end) {
      return true;
    }
  }
  return false;
}

export function buildRemoteThreadSummary(
  threads: ReviewRemoteThread[],
): import('../../../shared/poc3-domain/source-snapshot').ReviewRemoteThreadSummary[] {
  return threads
    .filter((t) => t.anchorStatus === 'current' && t.location.kind === 'diff')
    .map((t) => {
      const loc = t.location.kind === 'diff' ? t.location : null;
      return {
        providerThreadId: t.providerThreadId,
        filePath: loc?.filePath ?? null,
        line: loc?.endLine ?? loc?.startLine ?? null,
        side: loc?.side ?? null,
        isResolved: t.isResolved,
        commentCount: t.comments.length,
      };
    });
}
