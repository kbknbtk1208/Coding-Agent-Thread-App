import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';

export interface DiffFileTreeItem {
  id: string;
  name: string;
  path: string;
  kind: 'dir' | 'file';
  findingCount: number;
  remoteCount: number;
  children: DiffFileTreeItem[];
}

/**
 * グラフノードからファイルツリーを構築する。
 * diffOnly=true の場合は isDiffNode のファイルのみ対象（false にすると全ノードが対象）。
 * 各ファイル/ディレクトリには Agent finding と Remote thread の件数が集計される
 * （ディレクトリは配下ファイルの合計）。
 */
export function buildDiffFileTree(nodes: GraphRenderNode[], diffOnly = true): DiffFileTreeItem[] {
  const targetNodes = diffOnly ? nodes.filter((n) => n.isDiffNode) : nodes;

  const fileCounts = new Map<string, { findingCount: number; remoteCount: number }>();
  for (const node of targetNodes) {
    if (!node.filePath) continue;
    const current = fileCounts.get(node.filePath) ?? { findingCount: 0, remoteCount: 0 };
    current.findingCount += node.badges.findingCount;
    current.remoteCount += node.badges.remoteThreadCount;
    fileCounts.set(node.filePath, current);
  }

  if (fileCounts.size === 0) return [];

  const root: DiffFileTreeItem = {
    id: '__root__',
    name: '',
    path: '',
    kind: 'dir',
    findingCount: 0,
    remoteCount: 0,
    children: [],
  };

  for (const filePath of Array.from(fileCounts.keys()).sort()) {
    const counts = fileCounts.get(filePath)!;
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partPath = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          id: partPath,
          name: part,
          path: partPath,
          kind: isLast ? 'file' : 'dir',
          findingCount: isLast ? counts.findingCount : 0,
          remoteCount: isLast ? counts.remoteCount : 0,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  bubbleUpCounts(root);

  return root.children;
}

function bubbleUpCounts(item: DiffFileTreeItem): { findingCount: number; remoteCount: number } {
  if (item.kind === 'file') {
    return { findingCount: item.findingCount, remoteCount: item.remoteCount };
  }
  let findingCount = 0;
  let remoteCount = 0;
  for (const child of item.children) {
    const sub = bubbleUpCounts(child);
    findingCount += sub.findingCount;
    remoteCount += sub.remoteCount;
  }
  item.findingCount = findingCount;
  item.remoteCount = remoteCount;
  return { findingCount, remoteCount };
}

export function collectDefaultExpanded(items: DiffFileTreeItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.kind === 'dir') {
      ids.push(item.id);
      ids.push(...collectDefaultExpanded(item.children));
    }
  }
  return ids;
}
