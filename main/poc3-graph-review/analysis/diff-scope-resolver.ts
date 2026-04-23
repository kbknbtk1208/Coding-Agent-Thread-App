import type { GraphDiagnostic } from '../../../shared/poc3-domain/graph';
import type {
  ReviewChangedFile,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import { normalizeRepoPath } from './graph-id';

export interface DiffScope {
  revisionId: string;
  files: DiffScopeFile[];
  diagnostics: GraphDiagnostic[];
}

export interface DiffScopeFile {
  filePath: string;
  status: ReviewChangedFile['status'];
  changedRanges: Array<{
    startLine: number;
    endLine: number;
    changedLines: number[];
  }>;
}

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function isTypeScriptPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return Array.from(TYPESCRIPT_EXTENSIONS).some((extension) => normalized.endsWith(extension));
}

function groupLines(lines: number[]): DiffScopeFile['changedRanges'] {
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  const ranges: DiffScopeFile['changedRanges'] = [];
  let current: number[] = [];

  for (const line of sorted) {
    const last = current[current.length - 1];
    if (last === undefined || line === last + 1) {
      current.push(line);
      continue;
    }
    ranges.push({
      startLine: current[0],
      endLine: current[current.length - 1],
      changedLines: current,
    });
    current = [line];
  }

  if (current.length > 0) {
    ranges.push({
      startLine: current[0],
      endLine: current[current.length - 1],
      changedLines: current,
    });
  }

  return ranges;
}

export function resolveDiffScope(snapshot: ReviewSourceSnapshot): DiffScope {
  const diagnostics: GraphDiagnostic[] = [];
  const files: DiffScopeFile[] = [];

  for (const file of snapshot.changedFiles) {
    const filePath = normalizeRepoPath(file.path);
    if (!isTypeScriptPath(filePath)) {
      continue;
    }
    if (file.status === 'removed') {
      diagnostics.push({
        code: 'REMOVED_FILE_SKIPPED',
        message: `${filePath} は削除ファイルのため解析対象外です。`,
        severity: 'info',
        filePath,
      });
      continue;
    }
    if (!file.patch) {
      diagnostics.push({
        code: 'PATCH_MISSING',
        message: `${filePath} の patch がないため解析対象外です。`,
        severity: 'warning',
        filePath,
      });
      continue;
    }

    const changedLines = file.hunks.flatMap((hunk) => hunk.changedNewLines);
    const changedRanges = groupLines(changedLines);
    if (changedRanges.length === 0) {
      diagnostics.push({
        code: 'DIFF_RANGE_EMPTY',
        message: `${filePath} の変更行を抽出できませんでした。`,
        severity: 'warning',
        filePath,
      });
      continue;
    }
    files.push({
      filePath,
      status: file.status,
      changedRanges,
    });
  }

  if (files.length === 0) {
    diagnostics.push({
      code: 'DIFF_SCOPE_EMPTY',
      message: '解析対象の TypeScript 変更行がありません。',
      severity: 'info',
    });
  }

  return {
    revisionId: snapshot.revisionId,
    files,
    diagnostics,
  };
}
