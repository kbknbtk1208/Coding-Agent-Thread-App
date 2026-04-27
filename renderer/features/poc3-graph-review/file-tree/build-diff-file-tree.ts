import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';

export interface DiffFileTreeItem {
  id: string;
  name: string;
  path: string;
  kind: 'dir' | 'file';
  children: DiffFileTreeItem[];
}

/**
 * グラフノードからファイルツリーを構築する。
 * diffOnly=true の場合は isDiffNode のファイルのみ対象（false にすると全ノードが対象）。
 */
export function buildDiffFileTree(nodes: GraphRenderNode[], diffOnly = true): DiffFileTreeItem[] {
  const targetNodes = diffOnly ? nodes.filter((n) => n.isDiffNode) : nodes;

  const filePaths = new Set<string>();
  for (const node of targetNodes) {
    if (node.filePath) {
      filePaths.add(node.filePath);
    }
  }

  if (filePaths.size === 0) return [];

  const root: DiffFileTreeItem = {
    id: '__root__',
    name: '',
    path: '',
    kind: 'dir',
    children: [],
  };

  for (const filePath of Array.from(filePaths).sort()) {
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
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  return root.children;
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
