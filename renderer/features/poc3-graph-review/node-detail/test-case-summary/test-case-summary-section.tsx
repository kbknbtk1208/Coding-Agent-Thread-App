'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TestCaseTreeNode } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import { TestCaseTreeItem } from './test-case-tree-item';

export function TestCaseSummarySection({ testCases }: { testCases: TestCaseTreeNode[] }) {
  const [isOpen, setIsOpen] = useState(true);

  const count = useMemo(() => countItOrTest(testCases), [testCases]);

  return (
    <section className="rounded-[10px] border border-white/[0.08] bg-black/20">
      <header className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-white/75 hover:text-white"
        >
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-0' : '-rotate-90'}`}
            aria-hidden="true"
          />
          <span>Test Cases</span>
          <span className="rounded-[4px] bg-white/[0.08] px-1.5 py-[1px] font-mono text-[10px] text-white/70">
            {count}
          </span>
        </button>
      </header>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.06] px-2 py-1.5">
            {testCases.map((node, idx) => (
              <TestCaseTreeItem key={`${node.line}-${idx}`} node={node} depth={0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function countItOrTest(nodes: TestCaseTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.kind === 'it' || node.kind === 'test') total += 1;
    if (node.children.length > 0) total += countItOrTest(node.children);
  }
  return total;
}
