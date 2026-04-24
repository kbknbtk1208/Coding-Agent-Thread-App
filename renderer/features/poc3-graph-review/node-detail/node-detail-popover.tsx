'use client';

import { useViewport } from '@xyflow/react';
import { AlertTriangle, FileCode2, FunctionSquare, Loader2, Package, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerpt,
  NodeDetailSnapshot,
  NodeDiffExcerpt,
  NodeRelationItem,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { NodeDetailState } from './use-node-detail';

const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 520;
const POPOVER_GAP = 16;

export interface NodeDetailPopoverProps {
  state: NodeDetailState;
  selectedNode: GraphRenderNode | null;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose(): void;
  onSelectRelatedNode(nodeId: string): void;
}

export function NodeDetailPopover({
  state,
  selectedNode,
  containerRef,
  onClose,
  onSelectRelatedNode,
}: NodeDetailPopoverProps) {
  const viewport = useViewport();
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const update = () => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const placement = useMemo(() => {
    if (!selectedNode || !containerSize) {
      return null;
    }
    return computePlacement({
      node: selectedNode,
      viewport,
      containerSize,
    });
  }, [containerSize, selectedNode, viewport]);

  if (!selectedNode || !placement) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Node detail"
      className="pointer-events-auto absolute z-20 overflow-hidden rounded-[10px] border border-white/[0.14] bg-[#0b0b0b]/95 text-white shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-[18px]"
      style={{
        left: placement.left,
        top: placement.top,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <PopoverHeader node={selectedNode} onClose={onClose} />
      <div className="flex max-h-[calc(520px-56px)] flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2 text-[12px]">
        <PopoverBody state={state} onSelectRelatedNode={onSelectRelatedNode} />
      </div>
    </div>
  );
}

function PopoverHeader({ node, onClose }: { node: GraphRenderNode; onClose: () => void }) {
  const Icon =
    node.kind === 'module' ? FileCode2 : node.kind === 'external' ? Package : FunctionSquare;
  const toneClass = node.isDiffNode
    ? 'border-[#d8e071]/45 bg-[#d8e071]/18 text-[#f6ffc0]'
    : node.kind === 'external'
      ? 'border-white/[0.14] bg-white/[0.05] text-white/80'
      : 'border-[#58d7ff]/30 bg-[#58d7ff]/12 text-[#dff7ff]';
  return (
    <div className="flex items-start gap-3 border-b border-white/[0.08] px-4 pb-3 pt-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-[6px] border ${toneClass}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-5 text-white">{node.label}</p>
        <p className="truncate text-[11px] leading-4 text-white/55">{node.filePath ?? node.kind}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <HeaderBadge label={node.kind} tone="muted" />
          <HeaderBadge
            label={node.isDiffNode ? 'diff' : node.diffStatus}
            tone={node.isDiffNode ? 'diff' : 'muted'}
          />
          {node.badges.changedLines > 0 ? (
            <HeaderBadge label={`+${node.badges.changedLines}`} tone="diff" />
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-[5px] text-white/50 transition hover:bg-white/[0.08] hover:text-white"
        onClick={onClose}
        aria-label="Close node detail"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function HeaderBadge({ label, tone }: { label: string; tone: 'muted' | 'diff' }) {
  const className =
    tone === 'diff'
      ? 'border-[#d8e071]/40 bg-[#d8e071]/12 text-[#f6ffc0]'
      : 'border-white/[0.1] bg-white/[0.05] text-white/70';
  return (
    <span
      className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${className}`}
    >
      {label}
    </span>
  );
}

function PopoverBody({
  state,
  onSelectRelatedNode,
}: {
  state: NodeDetailState;
  onSelectRelatedNode: (nodeId: string) => void;
}) {
  if (state.status === 'loading' && !state.detail) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/65">
        <Loader2 className="size-4 animate-spin text-[#d8e071]" aria-hidden="true" />
        Loading node detail…
      </div>
    );
  }
  if (state.status === 'failed' && !state.detail) {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[#ffbf6b]/35 bg-[#ffbf6b]/10 px-3 py-2 text-[11px] text-[#ffd79a]">
        <AlertTriangle className="size-4 shrink-0 text-[#ffbf6b]" aria-hidden="true" />
        <span className="min-w-0">{state.message}</span>
      </div>
    );
  }
  if (state.status === 'idle') {
    return null;
  }
  const detail = state.detail;
  if (!detail) {
    return null;
  }

  return (
    <>
      {state.status === 'loading' && state.detail ? (
        <div className="flex items-center gap-2 rounded-[6px] border border-[#d8e071]/25 bg-[#d8e071]/10 px-3 py-2 text-[11px] text-[#f6ffc0]">
          <Loader2 className="size-4 shrink-0 animate-spin text-[#d8e071]" aria-hidden="true" />
          <span className="min-w-0">{state.message ?? 'Refreshing node detail…'}</span>
        </div>
      ) : null}
      {state.status === 'failed' ? (
        <div className="flex items-start gap-2 rounded-[6px] border border-[#ffbf6b]/35 bg-[#ffbf6b]/10 px-3 py-2 text-[11px] text-[#ffd79a]">
          <AlertTriangle className="size-4 shrink-0 text-[#ffbf6b]" aria-hidden="true" />
          <span className="min-w-0">{state.message}</span>
        </div>
      ) : null}
      <PrimaryExcerpt detail={detail} />
      <RelationsSection relations={detail.relations} onSelectRelatedNode={onSelectRelatedNode} />
      <ThreadsSection detail={detail} />
    </>
  );
}

function PrimaryExcerpt({ detail }: { detail: NodeDetailSnapshot }) {
  if (detail.primaryView === 'diff' && detail.diffExcerpt) {
    return <DiffExcerptBlock excerpt={detail.diffExcerpt} />;
  }
  if (detail.primaryView === 'code' && detail.codeExcerpt) {
    return <CodeExcerptBlock excerpt={detail.codeExcerpt} />;
  }
  return <OverviewBlock detail={detail} />;
}

function DiffExcerptBlock({ excerpt }: { excerpt: NodeDiffExcerpt }) {
  const rows = useMemo(
    () =>
      buildUnifiedDiffRows(excerpt.patch.trim().length > 0 ? excerpt.patch : excerpt.hunkHeaders),
    [excerpt.hunkHeaders, excerpt.patch],
  );
  return (
    <section className="flex flex-col gap-1.5">
      <SectionHeader label="Diff" hint={excerpt.filePath} />
      <div className="max-h-[260px] overflow-auto rounded-[6px] border border-white/[0.08] bg-black/40">
        {rows.length > 0 ? (
          <div className="font-mono text-[11px] leading-4 text-white/80">
            {rows.map((row, index) => (
              <DiffRowView key={`${row.type}-${row.text}-${index}`} row={row} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 text-[11px] text-white/55">No patch content.</div>
        )}
      </div>
      {excerpt.changedLineNumbers.length > 0 ? (
        <p className="text-[10px] text-white/45">
          Changed lines: {excerpt.changedLineNumbers.slice(0, 12).join(', ')}
          {excerpt.changedLineNumbers.length > 12 ? ', …' : ''}
        </p>
      ) : null}
    </section>
  );
}

type DiffRow =
  | { type: 'hunk'; text: string }
  | {
      type: 'line';
      marker: ' ' | '+' | '-';
      oldLineNumber: number | null;
      newLineNumber: number | null;
      text: string;
    };

function DiffRowView({ row }: { row: DiffRow }) {
  if (row.type === 'hunk') {
    return (
      <div className="border-b border-white/[0.04] bg-[#d8e071]/10 px-3 py-1.5 text-[#d8e071]">
        {row.text}
      </div>
    );
  }

  const toneClass =
    row.marker === '+'
      ? 'bg-[#11351e] text-[#bbefc2]'
      : row.marker === '-'
        ? 'bg-[#391919] text-[#ffc0c0]'
        : 'bg-transparent text-white/72';

  return (
    <div
      className={`grid grid-cols-[40px_40px_16px_minmax(0,1fr)] border-b border-white/[0.04] px-2 py-0.5 ${toneClass}`}
    >
      <span className="pr-2 text-right text-white/30">{row.oldLineNumber ?? ''}</span>
      <span className="pr-2 text-right text-white/30">{row.newLineNumber ?? ''}</span>
      <span className="text-center text-white/45">{row.marker}</span>
      <span className="min-w-0 whitespace-pre">{row.text.length > 0 ? row.text : ' '}</span>
    </div>
  );
}

function buildUnifiedDiffRows(content: string | string[]): DiffRow[] {
  const text = Array.isArray(content) ? content.join('\n') : content;
  if (text.trim().length === 0) {
    return [];
  }

  const rows: DiffRow[] = [];
  let currentOldLine: number | null = null;
  let currentNewLine: number | null = null;

  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      currentOldLine = parsed?.oldStart ?? null;
      currentNewLine = parsed?.newStart ?? null;
      rows.push({ type: 'hunk', text: line });
      continue;
    }

    if (line.startsWith('+')) {
      rows.push({
        type: 'line',
        marker: '+',
        oldLineNumber: null,
        newLineNumber: currentNewLine,
        text: line.slice(1),
      });
      currentNewLine = currentNewLine === null ? null : currentNewLine + 1;
      continue;
    }

    if (line.startsWith('-')) {
      rows.push({
        type: 'line',
        marker: '-',
        oldLineNumber: currentOldLine,
        newLineNumber: null,
        text: line.slice(1),
      });
      currentOldLine = currentOldLine === null ? null : currentOldLine + 1;
      continue;
    }

    rows.push({
      type: 'line',
      marker: ' ',
      oldLineNumber: currentOldLine,
      newLineNumber: currentNewLine,
      text: line.startsWith(' ') ? line.slice(1) : line,
    });
    currentOldLine = currentOldLine === null ? null : currentOldLine + 1;
    currentNewLine = currentNewLine === null ? null : currentNewLine + 1;
  }

  return rows;
}

function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const matched = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (!matched) {
    return null;
  }
  return {
    oldStart: Number(matched[1]),
    newStart: Number(matched[2]),
  };
}

function CodeExcerptBlock({ excerpt }: { excerpt: NodeCodeExcerpt }) {
  const highlighted = new Set(excerpt.highlightedLineNumbers);
  const lines = excerpt.content.split('\n');
  return (
    <section className="flex flex-col gap-1.5">
      <SectionHeader
        label="Code"
        hint={`${excerpt.filePath}:${excerpt.startLine}-${excerpt.endLine}`}
      />
      <pre className="max-h-[220px] overflow-auto rounded-[6px] border border-white/[0.08] bg-black/40 p-2 font-mono text-[11px] leading-4 text-white/80">
        {lines.map((line, index) => {
          const actualLine = excerpt.startLine + index;
          const isHighlighted = highlighted.has(actualLine);
          return (
            <div
              key={index}
              className={`grid grid-cols-[34px_1fr] ${isHighlighted ? 'bg-[#d8e071]/10 text-[#f6ffc0]' : ''}`}
            >
              <span className="pr-2 text-right text-white/30">{actualLine}</span>
              <span className="whitespace-pre">{line.length > 0 ? line : ' '}</span>
            </div>
          );
        })}
      </pre>
    </section>
  );
}

function OverviewBlock({ detail }: { detail: NodeDetailSnapshot }) {
  const node = detail.node;
  if (node.kind === 'external') {
    return (
      <section className="rounded-[6px] border border-white/[0.08] bg-white/[0.035] p-3">
        <SectionHeader label="External" hint={node.label} />
        <p className="mt-1.5 text-[11px] leading-5 text-white/70">
          外部 package / module。コード本文は表示しません。
        </p>
      </section>
    );
  }
  if (node.kind === 'module') {
    return (
      <section className="rounded-[6px] border border-white/[0.08] bg-white/[0.035] p-3">
        <SectionHeader label="Module" hint={detail.summary.filePath ?? 'module'} />
        <p className="mt-1.5 text-[11px] leading-5 text-white/70">
          この module には該当する diff も code excerpt も見つかりませんでした。
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-[6px] border border-white/[0.08] bg-white/[0.035] p-3">
      <SectionHeader label="Unavailable" hint={detail.summary.filePath ?? '-'} />
      <p className="mt-1.5 text-[11px] leading-5 text-white/70">
        Code / diff を hydrate できませんでした。
      </p>
    </section>
  );
}

function RelationsSection({
  relations,
  onSelectRelatedNode,
}: {
  relations: NodeDetailSnapshot['relations'];
  onSelectRelatedNode: (nodeId: string) => void;
}) {
  const hasAny =
    relations.incoming.length > 0 ||
    relations.outgoing.length > 0 ||
    relations.incomingOverflowCount > 0 ||
    relations.outgoingOverflowCount > 0;
  if (!hasAny) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1.5">
      <SectionHeader label="Relations" hint={null} />
      <div className="grid grid-cols-1 gap-2">
        <RelationList
          title="Incoming"
          items={relations.incoming}
          overflowCount={relations.incomingOverflowCount}
          onSelect={onSelectRelatedNode}
        />
        <RelationList
          title="Outgoing"
          items={relations.outgoing}
          overflowCount={relations.outgoingOverflowCount}
          onSelect={onSelectRelatedNode}
        />
      </div>
    </section>
  );
}

function RelationList({
  title,
  items,
  overflowCount,
  onSelect,
}: {
  title: string;
  items: NodeRelationItem[];
  overflowCount: number;
  onSelect: (nodeId: string) => void;
}) {
  if (items.length === 0 && overflowCount === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={`${title}-${item.edge.edgeId}`}>
            <button
              type="button"
              onClick={() => onSelect(item.nodeId)}
              className="flex w-full items-center gap-2 rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-left text-[11px] text-white/80 transition hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-white"
            >
              <span
                className={`size-1.5 rounded-full ${item.isDiffNode ? 'bg-[#d8e071]' : 'bg-[#58d7ff]'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 text-[10px] text-white/40">{item.kind}</span>
            </button>
          </li>
        ))}
        {overflowCount > 0 ? (
          <li className="text-[10px] text-white/40">+{overflowCount} more…</li>
        ) : null}
      </ul>
    </div>
  );
}

function ThreadsSection({ detail }: { detail: NodeDetailSnapshot }) {
  const remoteCount = detail.threads.remote.length;
  const localCount = detail.threads.local.length;
  const agentCount = detail.threads.agent.length;
  const findingCount = detail.findings.length;
  if (remoteCount + localCount + agentCount + findingCount === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1.5">
      <SectionHeader label="Signals" hint={null} />
      <ul className="flex flex-wrap gap-2 text-[11px] text-white/70">
        {remoteCount > 0 ? <SignalPill label="Remote thread" count={remoteCount} /> : null}
        {localCount > 0 ? <SignalPill label="Local thread" count={localCount} /> : null}
        {agentCount > 0 ? <SignalPill label="Agent thread" count={agentCount} /> : null}
        {findingCount > 0 ? <SignalPill label="Finding" count={findingCount} /> : null}
      </ul>
    </section>
  );
}

function SignalPill({ label, count }: { label: string; count: number }) {
  return (
    <li className="rounded-[4px] border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
      {label} {count}
    </li>
  );
}

function SectionHeader({ label, hint }: { label: string; hint: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
      {hint ? <p className="truncate text-[10px] text-white/40">{hint}</p> : null}
    </div>
  );
}

interface PlacementInput {
  node: GraphRenderNode;
  viewport: { x: number; y: number; zoom: number };
  containerSize: { width: number; height: number };
}

function computePlacement(input: PlacementInput): { left: number; top: number } {
  const { node, viewport, containerSize } = input;
  const anchorRight = (node.position.x + node.size.width) * viewport.zoom + viewport.x;
  const anchorLeft = node.position.x * viewport.zoom + viewport.x;
  const anchorTop = node.position.y * viewport.zoom + viewport.y;
  const anchorCenterY = anchorTop + (node.size.height * viewport.zoom) / 2;

  let left = anchorRight + POPOVER_GAP;
  if (left + POPOVER_WIDTH + POPOVER_GAP > containerSize.width) {
    left = anchorLeft - POPOVER_GAP - POPOVER_WIDTH;
  }
  left = clamp(
    left,
    POPOVER_GAP,
    Math.max(containerSize.width - POPOVER_WIDTH - POPOVER_GAP, POPOVER_GAP),
  );

  const desiredHeight = Math.min(POPOVER_MAX_HEIGHT, containerSize.height - POPOVER_GAP * 2);
  let top = anchorCenterY - desiredHeight / 2;
  top = clamp(
    top,
    POPOVER_GAP,
    Math.max(containerSize.height - desiredHeight - POPOVER_GAP, POPOVER_GAP),
  );

  return { left, top };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
