'use client';

import { highlighter as diffHighlighter, type SyntaxNode } from '@git-diff-view/lowlight';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileCode2,
  FileText,
  FunctionSquare,
  GitBranch,
  Loader2,
  Package,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, type RefObject } from 'react';
import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerpt,
  NodeDetailSnapshot,
  NodeDetailViewMode,
  NodeDiffExcerpt,
  NodeFileContext,
  NodeFunctionCode,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { NodeDetailState } from './use-node-detail';

const PANEL_WIDTH_CLASS = 'w-[min(660px,calc(100vw-28px))]';

export interface NodeDetailPanelProps {
  state: NodeDetailState;
  selectedNode: GraphRenderNode | null;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
  onClose(): void;
}

export function NodeDetailPanel({
  state,
  selectedNode,
  viewMode,
  onViewModeChange,
  onSelectNode,
  onClose,
}: NodeDetailPanelProps) {
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
                <PanelBody
                  state={state}
                  selectedNode={selectedNode}
                  viewMode={viewMode}
                  onViewModeChange={onViewModeChange}
                  onSelectNode={onSelectNode}
                />
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
    node.kind === 'module' || node.kind === 'file-scope'
      ? FileCode2
      : node.kind === 'external' || node.kind === 'external-symbol'
        ? Package
        : FunctionSquare;
  const detail = state.detail;
  const nodeName = detail?.summary.title || node.label;
  const filePath = detail?.summary.filePath ?? node.filePath;
  const toneClass = node.isDiffNode
    ? 'border-[#d8e071]/45 bg-[#d8e071]/14 text-[#f6ffc0]'
    : node.kind === 'external' || node.kind === 'external-symbol'
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
          {filePath ? (
            <p
              className="mt-1 break-all font-mono text-[11px] leading-4 text-white/55"
              title={filePath}
            >
              {filePath}
            </p>
          ) : null}
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
  viewMode,
  onViewModeChange,
  onSelectNode,
}: {
  state: NodeDetailState;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
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
      <PrimarySection
        detail={detail}
        selectedNode={selectedNode}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
      {detail ? <RelationsSection detail={detail} onSelectNode={onSelectNode} /> : null}
      {detail ? <DiffPatchSummary detail={detail} /> : null}
      {detail ? <DiagnosticsSection detail={detail} /> : null}
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
  viewMode,
  onViewModeChange,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
}) {
  if (!detail) {
    return <UnavailableSection selectedNode={selectedNode} />;
  }

  const isExpanded = viewMode !== 'function';
  const source =
    isExpanded && detail.fileContext
      ? detail.fileContext
      : (detail.functionCode ?? detail.fileContext ?? detail.codeExcerpt);
  const canExpand = detail.functionCode !== null;
  const scrollToLine =
    isExpanded && detail.fileContext ? detail.functionCode?.startLine : undefined;

  if (source) {
    return (
      <section className="flex flex-col gap-2">
        <SourceCodeSection source={source} scrollToLine={scrollToLine} />
        {canExpand && !isExpanded ? (
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 self-center rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[11px] text-white/55 transition hover:border-white/[0.18] hover:text-white/80"
            onClick={() => onViewModeChange('file')}
          >
            <ChevronDown className="size-3" aria-hidden="true" />
            ファイルを展開
          </button>
        ) : canExpand && isExpanded && detail.fileContext ? (
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 self-center rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[11px] text-white/55 transition hover:border-white/[0.18] hover:text-white/80"
            onClick={() => onViewModeChange('function')}
          >
            <ChevronUp className="size-3" aria-hidden="true" />
            折りたたむ
          </button>
        ) : null}
      </section>
    );
  }

  if (detail.diffExcerpt) {
    return <DiffExcerptSection excerpt={detail.diffExcerpt} />;
  }
  return <UnavailableSection selectedNode={selectedNode} detail={detail} />;
}

function DiffExcerptSection({ excerpt }: { excerpt: NodeDiffExcerpt }) {
  const language = useMemo(() => resolveHighlightLanguage(excerpt.filePath), [excerpt.filePath]);
  const rows = useMemo(
    () =>
      buildUnifiedDiffRows(excerpt.patch.trim().length > 0 ? excerpt.patch : excerpt.hunkHeaders),
    [excerpt.hunkHeaders, excerpt.patch],
  );

  return (
    <section className="node-detail-diff diff-tailwindcss-wrapper flex flex-col" data-theme="dark">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        {rows.length > 0 ? (
          <div className="max-h-[calc(100vh-132px)] overflow-auto font-mono text-[11px] leading-[1.35rem] text-[#c9d1d9]">
            <div className="min-w-max">
              {rows.map((row, index) => (
                <DiffRowView
                  key={`${row.type}-${row.text}-${index}`}
                  row={row}
                  language={language}
                  filePath={excerpt.filePath}
                />
              ))}
            </div>
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

function DiffRowView({
  row,
  language,
  filePath,
}: {
  row: DiffRow;
  language: string;
  filePath: string;
}) {
  if (row.type === 'hunk') {
    return (
      <div className="min-w-full bg-[#0f2742] px-3 py-2 text-[#79c0ff]">
        <span className="whitespace-pre">{row.text}</span>
      </div>
    );
  }

  const toneClass =
    row.marker === '+'
      ? 'bg-[#12261b] text-[#b6f0c2]'
      : row.marker === '-'
        ? 'bg-[#2f1721] text-[#ffd7d5]'
        : 'bg-transparent text-[#c9d1d9]';

  return (
    <div
      className={`grid min-w-full grid-cols-[28px_28px_12px_auto] gap-x-1.5 px-2 py-1 ${toneClass}`}
    >
      <span className="overflow-hidden text-right text-white/28">{row.oldLineNumber ?? ''}</span>
      <span className="overflow-hidden text-right text-white/28">{row.newLineNumber ?? ''}</span>
      <span className="text-center text-white/40">{row.marker}</span>
      <span className="whitespace-pre">
        <HighlightedSourceLine filePath={filePath} language={language} text={row.text} />
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

function SourceCodeSection({
  source,
  scrollToLine,
}: {
  source: NodeCodeExcerpt | NodeFunctionCode | NodeFileContext;
  scrollToLine?: number;
}) {
  const scrollContainerRef = useRef<HTMLPreElement | null>(null);
  const language = useMemo(() => resolveHighlightLanguage(source.filePath), [source.filePath]);
  const highlighted = new Set(source.highlightedLineNumbers);
  const lines = source.content.split('\n');

  useEffect(() => {
    if (!scrollToLine || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const lineEl = container.querySelector(`[data-line="${scrollToLine}"]`);
    if (lineEl instanceof HTMLElement) {
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = lineEl.getBoundingClientRect().top;
      container.scrollTop = Math.max(0, container.scrollTop + lineTop - containerTop - 48);
    }
  }, [scrollToLine]);

  return (
    <section className="node-detail-code diff-tailwindcss-wrapper flex flex-col" data-theme="dark">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        <pre
          ref={scrollContainerRef}
          className="max-h-[calc(100vh-132px)] overflow-y-auto p-2 font-mono text-[11px] leading-[1.35rem] text-[#c9d1d9]"
        >
          {lines.map((line, index) => {
            const actualLine = source.startLine + index;
            const isHighlighted = highlighted.has(actualLine);
            return (
              <div
                key={actualLine}
                data-line={actualLine}
                className={`grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 rounded-[4px] px-1 ${
                  isHighlighted ? 'bg-[#d8e071]/10 text-[#f6ffc0]' : ''
                }`}
              >
                <span className="overflow-hidden text-right text-white/28">{actualLine}</span>
                <span className="min-w-0 whitespace-pre-wrap break-all">
                  <HighlightedSourceLine
                    filePath={source.filePath}
                    language={language}
                    text={line}
                  />
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

function RelationsSection({
  detail,
  onSelectNode,
}: {
  detail: NodeDetailSnapshot;
  onSelectNode(nodeId: string): void;
}) {
  const incoming = detail.relations.incoming;
  const outgoing = detail.relations.outgoing;
  if (incoming.length + outgoing.length === 0) {
    return null;
  }
  return (
    <section className="border-t border-white/[0.08] pt-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/48">
        <GitBranch className="size-3.5" aria-hidden="true" />
        Relations
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RelationGroup title="Incoming" items={incoming} onSelectNode={onSelectNode} />
        <RelationGroup title="Outgoing" items={outgoing} onSelectNode={onSelectNode} />
      </div>
    </section>
  );
}

function RelationGroup({
  title,
  items,
  onSelectNode,
}: {
  title: string;
  items: NodeDetailSnapshot['relations']['incoming'];
  onSelectNode(nodeId: string): void;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] text-white/42">{title}</p>
      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <button
              key={`${item.edge.edgeId}:${item.nodeId}`}
              type="button"
              className="min-w-0 rounded-[7px] border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-left transition hover:border-[#58d7ff]/28 hover:bg-[#58d7ff]/10"
              onClick={() => onSelectNode(item.nodeId)}
            >
              <span className="block truncate text-[12px] font-semibold text-white/82">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.1em] text-white/38">
                {item.edge.kind} / {item.kind}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-[7px] border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[11px] text-white/34">
          None
        </p>
      )}
    </div>
  );
}

function DiffPatchSummary({ detail }: { detail: NodeDetailSnapshot }) {
  const patch = detail.diffSummary.patch ?? detail.diffExcerpt?.patch ?? null;
  if (!detail.diffSummary.hasDiff && !patch) {
    return null;
  }
  return (
    <details className="border-t border-white/[0.08] pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/48">
        <FileText className="size-3.5" aria-hidden="true" />
        Diff Patch
      </summary>
      <div className="mt-2">
        {patch ? (
          <DiffExcerptSection
            excerpt={{
              filePath: detail.summary.filePath ?? detail.node.filePath ?? '',
              patch,
              hunkHeaders: detail.diffSummary.hunks.map((hunk) => hunk.header),
              changedLineNumbers: detail.diffSummary.changedLineNumbers,
            }}
          />
        ) : (
          <p className="text-[12px] text-white/42">
            {detail.diffSummary.changedLineNumbers.length} changed lines
          </p>
        )}
      </div>
    </details>
  );
}

function DiagnosticsSection({ detail }: { detail: NodeDetailSnapshot }) {
  const diagnostics = detail.diagnostics.filter((diagnostic) => diagnostic.severity !== 'info');
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <section className="border-t border-white/[0.08] pt-3">
      <div className="flex flex-col gap-1.5">
        {diagnostics.map((diagnostic) => (
          <p
            key={`${diagnostic.code}:${diagnostic.message}`}
            className="rounded-[7px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/8 px-2.5 py-2 text-[11px] leading-5 text-[#ffd79a]"
          >
            {diagnostic.message}
          </p>
        ))}
      </div>
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

function HighlightedSourceLine({
  text,
  filePath,
  language,
}: {
  text: string;
  filePath: string;
  language: string;
}) {
  const syntaxLine = useMemo(
    () => buildSyntaxLine(text, filePath, language),
    [filePath, language, text],
  );

  if (!syntaxLine) {
    return <>{text.length > 0 ? text : ' '}</>;
  }

  return (
    <span className="diff-line-syntax-raw">
      <code className="hljs">
        {syntaxLine.nodeList.map((entry, index) =>
          renderSyntaxEntry(entry.node, `${index}`, entry.wrapper),
        )}
      </code>
    </span>
  );
}

function buildSyntaxLine(text: string, filePath: string, language: string) {
  if (text.length === 0) {
    return null;
  }

  try {
    const ast = diffHighlighter.getAST(text, filePath, language, 'dark');
    return diffHighlighter.processAST(ast).syntaxFileObject[1] ?? null;
  } catch {
    return null;
  }
}

function renderSyntaxEntry(node: SyntaxNode, key: string, wrapper?: SyntaxNode) {
  const content = renderSyntaxNode(node, `${key}:node`);
  if (!wrapper) {
    return content;
  }

  return (
    <span key={`${key}:wrapper`} className={joinClassNames(wrapper.properties?.className)}>
      {content}
    </span>
  );
}

function renderSyntaxNode(node: SyntaxNode, key: string) {
  if (node.children && node.children.length > 0) {
    return (
      <span key={key} className={joinClassNames(node.properties?.className)}>
        {node.children.map((child, index) => renderSyntaxNode(child, `${key}:${index}`))}
      </span>
    );
  }

  if (node.properties?.className?.length) {
    return (
      <span key={key} className={joinClassNames(node.properties.className)}>
        {node.value}
      </span>
    );
  }

  return <span key={key}>{node.value}</span>;
}

function joinClassNames(classNames?: string[]) {
  return classNames?.filter(Boolean).join(' ') || undefined;
}

function resolveHighlightLanguage(filePath: string): string {
  const normalized = filePath.toLowerCase();

  if (
    normalized.endsWith('.ts') ||
    normalized.endsWith('.d.ts') ||
    normalized.endsWith('.mts') ||
    normalized.endsWith('.cts')
  ) {
    return 'typescript';
  }
  if (normalized.endsWith('.tsx')) {
    return 'tsx';
  }
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return 'javascript';
  }
  if (normalized.endsWith('.jsx')) {
    return 'jsx';
  }
  if (normalized.endsWith('.json')) {
    return 'json';
  }
  if (normalized.endsWith('.css')) {
    return 'css';
  }
  if (normalized.endsWith('.scss')) {
    return 'scss';
  }
  if (normalized.endsWith('.less')) {
    return 'less';
  }
  if (
    normalized.endsWith('.html') ||
    normalized.endsWith('.htm') ||
    normalized.endsWith('.xml') ||
    normalized.endsWith('.svg')
  ) {
    return 'xml';
  }
  if (normalized.endsWith('.md')) {
    return 'markdown';
  }
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) {
    return 'yaml';
  }
  if (normalized.endsWith('.sh') || normalized.endsWith('.bash') || normalized.endsWith('.zsh')) {
    return 'shell';
  }
  if (normalized.endsWith('.ps1') || normalized.endsWith('.psm1') || normalized.endsWith('.psd1')) {
    return 'powershell';
  }
  if (normalized.endsWith('.py')) {
    return 'python';
  }
  if (normalized.endsWith('.go')) {
    return 'go';
  }
  if (normalized.endsWith('.rs')) {
    return 'rust';
  }
  if (normalized.endsWith('.java')) {
    return 'java';
  }
  if (normalized.endsWith('.kt') || normalized.endsWith('.kts')) {
    return 'kotlin';
  }
  if (normalized.endsWith('.swift')) {
    return 'swift';
  }
  if (normalized.endsWith('.rb')) {
    return 'ruby';
  }
  if (normalized.endsWith('.php')) {
    return 'php';
  }
  if (normalized.endsWith('.sql')) {
    return 'sql';
  }
  if (normalized.endsWith('.c')) {
    return 'c';
  }
  if (normalized.endsWith('.cc') || normalized.endsWith('.cpp') || normalized.endsWith('.cxx')) {
    return 'cpp';
  }
  if (normalized.endsWith('.cs')) {
    return 'csharp';
  }

  return 'plaintext';
}
