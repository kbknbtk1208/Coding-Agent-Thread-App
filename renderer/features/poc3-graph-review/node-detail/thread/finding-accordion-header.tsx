'use client';

import { Bot, ChevronDown } from 'lucide-react';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function FindingThreadAccordionHeader({
  headerId,
  contentId,
  finding,
  isExpanded,
  onToggle,
}: {
  headerId: string;
  contentId: string;
  finding: NodeDetailSnapshot['findings'][number];
  isExpanded: boolean;
  onToggle(): void;
}) {
  return (
    <button
      id={headerId}
      type="button"
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] px-1 py-1 text-left text-[#f8f7f4] transition hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/35"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={contentId}
    >
      <ChevronDown
        className={`size-4 shrink-0 text-fuchsia-100/75 transition-transform duration-200 ease-in-out ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
        aria-hidden="true"
      />
      <Bot className="size-3.5 shrink-0 text-fuchsia-200/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5">
        {finding.title}
      </span>
      {finding.isOutdated ? (
        <span className="shrink-0 rounded-full border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#ffe0b5]">
          outdated
        </span>
      ) : null}
      <FindingSeverityBadge finding={finding} />
    </button>
  );
}

export function FindingSeverityBadge({
  finding,
}: {
  finding: NodeDetailSnapshot['findings'][number];
}) {
  const severityClass =
    finding.severity === 'high'
      ? 'border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 text-[#ffd9d9]'
      : finding.severity === 'medium'
        ? 'border border-[#FFA16C]/20 bg-[#FFA16C]/10 text-[#ffd9c0]'
        : 'border border-[#4EBE96]/20 bg-[#4EBE96]/10 text-[#d7f5e8]';

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${severityClass}`}
    >
      {finding.severity}
    </span>
  );
}
