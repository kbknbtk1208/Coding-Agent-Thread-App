'use client';

import { highlighter as diffHighlighter, type SyntaxNode } from '@git-diff-view/lowlight';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileCode2,
  FileText,
  FunctionSquare,
  GitBranch,
  Loader2,
  MessageSquareText,
  Package,
  SendHorizontal,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  SessionIntermediateSegments,
  renderStreamingRichText,
  renderWaitingResponse,
} from '../../../components/session-event-panel';
import { isBusyAgentStatus } from '../../../components/session-event-state';
import { Streamdown } from 'streamdown';
import type { AppSession, ConversationTurn } from '../../../../shared/domain/agent';
import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerpt,
  NodeDetailSnapshot,
  NodeDetailViewMode,
  NodeDiffExcerpt,
  NodeFileContext,
  NodeFunctionCode,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { Poc3AgentThreadMessage } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { useAgentThreadConversationContext } from '../agent-review/agent-thread-conversation-context';
import { usePublishComments } from '../provider-comments/use-publish-comments';
import type { UsePublishCommentsReturn } from '../provider-comments/use-publish-comments';
import { FindingPublishComposer } from '../provider-comments/finding-publish-composer';
import { DiffInlineCommentComposer } from '../provider-comments/diff-inline-comment-composer';
import {
  normalizeDiffLineSelection,
  type DiffSelectionState,
  type Poc3DiffLineSelection,
} from '../provider-comments/diff-inline-selection';
import type { Poc3PublishedCommentRecord } from '../../../../shared/poc3-domain/comment-publish';
import type { Poc3InlineCommentAnchor } from '../../../../shared/poc3-domain/comment-publish';
import type { NodeDetailState } from './use-node-detail';

const PANEL_WIDTH_CLASS = 'w-[min(660px,calc(100vw-28px))]';

export interface NodeDetailPanelProps {
  state: NodeDetailState;
  selectedNode: GraphRenderNode | null;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
  onClose(): void;
  onNodeDetailRefresh?: () => void;
}

export function NodeDetailPanel({
  state,
  selectedNode,
  viewMode,
  onViewModeChange,
  onSelectNode,
  onClose,
  onNodeDetailRefresh,
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
                  onNodeDetailRefresh={onNodeDetailRefresh}
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
  onNodeDetailRefresh,
}: {
  state: NodeDetailState;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
  onNodeDetailRefresh?: () => void;
}) {
  const detail = state.detail;
  const publishComments = usePublishComments({
    onPublished: () => onNodeDetailRefresh?.(),
  });

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
        publishComments={publishComments}
      />
      {detail ? <RelationsSection detail={detail} onSelectNode={onSelectNode} /> : null}
      {detail ? <DiffPatchSummary detail={detail} publishComments={publishComments} /> : null}
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
  publishComments,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  publishComments: UsePublishCommentsReturn;
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
        <SourceCodeSection
          source={source}
          scrollToLine={scrollToLine}
          findings={detail.findings}
          remoteThreads={detail.threads.remote}
          detail={detail}
          publishComments={publishComments}
        />
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
    return (
      <DiffExcerptSection
        excerpt={detail.diffExcerpt}
        remoteThreads={detail.threads.remote}
        detail={detail}
        publishComments={publishComments}
        interactive
      />
    );
  }
  return <UnavailableSection selectedNode={selectedNode} detail={detail} />;
}

function DiffExcerptSection({
  excerpt,
  remoteThreads = [],
  detail,
  publishComments,
  interactive = false,
}: {
  excerpt: NodeDiffExcerpt;
  remoteThreads?: NodeDetailSnapshot['threads']['remote'];
  detail?: NodeDetailSnapshot;
  publishComments?: UsePublishCommentsReturn;
  interactive?: boolean;
}) {
  const language = useMemo(() => resolveHighlightLanguage(excerpt.filePath), [excerpt.filePath]);
  const rows = useMemo(
    () =>
      buildUnifiedDiffRows(excerpt.patch.trim().length > 0 ? excerpt.patch : excerpt.hunkHeaders),
    [excerpt.hunkHeaders, excerpt.patch],
  );
  const remoteByDiffLine = useMemo(
    () => groupRemoteThreadsByDiffLine(remoteThreads),
    [remoteThreads],
  );
  const [selectionState, setSelectionState] = useState<DiffSelectionState>({ status: 'idle' });
  const [selectionKeySeed, setSelectionKeySeed] = useState(0);
  const [submittedSourceKey, setSubmittedSourceKey] = useState<string | null>(null);
  const dragAnchorRef = useRef<{ side: 'LEFT' | 'RIGHT'; line: number } | null>(null);
  const canInteract = interactive && Boolean(detail && publishComments && excerpt.filePath);
  const activeSelection =
    selectionState.status === 'idle' ? null : normalizeDiffLineSelection(selectionState.selection);
  const composerSelection =
    selectionState.status === 'composing'
      ? normalizeDiffLineSelection(selectionState.selection)
      : null;
  const composerSourceKey = composerSelection
    ? buildManualSelectionSourceKey(composerSelection, detail, selectionKeySeed)
    : null;
  const composerError =
    composerSourceKey && publishComments
      ? (publishComments.errorByKey[composerSourceKey] ?? '')
      : '';
  const isComposerInFlight =
    composerSourceKey !== null && publishComments?.inFlightKey === composerSourceKey;
  const publishedManualSelection =
    composerSourceKey && publishComments
      ? publishComments.publishedBySourceKey[composerSourceKey]
      : null;

  const selectionHighlightStyle = useMemo(() => {
    if (!activeSelection) return '';
    const startLine = Math.min(activeSelection.startLine, activeSelection.endLine);
    const endLine = Math.max(activeSelection.startLine, activeSelection.endLine);
    const selectors: string[] = [];
    const escapedPath = escapeCssIdentifier(activeSelection.filePath);
    const scope = `[data-poc3-diff-file-path="${escapedPath}"]`;
    for (let line = startLine; line <= endLine; line++) {
      selectors.push(
        `${scope} [data-diff-line="true"][data-side="${activeSelection.side}"][data-line="${line}"]`,
      );
    }
    if (selectors.length === 0) return '';
    return `${selectors.join(',\n')} { background-color: rgba(216, 224, 113, 0.18) !important; box-shadow: inset 3px 0 0 rgba(216, 224, 113, 0.62); }`;
  }, [activeSelection]);

  useEffect(() => {
    if (!publishedManualSelection || submittedSourceKey !== composerSourceKey) return;
    setSelectionState({ status: 'idle' });
    setSubmittedSourceKey(null);
  }, [composerSourceKey, publishedManualSelection, submittedSourceKey]);

  useEffect(() => {
    if (selectionState.status !== 'composing') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (composerSourceKey && composerError && publishComments) {
          publishComments.clearError(composerSourceKey);
        }
        setSubmittedSourceKey(null);
        setSelectionState({ status: 'idle' });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [composerError, composerSourceKey, publishComments, selectionState.status]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract || event.button !== 0) return;
    const info = extractPoc3DiffLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || info.filePath !== excerpt.filePath) return;

    event.preventDefault();
    if (composerSourceKey && composerError && publishComments) {
      publishComments.clearError(composerSourceKey);
    }
    setSelectionKeySeed((current) => current + 1);
    setSubmittedSourceKey(null);
    dragAnchorRef.current = { side: info.side, line: info.line };
    setSelectionState({
      status: 'selecting',
      selection: {
        filePath: excerpt.filePath,
        oldPath: null,
        side: info.side,
        startLine: info.line,
        endLine: info.line,
      },
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    const info = extractPoc3DiffLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || info.filePath !== excerpt.filePath || info.side !== anchor.side) return;

    setSelectionState((prev) => {
      if (prev.status !== 'selecting') return prev;
      const next = normalizeDiffLineSelection({
        ...prev.selection,
        startLine: anchor.line,
        endLine: info.line,
      });
      if (prev.selection.startLine === next.startLine && prev.selection.endLine === next.endLine) {
        return prev;
      }
      return { status: 'selecting', selection: next };
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    dragAnchorRef.current = null;
    const info = extractPoc3DiffLineInfoFromPoint(event.clientX, event.clientY);
    setSelectionState((prev) => {
      const endLine =
        info && info.filePath === excerpt.filePath && info.side === anchor.side
          ? info.line
          : prev.status === 'selecting'
            ? prev.selection.endLine
            : anchor.line;
      const selection = normalizeDiffLineSelection({
        filePath: excerpt.filePath,
        oldPath: null,
        side: anchor.side,
        startLine: anchor.line,
        endLine,
      });
      return { status: 'composing', selection, actionKind: 'publish-comment' };
    });
  };

  const closeComposer = () => {
    if (composerSourceKey && composerError && publishComments) {
      publishComments.clearError(composerSourceKey);
    }
    setSubmittedSourceKey(null);
    setSelectionState({ status: 'idle' });
  };

  return (
    <section className="node-detail-diff diff-tailwindcss-wrapper flex flex-col" data-theme="dark">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        {rows.length > 0 ? (
          <div
            className="max-h-[calc(100vh-132px)] overflow-auto font-mono text-[11px] leading-[1.35rem] text-[#c9d1d9]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragAnchorRef.current = null;
              setSelectionState({ status: 'idle' });
            }}
            style={{
              touchAction: 'none',
              ...(selectionState.status === 'selecting' ? { userSelect: 'none' as const } : {}),
            }}
          >
            <div className="min-w-max" data-poc3-diff-file-path={excerpt.filePath}>
              {rows.map((row, index) => {
                const lineThreads =
                  row.type === 'line'
                    ? (remoteByDiffLine.get(
                        diffLineKey(row.marker, row.oldLineNumber, row.newLineNumber),
                      ) ?? [])
                    : [];
                return (
                  <div key={`${row.type}-${row.text}-${index}`}>
                    <DiffRowView row={row} language={language} filePath={excerpt.filePath} />
                    {lineThreads.length > 0 ? (
                      <RemoteCommentThreadLayer threads={lineThreads} />
                    ) : null}
                    {composerSelection &&
                    row.type === 'line' &&
                    rowLineSide(row) === composerSelection.side &&
                    rowLineNumber(row, composerSelection.side) === composerSelection.endLine &&
                    composerSourceKey &&
                    detail &&
                    publishComments ? (
                      <DiffInlineCommentComposer
                        selection={composerSelection}
                        inFlight={isComposerInFlight}
                        errorMessage={composerError || null}
                        onClose={closeComposer}
                        onSubmit={(body) => {
                          setSubmittedSourceKey(composerSourceKey);
                          void publishComments.publishInlineComment({
                            reviewWorkspaceId: detail.reviewWorkspaceId,
                            revisionId: detail.revisionId,
                            body,
                            anchor: selectionToAnchor(composerSelection),
                            source: { kind: 'manual-selection' },
                            sourceKey: composerSourceKey,
                          });
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
              {selectionHighlightStyle ? <style>{selectionHighlightStyle}</style> : null}
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
  const side = rowLineSide(row);
  const lineNumber = rowLineNumber(row, side);

  return (
    <div
      className={`grid min-w-full grid-cols-[28px_28px_12px_auto] gap-x-1.5 px-2 py-1 ${toneClass}`}
      data-diff-line="true"
      data-side={side}
      data-line={lineNumber ?? undefined}
      data-selectable={lineNumber !== null}
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

interface AgentFindingPublishProps {
  detail: NodeDetailSnapshot;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  onPublishFinding(finding: NodeDetailSnapshot['findings'][number], body: string): void;
  onClearPublishError(sourceKey: string): void;
}

function SourceCodeSection({
  findings,
  remoteThreads,
  source,
  scrollToLine,
  detail,
  publishComments,
}: {
  findings?: NodeDetailSnapshot['findings'];
  remoteThreads?: NodeDetailSnapshot['threads']['remote'];
  source: NodeCodeExcerpt | NodeFunctionCode | NodeFileContext;
  scrollToLine?: number;
  detail?: NodeDetailSnapshot;
  publishComments?: UsePublishCommentsReturn;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const language = useMemo(() => resolveHighlightLanguage(source.filePath), [source.filePath]);
  const highlighted = new Set(source.highlightedLineNumbers);
  const findingsByLine = useMemo(() => groupFindingsByLine(findings ?? []), [findings]);
  const remoteThreadsByLine = useMemo(
    () => groupRemoteThreadsByLine(remoteThreads ?? []),
    [remoteThreads],
  );
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
        <div
          ref={scrollContainerRef}
          className="max-h-[calc(100vh-132px)] overflow-y-auto p-2 text-[11px] leading-[1.35rem] text-[#c9d1d9]"
        >
          <OverviewFindingThreads
            findings={findings ?? []}
            publishProps={
              detail && publishComments
                ? {
                    detail,
                    publishedBySourceKey: publishComments.publishedBySourceKey,
                    commentUrlBySourceKey: publishComments.commentUrlBySourceKey,
                    inFlightKey: publishComments.inFlightKey,
                    errorByKey: publishComments.errorByKey,
                    onPublishFinding: (finding, body) =>
                      void publishComments.publishFinding({ finding, detail, body }),
                    onClearPublishError: publishComments.clearError,
                  }
                : undefined
            }
          />
          {lines.map((line, index) => {
            const actualLine = source.startLine + index;
            const isHighlighted = highlighted.has(actualLine);
            const lineFindings = findingsByLine.get(actualLine) ?? [];
            const lineRemoteThreads = remoteThreadsByLine.get(actualLine) ?? [];
            return (
              <div key={actualLine} data-line={actualLine}>
                <div
                  className={`grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 rounded-[4px] px-1 font-mono ${
                    lineFindings.length > 0
                      ? 'bg-[#ffbf6b]/12 text-[#ffe0b5]'
                      : lineRemoteThreads.length > 0
                        ? 'bg-[#58d7ff]/10 text-[#dff7ff]'
                        : isHighlighted
                          ? 'bg-[#d8e071]/10 text-[#f6ffc0]'
                          : ''
                  }`}
                >
                  <span className="overflow-hidden text-right text-white/28">{actualLine}</span>
                  <span className="min-w-0 whitespace-pre-wrap break-all">
                    {lineFindings.length > 0 ? (
                      <span className="mr-2 inline-flex rounded-[4px] border border-[#ffbf6b]/25 bg-[#ffbf6b]/12 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#ffe0b5]">
                        F{lineFindings.length}
                      </span>
                    ) : null}
                    {lineRemoteThreads.length > 0 ? (
                      <span className="mr-2 inline-flex rounded-[4px] border border-[#58d7ff]/25 bg-[#58d7ff]/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#dff7ff]">
                        R{lineRemoteThreads.length}
                      </span>
                    ) : null}
                    <HighlightedSourceLine
                      filePath={source.filePath}
                      language={language}
                      text={line}
                    />
                  </span>
                </div>
                {lineFindings.length > 0 ? (
                  <AgentFindingThreadLayer
                    findings={lineFindings}
                    publishProps={
                      detail && publishComments
                        ? {
                            detail,
                            publishedBySourceKey: publishComments.publishedBySourceKey,
                            commentUrlBySourceKey: publishComments.commentUrlBySourceKey,
                            inFlightKey: publishComments.inFlightKey,
                            errorByKey: publishComments.errorByKey,
                            onPublishFinding: (finding, body) =>
                              void publishComments.publishFinding({ finding, detail, body }),
                            onClearPublishError: publishComments.clearError,
                          }
                        : undefined
                    }
                  />
                ) : null}
                {lineRemoteThreads.length > 0 ? (
                  <RemoteCommentThreadLayer threads={lineRemoteThreads} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RemoteCommentThreadLayer({
  threads,
}: {
  threads: NodeDetailSnapshot['threads']['remote'];
}) {
  return (
    <div className="border-l-2 border-[#58d7ff]/35 bg-[#58d7ff]/[0.045] px-3 py-3">
      <div className="space-y-3">
        {threads.map((thread) => (
          <RemoteCommentThreadCard key={thread.providerThreadId} thread={thread} />
        ))}
      </div>
    </div>
  );
}

function RemoteCommentThreadCard({
  thread,
}: {
  thread: NodeDetailSnapshot['threads']['remote'][number];
}) {
  const first = thread.comments[0] ?? null;
  const title = first?.author.login ?? 'remote';
  const commentCount = thread.comments.length;
  return (
    <article className="rounded-[8px] border border-[#58d7ff]/18 bg-[#58d7ff]/[0.045] px-3 py-2 text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
      <div className="mb-2 flex items-start gap-2">
        <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-[#58d7ff]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold text-[#dff7ff]">{title}</span>
            <span className="rounded-full border border-[#58d7ff]/20 bg-[#58d7ff]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#dff7ff]/80">
              {commentCount} comment{commentCount === 1 ? '' : 's'}
            </span>
            {thread.isResolved !== null ? (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/55">
                {thread.isResolved ? 'resolved' : 'open'}
              </span>
            ) : null}
            {thread.isOutdated ? (
              <span className="rounded-full border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#ffe0b5]">
                outdated
              </span>
            ) : null}
          </div>
          {first?.createdAt ? (
            <p className="mt-0.5 text-[10px] text-white/36">{formatShortDate(first.createdAt)}</p>
          ) : null}
        </div>
        {first?.url ? (
          <a
            href={first.url}
            target="_blank"
            rel="noreferrer"
            className="flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-[#58d7ff]/18 text-[#dff7ff]/70 transition hover:bg-[#58d7ff]/10 hover:text-[#dff7ff]"
            aria-label="Open remote comment"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <div className="space-y-2">
        {thread.comments.map((comment) => (
          <div
            key={comment.providerCommentId}
            className="border-t border-[#58d7ff]/10 pt-2 first:border-t-0 first:pt-0"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-white/42">
              <span className="font-semibold text-[#dff7ff]/78">{comment.author.login}</span>
              <span>{formatShortDate(comment.createdAt)}</span>
            </div>
            <div className="poc3-remote-comment-body text-[11px] leading-5 text-white/70">
              <Streamdown>{comment.body}</Streamdown>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function OverviewFindingThreads({
  findings,
  publishProps,
}: {
  findings: NodeDetailSnapshot['findings'];
  publishProps?: AgentFindingPublishProps;
}) {
  const overviewFindings = findings.filter((finding) => finding.line === null);
  if (overviewFindings.length === 0) {
    return null;
  }
  return (
    <div className="mb-2 border-l-2 border-fuchsia-400/40 bg-fuchsia-400/[0.05] px-3 py-3">
      <div className="space-y-3">
        {overviewFindings.map((finding) => (
          <AgentFindingThreadCard
            key={finding.findingId}
            finding={finding}
            publishProps={publishProps}
          />
        ))}
      </div>
    </div>
  );
}

function AgentFindingThreadLayer({
  findings,
  publishProps,
}: {
  findings: NodeDetailSnapshot['findings'];
  publishProps?: AgentFindingPublishProps;
}) {
  return (
    <div className="border-l-2 border-fuchsia-400/40 bg-fuchsia-400/[0.05] px-3 py-3">
      <div className="space-y-3">
        {findings.map((finding) => (
          <AgentFindingThreadCard
            key={finding.findingId}
            finding={finding}
            publishProps={publishProps}
          />
        ))}
      </div>
    </div>
  );
}

function AgentFindingThreadCard({
  finding,
  publishProps,
}: {
  finding: NodeDetailSnapshot['findings'][number];
  publishProps?: AgentFindingPublishProps;
}) {
  const threadContext = useAgentThreadConversationContext();
  const { loadOne } = threadContext;
  const headerId = useId();
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPublishComposer, setShowPublishComposer] = useState(false);
  const conversation = threadContext.conversations[finding.localThreadId] ?? null;
  const draft = threadContext.draftReplies[finding.localThreadId] ?? '';
  const isReplyPending = threadContext.isReplyPending(finding.localThreadId);
  const replyStatus = isReplyPending ? 'replying' : (conversation?.replyStatus ?? 'idle');

  const sourceKey = `agent-finding:${finding.localThreadId}`;
  const published = publishProps?.publishedBySourceKey[sourceKey] ?? null;
  const publishInFlight = publishProps?.inFlightKey === sourceKey;
  const publishError = publishProps?.errorByKey[sourceKey] ?? null;
  const publishedCommentUrl = publishProps?.commentUrlBySourceKey[sourceKey] ?? null;

  useEffect(() => {
    if (!isExpanded) {
      return;
    }
    void loadOne(finding.localThreadId);
  }, [finding.localThreadId, isExpanded, loadOne]);

  useEffect(() => {
    if (replyStatus === 'replying' || conversation?.lastError) {
      setIsExpanded(true);
    }
  }, [conversation?.lastError, replyStatus]);

  useEffect(() => {
    if (published) {
      setShowPublishComposer(false);
    }
  }, [published]);

  return (
    <article className="relative overflow-hidden rounded-[8px] bg-[linear-gradient(182.51deg,rgba(255,255,255,0.02)_27.09%,rgba(90,90,90,0.02)_58.59%,rgba(0,0,0,0.02)_92.75%)] px-[9px] py-[7.5px] pl-5 shadow-[0_30.0444px_16.2444px_rgba(0,0,0,0.12),0_15.6px_8.2875px_rgba(0,0,0,0.07),0_6.35556px_4.15556px_rgba(0,0,0,0.04)] backdrop-blur-[10px] [--gradientBorder-gradient:linear-gradient(178.8deg,rgba(255,255,255,0.2464)_10.85%,rgba(20,20,20,0.46)_24.36%,rgba(50,50,50,0.46)_73.67%,rgba(255,255,255,0.46)_90.68%)] [--gradientBorder-size:1px] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-[var(--gradientBorder-size)] before:content-[''] before:[background:var(--gradientBorder-gradient)] before:[user-select:none] before:[-webkit-mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)] before:[mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0.038)_48%,rgba(255,255,255,0.018)_100%)] opacity-80 backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(145%)]"
      />
      <div className="relative z-10">
        <FindingThreadAccordionHeader
          headerId={headerId}
          contentId={contentId}
          finding={finding}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((current) => !current)}
        />
        {isExpanded ? (
          <div id={contentId} role="region" aria-labelledby={headerId}>
            <FindingHeaderBadges finding={finding} />
            {published ? (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 rounded-full border border-[#4EBE96]/25 bg-[#4EBE96]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7f5e8]">
                  posted
                </span>
                {publishedCommentUrl ? (
                  <a
                    href={publishedCommentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-5 items-center justify-center rounded-[5px] border border-[#4EBE96]/20 text-[#d7f5e8]/70 transition hover:bg-[#4EBE96]/10 hover:text-[#d7f5e8]"
                    aria-label="Open published comment"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
                {published.providerCommentIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPublishComposer(true)}
                    className="text-[10px] text-white/42 underline"
                  >
                    再投稿
                  </button>
                ) : null}
              </div>
            ) : finding.line !== null && publishProps ? (
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 rounded-full border border-[#d8e071]/20 bg-[#d8e071]/08 px-2 py-0.5 text-[10px] font-semibold text-[#f6ffc0] transition hover:border-[#d8e071]/40 hover:bg-[#d8e071]/14"
                onClick={() => setShowPublishComposer(true)}
              >
                <SendHorizontal className="size-3" aria-hidden="true" />
                Provider に投稿
              </button>
            ) : null}
            <FindingMessagesList finding={finding} messages={conversation?.messages ?? null} />
            {replyStatus === 'replying' ? (
              <InlineThreadStreamingPanel conversation={conversation} />
            ) : null}
            {conversation?.lastError ? (
              <ThreadErrorBanner message={conversation.lastError} />
            ) : null}
            {showPublishComposer && publishProps ? (
              <FindingPublishComposer
                finding={finding}
                detail={publishProps.detail}
                initialBody={finding.body}
                inFlight={publishInFlight}
                errorMessage={publishError ?? null}
                onSubmit={(body) => {
                  publishProps.onPublishFinding(finding, body);
                }}
                onCancel={() => {
                  setShowPublishComposer(false);
                  if (publishError) {
                    publishProps.onClearPublishError(sourceKey);
                  }
                }}
              />
            ) : null}
            {finding.hasReplyableSession ? (
              <ThreadReplyComposer
                body={draft}
                replyStatus={replyStatus}
                onChange={(body) => threadContext.setDraftReply(finding.localThreadId, body)}
                onSubmit={() => threadContext.submitReply(finding.localThreadId)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function FindingThreadAccordionHeader({
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
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  return (
    <button
      id={headerId}
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-[6px] px-1 py-1 text-left text-[#f8f7f4] transition hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/35"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={contentId}
    >
      <Icon className="size-4 shrink-0 text-fuchsia-100/75" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5">
        {finding.title}
      </span>
      <FindingSeverityBadge finding={finding} />
    </button>
  );
}

function FindingHeaderBadges({ finding }: { finding: NodeDetailSnapshot['findings'][number] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-100">
        Agent Review
      </span>
      <FindingSeverityBadge finding={finding} />
      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d0d5db]">
        {finding.category}
      </span>
      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d0d5db]">
        {finding.confidence}
      </span>
      {finding.status === 'resolved' ? (
        <span className="rounded-full border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d7f5e8]">
          resolved
        </span>
      ) : null}
      {!finding.hasReplyableSession ? (
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#8b949e]">
          read only
        </span>
      ) : null}
    </div>
  );
}

function FindingSeverityBadge({ finding }: { finding: NodeDetailSnapshot['findings'][number] }) {
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

function FindingMessagesList({
  finding,
  messages,
}: {
  finding: NodeDetailSnapshot['findings'][number];
  messages: Poc3AgentThreadMessage[] | null;
}) {
  const visibleMessages =
    messages && messages.length > 0
      ? messages
      : [
          {
            localMessageId: `${finding.localThreadId}:initial`,
            localThreadId: finding.localThreadId,
            role: 'assistant' as const,
            source: 'initial-finding' as const,
            body: finding.body,
            createdAt: '',
          },
        ];

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-fuchsia-200/80" />
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-5 text-[#f8f7f4]">{finding.title}</h4>
          <p className="mt-1 text-[11px] text-[#8b949e]">{formatFindingLocation(finding)}</p>
        </div>
      </div>
      {visibleMessages.map((message) => (
        <ThreadMessageBubble key={message.localMessageId} message={message} />
      ))}
    </div>
  );
}

function ThreadMessageBubble({ message }: { message: Poc3AgentThreadMessage }) {
  const className =
    message.source === 'user-reply'
      ? 'ml-6 border-[#479FFA]/25 bg-[#479FFA]/10 text-[#d7eaff]'
      : message.source === 'agent-reply'
        ? 'ml-6 border-fuchsia-300/18 bg-white/[0.04] text-[#d0d5db]'
        : 'border-fuchsia-400/16 bg-fuchsia-400/[0.06] text-[#d0d5db]';
  return (
    <div className={`rounded-[8px] border px-3 py-2 ${className}`}>
      <MarkdownBody>{message.body}</MarkdownBody>
    </div>
  );
}

function InlineThreadStreamingPanel({
  conversation,
}: {
  conversation:
    | ReturnType<typeof useAgentThreadConversationContext>['conversations'][string]
    | null;
}) {
  const session = conversation?.activeReplySession ?? null;
  const latestTurn = session?.turns.at(-1) ?? null;
  const finalMarkdown = getFinalRichText(session, latestTurn);
  const isActiveTurn = latestTurn
    ? !latestTurn.result && isBusyAgentStatus(latestTurn.status)
    : false;
  const hasVisibleIntermediateContent =
    latestTurn !== null &&
    (latestTurn.intermediateSegments.some((segment) => segment.kind === 'message') || isActiveTurn);
  const waitingText = latestTurn
    ? isActiveTurn
      ? (latestTurn.progressHint?.text ?? session?.progressHint?.text ?? 'Replying...')
      : undefined
    : (session?.progressHint?.text ?? 'Replying...');

  return (
    <div className="mt-3 rounded-[8px] border border-[#d8e071]/20 bg-[#d8e071]/8 px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f6ffc0]">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Agent Replying
      </div>
      {finalMarkdown ? (
        <MarkdownBody>{finalMarkdown}</MarkdownBody>
      ) : latestTurn && hasVisibleIntermediateContent ? (
        <SessionIntermediateSegments
          segments={latestTurn.intermediateSegments}
          isLatestTurn
          turn={latestTurn}
          className="space-y-2"
          chainClassName="rounded-[8px] border-white/[0.08] bg-white/[0.03]"
          chainContentClassName="space-y-1 px-3 pb-2.5"
          reasoningClassName="gap-2 py-1"
          reasoningContentClassName="text-[12px] leading-6"
          activeSegmentClassName="text-[12px] leading-6 text-[#d0d5db]"
          inactiveSegmentClassName="text-[#8b949e]"
          waitingClassName="text-[12px] leading-6 text-[#d0d5db]"
          waitingShimmerClassName="block font-medium"
        />
      ) : latestTurn?.response ? (
        renderStreamingRichText(
          latestTurn.response,
          'whitespace-pre-wrap text-[12px] leading-6 text-[#d0d5db]',
        )
      ) : waitingText ? (
        renderWaitingResponse(waitingText, 'text-[12px] leading-6 text-[#d0d5db]')
      ) : null}
    </div>
  );
}

function getFinalRichText(session: AppSession | null, latestTurn: ConversationTurn | null) {
  if (latestTurn?.result?.kind === 'richText') {
    return latestTurn.result.content.trim();
  }
  if (session?.finalResult?.kind === 'richText') {
    return session.finalResult.content.trim();
  }
  return '';
}

function ThreadErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-[8px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-[12px] leading-5 text-[#ffd9d9]">
      {message}
    </div>
  );
}

function ThreadReplyComposer({
  body,
  replyStatus,
  onChange,
  onSubmit,
}: {
  body: string;
  replyStatus: 'idle' | 'replying' | 'failed';
  onChange(body: string): void;
  onSubmit(): void;
}) {
  const [composing, setComposing] = useState(false);
  const disabled = replyStatus === 'replying' || body.trim().length === 0;
  return (
    <form
      className="mt-3 flex items-end gap-2 border-t border-white/[0.08] pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !composing) {
          onSubmit();
        }
      }}
    >
      <textarea
        value={body}
        rows={2}
        className="min-h-[46px] flex-1 resize-none rounded-[8px] border border-white/[0.1] bg-black/25 px-3 py-2 text-[12px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#479FFA]/45 focus:bg-black/35"
        placeholder="この finding についての追加質問や確認事項を入力してください。"
        onChange={(event) => onChange(event.currentTarget.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          onChange(event.currentTarget.value);
        }}
        onBlur={(event) => onChange(event.currentTarget.value)}
      />
      <button
        type="submit"
        disabled={disabled || composing}
        className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-[#479FFA]/25 bg-[#479FFA]/12 text-[#d7eaff] transition hover:border-[#479FFA]/45 hover:bg-[#479FFA]/18 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
        aria-label="Send finding thread reply"
      >
        {replyStatus === 'replying' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <SendHorizontal className="size-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}

function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="text-[12px] leading-6 [&_code]:rounded-[4px] [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_li]:my-1 [&_ol]:my-1 [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[8px] [&_pre]:bg-black/35 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_ul]:my-1 [&_ul]:pl-5">
      <Streamdown>{children}</Streamdown>
    </div>
  );
}

function formatFindingLocation(finding: NodeDetailSnapshot['findings'][number]): string {
  if (finding.line === null) {
    return 'Overview finding';
  }
  if (finding.endLine !== null && finding.endLine !== finding.line) {
    return `${finding.side ?? 'new'} L${finding.line}-L${finding.endLine}`;
  }
  return `${finding.side ?? 'new'} L${finding.line}`;
}

function groupFindingsByLine(findings: NodeDetailSnapshot['findings']) {
  const map = new Map<number, NodeDetailSnapshot['findings']>();
  for (const finding of findings) {
    if (finding.line === null) {
      continue;
    }
    const current = map.get(finding.line) ?? [];
    current.push(finding);
    map.set(finding.line, current);
  }
  return map;
}

function groupRemoteThreadsByLine(threads: NodeDetailSnapshot['threads']['remote']) {
  const map = new Map<number, NodeDetailSnapshot['threads']['remote']>();
  for (const thread of threads) {
    if (thread.location.kind !== 'diff') {
      continue;
    }
    const line = thread.location.endLine ?? thread.location.startLine;
    if (line === null) {
      continue;
    }
    const current = map.get(line) ?? [];
    current.push(thread);
    map.set(line, current);
  }
  return map;
}

function groupRemoteThreadsByDiffLine(threads: NodeDetailSnapshot['threads']['remote']) {
  const map = new Map<string, NodeDetailSnapshot['threads']['remote']>();
  for (const thread of threads) {
    if (thread.location.kind !== 'diff') {
      continue;
    }
    const line = thread.location.endLine ?? thread.location.startLine;
    if (line === null) {
      continue;
    }
    const key = `${thread.location.side}:${line}`;
    const current = map.get(key) ?? [];
    current.push(thread);
    map.set(key, current);
  }
  return map;
}

function diffLineKey(
  marker: ' ' | '+' | '-',
  oldLineNumber: number | null,
  newLineNumber: number | null,
): string {
  if (marker === '-') {
    return `LEFT:${oldLineNumber ?? ''}`;
  }
  return `RIGHT:${newLineNumber ?? ''}`;
}

function rowLineSide(row: Extract<DiffRow, { type: 'line' }>): 'LEFT' | 'RIGHT' {
  return row.marker === '-' ? 'LEFT' : 'RIGHT';
}

function rowLineNumber(
  row: Extract<DiffRow, { type: 'line' }>,
  side: 'LEFT' | 'RIGHT',
): number | null {
  return side === 'LEFT' ? row.oldLineNumber : row.newLineNumber;
}

function extractPoc3DiffLineInfoFromPoint(
  clientX: number,
  clientY: number,
): { filePath: string; side: 'LEFT' | 'RIGHT'; line: number } | null {
  let element = document.elementFromPoint(clientX, clientY);
  while (element) {
    if (element instanceof HTMLElement && element.dataset.diffLine === 'true') {
      if (element.dataset.selectable !== 'true') return null;
      const side = element.dataset.side;
      const line = Number(element.dataset.line);
      const fileElement = element.closest<HTMLElement>('[data-poc3-diff-file-path]');
      const filePath = fileElement?.dataset.poc3DiffFilePath;
      if ((side === 'LEFT' || side === 'RIGHT') && Number.isFinite(line) && line > 0 && filePath) {
        return { filePath, side, line };
      }
      return null;
    }
    element = element.parentElement;
  }
  return null;
}

function buildManualSelectionSourceKey(
  selection: Poc3DiffLineSelection,
  detail?: NodeDetailSnapshot,
  seed = 0,
): string {
  return [
    'manual-selection',
    seed,
    detail?.reviewWorkspaceId ?? '',
    detail?.revisionId ?? '',
    selection.filePath,
    selection.side,
    selection.startLine,
    selection.endLine,
  ].join(':');
}

function selectionToAnchor(selection: Poc3DiffLineSelection): Poc3InlineCommentAnchor {
  return {
    kind: 'diff',
    filePath: selection.filePath,
    oldPath: selection.oldPath,
    side: selection.side,
    startLine: selection.startLine === selection.endLine ? null : selection.startLine,
    endLine: selection.endLine,
  };
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function DiffPatchSummary({
  detail,
  publishComments,
}: {
  detail: NodeDetailSnapshot;
  publishComments?: UsePublishCommentsReturn;
}) {
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
            remoteThreads={detail.threads.remote}
            detail={detail}
            publishComments={publishComments}
            interactive={Boolean(publishComments)}
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
