'use client';

import { AlertTriangle, FileCode2, FunctionSquare, Loader2, Package, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, type RefObject } from 'react';
import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerpt,
  NodeDetailSnapshot,
  NodeDiffExcerpt,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { NodeDetailState } from './use-node-detail';

const PANEL_WIDTH_CLASS = 'w-[min(560px,calc(100vw-28px))]';

export interface NodeDetailPanelProps {
  state: NodeDetailState;
  selectedNode: GraphRenderNode | null;
  onClose(): void;
}

export function NodeDetailPanel({ state, selectedNode, onClose }: NodeDetailPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? panelRef.current;
    focusTarget?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [selectedNode]);

  return (
    <AnimatePresence initial={false}>
      {selectedNode ? (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.08)_60%,rgba(0,0,0,0.28)_100%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            tabIndex={-1}
            ref={panelRef}
            className={`absolute inset-y-3 right-3 z-30 flex ${PANEL_WIDTH_CLASS} overflow-hidden rounded-[14px] border border-white/[0.12] bg-[#090909]/96 text-white shadow-[0_28px_80px_rgba(0,0,0,0.58)] backdrop-blur-[20px]`}
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <PanelHeader
                node={selectedNode}
                state={state}
                onClose={onClose}
                titleId={titleId}
                closeButtonRef={closeButtonRef}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                <PanelBody state={state} selectedNode={selectedNode} />
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PanelHeader({
  node,
  state,
  onClose,
  titleId,
  closeButtonRef,
}: {
  node: GraphRenderNode;
  state: NodeDetailState;
  onClose: () => void;
  titleId: string;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const Icon =
    node.kind === 'module' ? FileCode2 : node.kind === 'external' ? Package : FunctionSquare;
  const detail = state.detail;
  const nodeName = detail?.summary.title || node.label;
  const toneClass = node.isDiffNode
    ? 'border-[#d8e071]/45 bg-[#d8e071]/14 text-[#f6ffc0]'
    : node.kind === 'external'
      ? 'border-white/[0.14] bg-white/[0.05] text-white/80'
      : 'border-[#58d7ff]/28 bg-[#58d7ff]/10 text-[#dff7ff]';

  return (
    <div className="border-b border-white/[0.08] px-4 pb-3 pt-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[8px] border ${toneClass}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <HeaderBadge label={node.kind} tone="muted" />
            <HeaderBadge
              label={node.isDiffNode ? 'diff' : node.diffStatus}
              tone={node.isDiffNode ? 'diff' : 'muted'}
            />
            {state.status === 'loading' ? <HeaderBadge label="loading" tone="diff" /> : null}
          </div>
          <h3
            id={titleId}
            className="mt-2 break-all text-[17px] font-semibold leading-6 text-white"
          >
            {nodeName}
          </h3>
        </div>
        <button
          type="button"
          ref={closeButtonRef}
          className="flex size-8 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.03] text-white/55 transition hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
          onClick={onClose}
          aria-label="Close node detail"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function HeaderBadge({ label, tone }: { label: string; tone: 'muted' | 'diff' }) {
  const className =
    tone === 'diff'
      ? 'border-[#d8e071]/35 bg-[#d8e071]/12 text-[#f6ffc0]'
      : 'border-white/[0.1] bg-white/[0.05] text-white/65';
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {label}
    </span>
  );
}

function PanelBody({
  state,
  selectedNode,
}: {
  state: NodeDetailState;
  selectedNode: GraphRenderNode;
}) {
  const detail = state.detail;

  if (state.status === 'loading' && !detail) {
    return (
      <div className="flex flex-col gap-4">
        <SignalsSection detail={null} selectedNode={selectedNode} />
        <LoadingState message="Loading node detail…" />
      </div>
    );
  }
  if (state.status === 'failed' && !detail) {
    return (
      <div className="flex flex-col gap-4">
        <SignalsSection detail={null} selectedNode={selectedNode} />
        <ErrorState message={state.message} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'loading' && detail ? (
        <InlineNotice tone="loading" message={state.message ?? 'Refreshing node detail…'} />
      ) : null}
      {state.status === 'failed' && detail ? (
        <InlineNotice tone="error" message={state.message} />
      ) : null}
      <SignalsSection detail={detail} selectedNode={selectedNode} />
      <PrimarySection detail={detail} selectedNode={selectedNode} />
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#d8e071]/28 bg-[#d8e071]/10 px-4 py-3 text-[12px] text-[#f6ffc0]">
      <Loader2 className="size-4 shrink-0 animate-spin text-[#d8e071]" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#ffbf6b]/35 bg-[#ffbf6b]/10 px-4 py-3 text-[12px] text-[#ffd79a]">
      <AlertTriangle className="size-4 shrink-0 text-[#ffbf6b]" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

function InlineNotice({ tone, message }: { tone: 'loading' | 'error'; message: string }) {
  if (tone === 'loading') {
    return <LoadingState message={message} />;
  }
  return <ErrorState message={message} />;
}

function PrimarySection({
  detail,
  selectedNode,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
}) {
  if (!detail) {
    return <UnavailableSection selectedNode={selectedNode} />;
  }
  if (detail.primaryView === 'diff' && detail.diffExcerpt) {
    return <DiffExcerptSection excerpt={detail.diffExcerpt} />;
  }
  if (detail.primaryView === 'code' && detail.codeExcerpt) {
    return <CodeExcerptSection excerpt={detail.codeExcerpt} />;
  }
  return <UnavailableSection selectedNode={selectedNode} detail={detail} />;
}

function DiffExcerptSection({ excerpt }: { excerpt: NodeDiffExcerpt }) {
  const rows = useMemo(
    () =>
      buildUnifiedDiffRows(excerpt.patch.trim().length > 0 ? excerpt.patch : excerpt.hunkHeaders),
    [excerpt.hunkHeaders, excerpt.patch],
  );

  return (
    <section className="flex flex-col">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        {rows.length > 0 ? (
          <div className="max-h-[calc(100vh-132px)] overflow-y-auto font-mono text-[11px] leading-[1.35rem] text-white/82">
            {rows.map((row, index) => (
              <DiffRowView key={`${row.type}-${row.text}-${index}`} row={row} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 text-[12px] text-white/55">No patch content.</div>
        )}
      </div>
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
      <div className="border-b border-white/[0.05] bg-[#d8e071]/10 px-3 py-2 text-[#d8e071]">
        <span className="break-all">{row.text}</span>
      </div>
    );
  }

  const toneClass =
    row.marker === '+'
      ? 'bg-[#102b18] text-[#caefcf]'
      : row.marker === '-'
        ? 'bg-[#351515] text-[#ffc8c8]'
        : 'bg-transparent text-white/74';

  return (
    <div
      className={`grid grid-cols-[16px_16px_10px_minmax(0,1fr)] gap-x-1 border-b border-white/[0.04] px-2 py-1 ${toneClass}`}
    >
      <span className="overflow-hidden text-right text-white/28">{row.oldLineNumber ?? ''}</span>
      <span className="overflow-hidden text-right text-white/28">{row.newLineNumber ?? ''}</span>
      <span className="text-center text-white/42">{row.marker}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        {row.text.length > 0 ? row.text : ' '}
      </span>
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

function CodeExcerptSection({ excerpt }: { excerpt: NodeCodeExcerpt }) {
  const highlighted = new Set(excerpt.highlightedLineNumbers);
  const lines = excerpt.content.split('\n');

  return (
    <section className="flex flex-col">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        <pre className="max-h-[calc(100vh-132px)] overflow-y-auto p-2 font-mono text-[11px] leading-[1.35rem] text-white/82">
          {lines.map((line, index) => {
            const actualLine = excerpt.startLine + index;
            const isHighlighted = highlighted.has(actualLine);
            return (
              <div
                key={actualLine}
                className={`grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 rounded-[4px] px-1 ${
                  isHighlighted ? 'bg-[#d8e071]/10 text-[#f6ffc0]' : ''
                }`}
              >
                <span className="overflow-hidden text-right text-white/28">{actualLine}</span>
                <span className="min-w-0 whitespace-pre-wrap break-all">
                  {line.length > 0 ? line : ' '}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </section>
  );
}

function UnavailableSection({
  selectedNode,
  detail,
}: {
  selectedNode: GraphRenderNode;
  detail?: NodeDetailSnapshot;
}) {
  const message =
    selectedNode.kind === 'external'
      ? '外部モジュールのためコード本文は表示しません。'
      : detail?.status === 'partial'
        ? '表示できる diff または code excerpt が一部だけ取得できました。'
        : '表示できる diff または code excerpt がありません。';

  return (
    <section className="rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-[12px] leading-6 text-white/68">{message}</p>
    </section>
  );
}

function SignalsSection({
  detail,
  selectedNode,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
}) {
  const remoteCount = detail?.threads.remote.length ?? selectedNode.badges.remoteThreadCount;
  const localCount = detail?.threads.local.length ?? 0;
  const agentCount = detail?.threads.agent.length ?? 0;
  const findingCount = detail?.findings.length ?? selectedNode.badges.findingCount;
  const topFindingSeverity = getTopFindingSeverity(detail?.findings ?? []);
  if (remoteCount + localCount + agentCount + findingCount === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2">
        {remoteCount > 0 ? (
          <SignalPill label="Remote threads" count={remoteCount} tone="info" />
        ) : null}
        {localCount > 0 ? (
          <SignalPill label="Local threads" count={localCount} tone="neutral" />
        ) : null}
        {agentCount > 0 ? (
          <SignalPill label="Agent threads" count={agentCount} tone="neutral" />
        ) : null}
        {findingCount > 0 ? (
          <SignalPill
            label="Findings"
            count={findingCount}
            tone={
              topFindingSeverity === 'high'
                ? 'danger'
                : topFindingSeverity === 'medium'
                  ? 'warning'
                  : 'info'
            }
          />
        ) : null}
      </ul>
    </section>
  );
}

function SignalPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'neutral' | 'info' | 'warning' | 'danger';
}) {
  const className =
    tone === 'danger'
      ? 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]'
      : tone === 'warning'
        ? 'border-[#ffbf6b]/25 bg-[#ffbf6b]/10 text-[#ffe0b5]'
        : tone === 'info'
          ? 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]'
          : 'border-white/[0.08] bg-white/[0.04] text-white/68';
  return (
    <li
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {label} {count}
    </li>
  );
}

function getTopFindingSeverity(
  findings: NodeDetailSnapshot['findings'],
): 'low' | 'medium' | 'high' | null {
  if (findings.some((finding) => finding.severity === 'high')) {
    return 'high';
  }
  if (findings.some((finding) => finding.severity === 'medium')) {
    return 'medium';
  }
  if (findings.some((finding) => finding.severity === 'low')) {
    return 'low';
  }
  return null;
}
