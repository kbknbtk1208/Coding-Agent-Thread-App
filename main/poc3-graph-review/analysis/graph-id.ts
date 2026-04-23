import path from 'path';
import { createHash } from 'crypto';

export function toRepoRelativePath(worktreePath: string, filePath: string): string {
  const relative = path.isAbsolute(filePath) ? path.relative(worktreePath, filePath) : filePath;
  return relative.split(path.sep).join('/').replace(/^\/+/, '');
}

export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function stableSymbolId(input: {
  filePath: string | null;
  symbolName: string;
  kind: string;
  startLine: number | null;
}): string {
  const raw = [
    normalizeRepoPath(input.filePath ?? '(external)'),
    input.symbolName,
    input.kind,
    input.startLine ?? 0,
  ].join(':');
  return `symbol:${createHash('sha1').update(raw).digest('hex').slice(0, 20)}`;
}

export function snapshotNodeId(stableId: string): string {
  return `node:${createHash('sha1').update(stableId).digest('hex').slice(0, 20)}`;
}

export function snapshotEdgeId(sourceNodeId: string, targetNodeId: string, kind: string): string {
  return `edge:${createHash('sha1')
    .update(`${sourceNodeId}:${targetNodeId}:${kind}`)
    .digest('hex')
    .slice(0, 20)}`;
}
