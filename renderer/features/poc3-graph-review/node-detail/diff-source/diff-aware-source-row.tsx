'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo } from 'react';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';
import { providerLineNumberForAwareLine } from '../utils/aware-line-lookup';
import { HighlightedSourceLine } from './highlighted-source-line';

export const DiffAwareSourceRow = memo(function DiffAwareSourceRow({
  line,
  language,
  isHighlighted,
  isSelected,
  isSelectable,
  isActive,
  findingCount,
  remoteThreadCount,
  onFocusLine,
  onKeyDownLine,
}: {
  line: DiffAwareSourceLine;
  language: string;
  isHighlighted: boolean;
  isSelected: boolean;
  isSelectable: boolean;
  isActive: boolean;
  findingCount: number;
  remoteThreadCount: number;
  onFocusLine?: (line: DiffAwareSourceLine) => void;
  onKeyDownLine?: (event: React.KeyboardEvent<HTMLDivElement>, line: DiffAwareSourceLine) => void;
}) {
  const toneClass = isSelected
    ? line.kind === 'added'
      ? 'bg-[#d8e071]/20 text-[#b6f0c2]'
      : line.kind === 'removed'
        ? 'bg-[#d8e071]/20 text-[#ffd7d5]'
        : 'text-[#f6ffc0]'
    : line.kind === 'added'
      ? 'bg-[#12261b] text-[#b6f0c2]'
      : line.kind === 'removed'
        ? 'bg-[#2f1721] text-[#ffd7d5]'
        : findingCount > 0
          ? 'bg-[#ffbf6b]/12 text-[#ffe0b5]'
          : remoteThreadCount > 0
            ? 'bg-[#58d7ff]/10 text-[#dff7ff]'
            : isHighlighted
              ? 'bg-[#d8e071]/10 text-[#f6ffc0]'
              : line.kind === 'hunk'
                ? 'bg-[#0f2742] text-[#79c0ff]'
                : 'bg-transparent text-[#c9d1d9]';
  const providerLineNumber = providerLineNumberForAwareLine(line);
  const marker = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : '';

  return (
    <div
      className={`grid min-w-full grid-cols-[34px_34px_12px_auto] gap-x-1.5 rounded-[4px] px-1 ${toneClass} ${isSelectable ? 'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#d8e071]/60' : ''}`}
      tabIndex={isSelectable ? (isActive ? 0 : -1) : undefined}
      data-poc3-source-line="true"
      data-file-path={line.filePath}
      data-side={line.side ?? undefined}
      data-line={providerLineNumber ?? undefined}
      data-new-line={line.newLineNumber ?? undefined}
      data-provider-selectable={line.selectableForProviderComment}
      data-agent-selectable={line.selectableForAgentMention}
      onFocus={line.selectableForProviderComment ? () => onFocusLine?.(line) : undefined}
      onKeyDown={
        line.selectableForProviderComment ? (event) => onKeyDownLine?.(event, line) : undefined
      }
      style={
        isSelected
          ? {
              backgroundColor: 'rgba(216, 224, 113, 0.18)',
              boxShadow: 'inset 3px 0 0 rgba(216, 224, 113, 0.62)',
            }
          : undefined
      }
    >
      <span className="overflow-hidden text-right text-white/28">{line.oldLineNumber ?? ''}</span>
      <span className="overflow-hidden text-right text-white/28">{line.newLineNumber ?? ''}</span>
      <span className="text-center text-white/40">{marker}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        {findingCount > 0 ? (
          <span className="mr-2 inline-flex rounded-[4px] border border-[#ffbf6b]/25 bg-[#ffbf6b]/12 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#ffe0b5]">
            F{findingCount}
          </span>
        ) : null}
        {remoteThreadCount > 0 ? (
          <span className="mr-2 inline-flex rounded-[4px] border border-[#58d7ff]/25 bg-[#58d7ff]/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#dff7ff]">
            R{remoteThreadCount}
          </span>
        ) : null}
        <HighlightedSourceLine filePath={line.filePath} language={language} text={line.text} />
      </span>
    </div>
  );
});

export function ExpandSourceButton({
  direction,
  onClick,
}: {
  direction: 'up' | 'down';
  onClick(): void;
}) {
  const Icon = direction === 'up' ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      className="mb-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[11px] text-white/48 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/75"
      onClick={onClick}
      aria-label={direction === 'up' ? '上へ展開' : '下へ展開'}
    >
      <Icon className="size-3" aria-hidden="true" />
    </button>
  );
}
