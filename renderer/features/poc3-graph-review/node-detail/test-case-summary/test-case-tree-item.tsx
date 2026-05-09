'use client';

import type { TestCaseTreeNode } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import { useScrollTarget } from './scroll-target-context';

export function TestCaseTreeItem({ node, depth }: { node: TestCaseTreeNode; depth: number }) {
  const scrollTarget = useScrollTarget();

  const modifierIcon = renderModifierIcon(node.modifier);
  const kindBadgeClass =
    node.kind === 'describe' ? 'bg-white/[0.06] text-white/55' : 'bg-white/[0.08] text-white/70';
  const opacityClass = node.modifier === 'skip' ? 'opacity-50' : '';
  const italicClass = node.modifier === 'todo' ? 'italic' : '';

  return (
    <div>
      <button
        type="button"
        onClick={() => scrollTarget?.scrollToLine(node.line)}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-0.5 text-left text-[12px] text-white/80 hover:bg-white/[0.04] ${opacityClass} ${italicClass}`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {modifierIcon ? (
          <span className={modifierIconClass(node.modifier)}>{modifierIcon}</span>
        ) : null}
        <span
          className={`shrink-0 rounded-[3px] px-1 py-[1px] font-mono text-[10px] ${kindBadgeClass}`}
        >
          {node.kind}
        </span>
        <span className="min-w-0 truncate">{node.label}</span>
      </button>
      {node.children.length > 0
        ? node.children.map((child, idx) => (
            <TestCaseTreeItem key={`${child.line}-${idx}`} node={child} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

function renderModifierIcon(modifier: TestCaseTreeNode['modifier']): string | null {
  switch (modifier) {
    case 'skip':
      return '⊘';
    case 'only':
      return '★';
    case 'todo':
      return '⋯';
    case 'each':
      return '↻';
    default:
      return null;
  }
}

function modifierIconClass(modifier: TestCaseTreeNode['modifier']): string {
  switch (modifier) {
    case 'only':
      return 'text-amber-300';
    case 'each':
      return 'text-sky-300';
    case 'todo':
      return 'text-white/55';
    case 'skip':
      return 'text-white/40';
    default:
      return '';
  }
}
