'use client';

import { useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DiffInlineCommentComposer } from '../../provider-comments/diff-inline-comment-composer';
import type { Poc3DiffLineSelection } from '../../provider-comments/diff-inline-selection';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';
import {
  AgentFindingThreadLayer,
  OverviewFindingThreads,
  type AgentFindingPublishProps,
} from '../thread/agent-finding-thread-layer';
import {
  RemoteCommentThreadLayer,
  type RemoteCommentReplyProps,
} from '../thread/remote-thread-layer';
import { DiffAwareSourceRow, ExpandSourceButton } from './diff-aware-source-row';
import {
  type DiffSourceLineMeta,
  type DiffSourceVirtualItem,
  type DiffSourceVirtualItemsModel,
  isLineInActiveSelection,
} from './diff-source-virtual-items';
import type { DiffLineVirtualScroller } from './use-diff-line-selection';

export interface DiffSourceListHandlers {
  onExpandRange(direction: 'up' | 'down'): void;
  onRowFocus(line: DiffAwareSourceLine): void;
  onRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>, line: DiffAwareSourceLine): void;
  onCloseComposer(): void;
  onComposerDraftChange(body: string): void;
  onSubmitInlineComment(body: string): void;
  registerVirtualScroller(scroller: DiffLineVirtualScroller | null): void;
}

export interface VirtualDiffSourceListProps {
  items: DiffSourceVirtualItem[];
  virtualItemsModel: DiffSourceVirtualItemsModel;
  lineMetaByKey: Map<string, DiffSourceLineMeta>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  activeSelection: Poc3DiffLineSelection | null;
  activeSelectableLine: DiffAwareSourceLine | null;
  composerSelection: Poc3DiffLineSelection | null;
  composerSourceKey: string | null;
  composerDraft: string;
  composerError: string;
  isComposerInFlight: boolean;
  language: string;
  highlighted: Set<number>;
  effectiveFilePath: string;
  overviewPublishProps: AgentFindingPublishProps;
  remoteReplyProps: RemoteCommentReplyProps;
  handlers: DiffSourceListHandlers;
}

export function VirtualDiffSourceList({
  items,
  virtualItemsModel,
  lineMetaByKey,
  scrollContainerRef,
  activeSelection,
  activeSelectableLine,
  composerSelection,
  composerSourceKey,
  composerDraft,
  composerError,
  isComposerInFlight,
  language,
  highlighted,
  effectiveFilePath,
  overviewPublishProps,
  remoteReplyProps,
  handlers,
}: VirtualDiffSourceListProps) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey: (index) => items[index]?.key ?? index,
    estimateSize: (index) => estimateDiffSourceItemSize(items[index], lineMetaByKey),
    overscan: 12,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    const focusLineAfterScroll = (line: DiffAwareSourceLine) => {
      const index = virtualItemsModel.sourceItemIndexByLineKey.get(line.key);
      if (index === undefined) return;
      virtualizer.scrollToIndex(index, { align: 'auto' });
      requestAnimationFrame(() => {
        getVisibleRowElement(scrollContainerRef.current, line)?.focus();
      });
    };

    handlers.registerVirtualScroller({
      scrollToNewLine(lineNumber, options) {
        const index = virtualItemsModel.firstNewLineItemIndexByLineNumber.get(lineNumber);
        if (index === undefined) return false;
        virtualizer.scrollToIndex(index, { align: options?.align ?? 'start' });
        const offset = options?.offset;
        if (offset) {
          requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (container) {
              container.scrollTop = Math.max(0, container.scrollTop - offset);
            }
          });
        }
        return true;
      },
      focusLine(line) {
        focusLineAfterScroll(line);
      },
    });
    return () => handlers.registerVirtualScroller(null);
  }, [handlers, scrollContainerRef, virtualItemsModel, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      className="relative min-w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
      data-poc3-source-file-path={effectiveFilePath}
    >
      {virtualRows.map((virtualRow) => {
        const item = items[virtualRow.index];
        if (!item) return null;
        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderVirtualItem({
              item,
              lineMetaByKey,
              activeSelection,
              activeSelectableLine,
              composerSelection,
              composerSourceKey,
              composerDraft,
              composerError,
              isComposerInFlight,
              language,
              highlighted,
              overviewPublishProps,
              remoteReplyProps,
              handlers,
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderVirtualItem({
  item,
  lineMetaByKey,
  activeSelection,
  activeSelectableLine,
  composerSelection,
  composerSourceKey,
  composerDraft,
  composerError,
  isComposerInFlight,
  language,
  highlighted,
  overviewPublishProps,
  remoteReplyProps,
  handlers,
}: Omit<
  VirtualDiffSourceListProps,
  'items' | 'virtualItemsModel' | 'scrollContainerRef' | 'effectiveFilePath'
> & {
  item: DiffSourceVirtualItem;
}) {
  if (item.kind === 'expand-up') {
    return <ExpandSourceButton direction="up" onClick={() => handlers.onExpandRange('up')} />;
  }
  if (item.kind === 'expand-down') {
    return <ExpandSourceButton direction="down" onClick={() => handlers.onExpandRange('down')} />;
  }
  if (item.kind === 'overview-findings') {
    return (
      <OverviewFindingThreads
        findings={overviewPublishProps.detail.findings}
        publishProps={overviewPublishProps}
        reviewWorkspaceId={overviewPublishProps.detail.reviewWorkspaceId}
        revisionId={overviewPublishProps.detail.revisionId}
      />
    );
  }

  const line = item.line;
  const meta = lineMetaByKey.get(line.key);
  const findings = meta?.findings ?? [];
  const remoteThreads = meta?.remoteThreads ?? [];
  const providerLineNumber = meta?.providerLineNumber ?? null;
  const isSelected = isLineInActiveSelection(line, activeSelection, providerLineNumber);

  return (
    <div data-line={line.newLineNumber ?? line.oldLineNumber ?? undefined}>
      <DiffAwareSourceRow
        line={line}
        language={language}
        isHighlighted={line.newLineNumber !== null && highlighted.has(line.newLineNumber)}
        isSelected={isSelected}
        isSelectable={line.selectableForProviderComment}
        isActive={line === activeSelectableLine}
        findingCount={findings.length}
        remoteThreadCount={remoteThreads.length}
        onFocusLine={handlers.onRowFocus}
        onKeyDownLine={handlers.onRowKeyDown}
      />
      {findings.length > 0 ? (
        <AgentFindingThreadLayer
          findings={findings}
          publishProps={overviewPublishProps}
          reviewWorkspaceId={overviewPublishProps.detail.reviewWorkspaceId}
          revisionId={overviewPublishProps.detail.revisionId}
        />
      ) : null}
      {remoteThreads.length > 0 ? (
        <RemoteCommentThreadLayer
          threads={remoteThreads}
          replyProps={remoteReplyProps}
          reviewWorkspaceId={overviewPublishProps.detail.reviewWorkspaceId}
          revisionId={overviewPublishProps.detail.revisionId}
        />
      ) : null}
      {composerSelection &&
      line.side === composerSelection.side &&
      providerLineNumber === composerSelection.endLine &&
      composerSourceKey ? (
        <DiffInlineCommentComposer
          selection={composerSelection}
          body={composerDraft}
          inFlight={isComposerInFlight}
          errorMessage={composerError || null}
          onBodyChange={handlers.onComposerDraftChange}
          onClose={handlers.onCloseComposer}
          onSubmit={handlers.onSubmitInlineComment}
        />
      ) : null}
    </div>
  );
}

function estimateDiffSourceItemSize(
  item: DiffSourceVirtualItem | undefined,
  lineMetaByKey: Map<string, DiffSourceLineMeta>,
) {
  if (!item) return 24;
  if (item.kind === 'overview-findings') return 160;
  if (item.kind === 'expand-up' || item.kind === 'expand-down') return 28;
  const meta = lineMetaByKey.get(item.line.key);
  if ((meta?.findings.length ?? 0) > 0 || (meta?.remoteThreads.length ?? 0) > 0) {
    return 72;
  }
  return 24;
}

function getVisibleRowElement(
  container: HTMLDivElement | null,
  targetLine: DiffAwareSourceLine,
): HTMLElement | null {
  if (!container) return null;
  const targetSide = targetLine.side;
  const targetProviderLine =
    targetSide === 'LEFT' ? targetLine.oldLineNumber : targetLine.newLineNumber;
  if (targetSide === null || targetProviderLine === null) return null;
  return container.querySelector<HTMLElement>(
    `[data-poc3-source-line="true"][data-side="${targetSide}"][data-line="${targetProviderLine}"]`,
  );
}
