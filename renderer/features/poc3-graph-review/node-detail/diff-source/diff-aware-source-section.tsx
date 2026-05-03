'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type {
  NodeDetailSnapshot,
  NodeDetailViewMode,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { UsePublishCommentsReturn } from '../../provider-comments/use-publish-comments';
import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';
import { DiffInlineCommentComposer } from '../../provider-comments/diff-inline-comment-composer';
import {
  normalizeDiffLineSelection,
  type DiffSelectionState,
} from '../../provider-comments/diff-inline-selection';
import { buildDiffAwareSourceLines, type DiffAwareSourceBase } from '../diff-aware-source-model';
import { buildEffectiveSource } from './build-effective-source';
import { resolveHighlightLanguage } from './highlighted-source-line';
import { DiffAwareSourceRow, ExpandSourceButton } from './diff-aware-source-row';
import {
  awareLineLookupKey,
  groupFindingsByAwareLine,
  groupRemoteThreadsByAwareLine,
  providerLineNumberForAwareLine,
  isSelectableDiffAwareLine,
  isContiguousProviderSelection,
} from '../utils/aware-line-lookup';
import {
  buildManualSelectionSourceKey,
  selectionToAnchor,
} from '../utils/manual-selection-source-key';
import { escapeCssIdentifier } from '../utils/format';
import { extractPoc3SourceLineInfoFromPoint } from '../utils/source-line-info';
import {
  RemoteCommentThreadLayer,
  type RemoteCommentReplyProps,
} from '../thread/remote-thread-layer';
import {
  AgentFindingThreadLayer,
  OverviewFindingThreads,
  type AgentFindingPublishProps,
} from '../thread/agent-finding-thread-layer';

export function DiffAwareSourceSection({
  detail,
  source,
  viewMode,
  onViewModeChange,
  publishComments,
  providerKind,
}: {
  detail: NodeDetailSnapshot;
  source: DiffAwareSourceBase | null;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  publishComments: UsePublishCommentsReturn;
  providerKind?: ReviewProviderKind;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [expandedRange, setExpandedRange] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);
  const [selectionState, setSelectionState] = useState<DiffSelectionState>({
    status: 'idle',
  });
  const [selectionKeySeed, setSelectionKeySeed] = useState(0);
  const [submittedSourceKey, setSubmittedSourceKey] = useState<string | null>(null);
  const dragAnchorRef = useRef<{ side: 'LEFT' | 'RIGHT'; line: number } | null>(null);
  const baseSource = source;
  const fileContext = detail.fileContext;
  const functionCode = detail.functionCode;
  const canExpandWithinFile =
    Boolean(functionCode && fileContext && functionCode.filePath === fileContext.filePath) &&
    baseSource?.filePath === functionCode?.filePath;
  const effectiveRange = useMemo(() => {
    if (!functionCode || !fileContext || !canExpandWithinFile) {
      return null;
    }
    if (viewMode !== 'function') {
      return { startLine: fileContext.startLine, endLine: fileContext.endLine };
    }
    return (
      expandedRange ?? {
        startLine: functionCode.startLine,
        endLine: functionCode.endLine,
      }
    );
  }, [canExpandWithinFile, expandedRange, fileContext, functionCode, viewMode]);
  const effectiveSource = useMemo(
    () => buildEffectiveSource(baseSource, fileContext, effectiveRange),
    [baseSource, effectiveRange, fileContext],
  );
  const language = useMemo(
    () => resolveHighlightLanguage(effectiveSource?.filePath ?? detail.summary.filePath ?? ''),
    [detail.summary.filePath, effectiveSource?.filePath],
  );
  const highlighted = useMemo(
    () => new Set(effectiveSource?.highlightedLineNumbers ?? []),
    [effectiveSource?.highlightedLineNumbers],
  );
  const lines = useMemo(
    () =>
      buildDiffAwareSourceLines({
        source: effectiveSource,
        diffExcerpt: detail.diffExcerpt,
        diffSummary: detail.diffSummary,
        filePath: detail.summary.filePath ?? detail.node.filePath,
      }),
    [
      detail.diffExcerpt,
      detail.diffSummary,
      detail.node.filePath,
      detail.summary.filePath,
      effectiveSource,
    ],
  );
  const findingsByLine = useMemo(
    () => groupFindingsByAwareLine(detail.findings),
    [detail.findings],
  );
  const remoteByLine = useMemo(
    () => groupRemoteThreadsByAwareLine(detail.threads.remote),
    [detail.threads.remote],
  );
  const overviewPublishProps = useMemo<AgentFindingPublishProps>(
    () => ({
      detail,
      publishedBySourceKey: publishComments.publishedBySourceKey,
      commentUrlBySourceKey: publishComments.commentUrlBySourceKey,
      inFlightKey: publishComments.inFlightKey,
      errorByKey: publishComments.errorByKey,
      onPublishFinding: (finding, body) =>
        void publishComments.publishFinding({ finding, detail, body }),
      onClearPublishError: publishComments.clearError,
      providerKind,
    }),
    [detail, providerKind, publishComments],
  );
  const remoteReplyProps = useMemo<RemoteCommentReplyProps>(
    () => ({
      detail,
      inFlightKey: publishComments.inFlightKey,
      errorByKey: publishComments.errorByKey,
      publishedBySourceKey: publishComments.publishedBySourceKey,
      draftReplyByThread: publishComments.draftReplyByThread,
      onReply: (providerThreadId, body) =>
        void publishComments.replyRemoteThread({
          detail,
          providerThreadId,
          body,
        }),
      onDraftChange: publishComments.setDraftReplyByThread,
      onClearError: publishComments.clearError,
    }),
    [detail, publishComments],
  );
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

  useEffect(() => {
    setExpandedRange(null);
    setSelectionState({ status: 'idle' });
    setSubmittedSourceKey(null);
    dragAnchorRef.current = null;
  }, [detail.nodeId, viewMode]);

  useEffect(() => {
    if (!functionCode?.startLine || !scrollContainerRef.current || viewMode === 'function') return;
    const container = scrollContainerRef.current;
    const lineEl = container.querySelector(`[data-line="${functionCode.startLine}"]`);
    if (lineEl instanceof HTMLElement) {
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = lineEl.getBoundingClientRect().top;
      container.scrollTop = Math.max(0, container.scrollTop + lineTop - containerTop - 48);
    }
  }, [functionCode?.startLine, viewMode]);

  const selectionHighlightStyle = useMemo(() => {
    if (!activeSelection) return '';
    const startLine = Math.min(activeSelection.startLine, activeSelection.endLine);
    const endLine = Math.max(activeSelection.startLine, activeSelection.endLine);
    const selectors: string[] = [];
    const escapedPath = escapeCssIdentifier(activeSelection.filePath);
    const scope = `[data-poc3-source-file-path="${escapedPath}"]`;
    for (let line = startLine; line <= endLine; line++) {
      selectors.push(
        `${scope} [data-poc3-source-line="true"][data-side="${activeSelection.side}"][data-line="${line}"]`,
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
    if (event.button !== 0) return;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || !isSelectableDiffAwareLine(lines, info)) return;

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
        filePath: info.filePath,
        oldPath: null,
        side: info.side,
        startLine: info.line,
        endLine: info.line,
      },
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    if (!info || info.side !== anchor.side || !isSelectableDiffAwareLine(lines, info)) return;

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
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    dragAnchorRef.current = null;
    const info = extractPoc3SourceLineInfoFromPoint(event.clientX, event.clientY);
    setSelectionState((prev) => {
      const endLine =
        info && info.side === anchor.side
          ? info.line
          : prev.status === 'selecting'
            ? prev.selection.endLine
            : anchor.line;
      const selection = normalizeDiffLineSelection({
        filePath: info?.filePath ?? (prev.status === 'selecting' ? prev.selection.filePath : ''),
        oldPath: null,
        side: anchor.side,
        startLine: anchor.line,
        endLine,
      });
      if (!isContiguousProviderSelection(lines, selection)) {
        return { status: 'idle' };
      }
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

  const canExpandUp =
    canExpandWithinFile &&
    viewMode === 'function' &&
    effectiveRange !== null &&
    fileContext !== null &&
    effectiveRange.startLine > fileContext.startLine;
  const canExpandDown =
    canExpandWithinFile &&
    viewMode === 'function' &&
    effectiveRange !== null &&
    fileContext !== null &&
    effectiveRange.endLine < fileContext.endLine;
  const expandRange = (direction: 'up' | 'down') => {
    if (!functionCode || !fileContext || !effectiveRange) return;
    const next =
      direction === 'up'
        ? {
            startLine: Math.max(fileContext.startLine, effectiveRange.startLine - 20),
            endLine: effectiveRange.endLine,
          }
        : {
            startLine: effectiveRange.startLine,
            endLine: Math.min(fileContext.endLine, effectiveRange.endLine + 20),
          };
    setExpandedRange(next);
    onViewModeChange('function');
  };

  return (
    <section className="node-detail-code diff-tailwindcss-wrapper flex flex-col" data-theme="dark">
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/45">
        {lines.length > 0 ? (
          <div
            ref={scrollContainerRef}
            className="max-h-[calc(100vh-132px)] overflow-auto p-2 font-mono text-[11px] leading-[1.35rem] text-[#c9d1d9]"
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
            {canExpandUp ? (
              <ExpandSourceButton direction="up" onClick={() => expandRange('up')} />
            ) : null}
            <OverviewFindingThreads
              findings={detail.findings}
              publishProps={overviewPublishProps}
            />
            <div
              className="min-w-full"
              data-poc3-source-file-path={
                effectiveSource?.filePath ?? detail.summary.filePath ?? ''
              }
            >
              {lines.map((line) => {
                const lineFindings = findingsByLine.get(awareLineLookupKey(line)) ?? [];
                const lineThreads = remoteByLine.get(awareLineLookupKey(line)) ?? [];
                const providerLineNumber = providerLineNumberForAwareLine(line);
                return (
                  <div
                    key={line.key}
                    data-line={line.newLineNumber ?? line.oldLineNumber ?? undefined}
                  >
                    <DiffAwareSourceRow
                      line={line}
                      language={language}
                      isHighlighted={
                        line.newLineNumber !== null && highlighted.has(line.newLineNumber)
                      }
                      findingCount={lineFindings.length}
                      remoteThreadCount={lineThreads.length}
                    />
                    {lineFindings.length > 0 ? (
                      <AgentFindingThreadLayer
                        findings={lineFindings}
                        publishProps={overviewPublishProps}
                      />
                    ) : null}
                    {lineThreads.length > 0 ? (
                      <RemoteCommentThreadLayer
                        threads={lineThreads}
                        replyProps={remoteReplyProps}
                      />
                    ) : null}
                    {composerSelection &&
                    line.side === composerSelection.side &&
                    providerLineNumber === composerSelection.endLine &&
                    composerSourceKey &&
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
            {canExpandDown ? (
              <ExpandSourceButton direction="down" onClick={() => expandRange('down')} />
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-3 text-[12px] text-white/55">
            表示できるコードまたは diff がありません。
          </div>
        )}
      </div>
    </section>
  );
}
