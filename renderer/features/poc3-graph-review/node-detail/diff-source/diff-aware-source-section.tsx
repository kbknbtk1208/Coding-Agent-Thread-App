'use client';

import { useEffect, useMemo } from 'react';
import { useRegisterScrollTarget } from '../test-case-summary';
import type {
  NodeCompanionDetailSnapshot,
  NodeDetailSnapshot,
  NodeDetailViewMode,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { UsePublishCommentsReturn } from '../../provider-comments/use-publish-comments';
import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';
import type { DiffAwareSourceBase } from '../diff-aware-source-model';
import {
  groupFindingsByAwareLine,
  groupRemoteThreadsByAwareLine,
} from '../utils/aware-line-lookup';
import type { RemoteCommentReplyProps } from '../thread/remote-thread-layer';
import type { AgentFindingPublishProps } from '../thread/agent-finding-thread-layer';
import {
  buildDiffSourceVirtualItems,
  buildLineMetaByKey,
  hasOverviewFindings,
} from './diff-source-virtual-items';
import { useDiffLineSelection } from './use-diff-line-selection';
import { VirtualDiffSourceList } from './virtual-diff-source-list';

export function DiffAwareSourceSection({
  detail,
  source,
  viewMode,
  onViewModeChange,
  publishComments,
  providerKind,
  onThreadResolved,
}: {
  detail: NodeDetailSnapshot | NodeCompanionDetailSnapshot;
  source: DiffAwareSourceBase | null;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  publishComments: UsePublishCommentsReturn;
  providerKind?: ReviewProviderKind;
  onThreadResolved?: () => void;
}) {
  const fileContext = 'fileContext' in detail ? detail.fileContext : null;
  const functionCode = 'functionCode' in detail ? detail.functionCode : null;
  const canExpandWithinFile =
    Boolean(functionCode && fileContext && functionCode.filePath === fileContext.filePath) &&
    source?.filePath === functionCode?.filePath;

  const {
    lines,
    language,
    highlighted,
    effectiveFilePath,
    selectionState,
    activeSelection,
    activeSelectableLine,
    composerSelection,
    composerSourceKey,
    composerDraft,
    composerError,
    isComposerInFlight,
    canExpandUp,
    canExpandDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleRowFocus,
    handleRowKeyDown,
    closeComposer,
    setComposerDraft,
    submitInlineComment,
    expandRange,
    registerVirtualScroller,
    scrollToSourceLine,
    scrollContainerRef,
  } = useDiffLineSelection({
    detail,
    source,
    publishComments,
    viewMode,
    onViewModeChange,
    fileContext,
    canExpandWithinFile,
  });

  const registerScrollTarget = useRegisterScrollTarget();
  useEffect(() => {
    registerScrollTarget((line: number) => {
      scrollToSourceLine(line);
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const lineEl =
          container.querySelector<HTMLElement>(
            `[data-poc3-source-line="true"][data-new-line="${line}"]`,
          ) ??
          container.querySelector<HTMLElement>(
            `[data-poc3-source-line="true"][data-line="${line}"]`,
          );
        if (!lineEl) return;
        lineEl.classList.add('animate-test-case-flash');
        window.setTimeout(() => {
          lineEl.classList.remove('animate-test-case-flash');
        }, 1500);
      });
    });
    return () => registerScrollTarget(null);
  }, [registerScrollTarget, scrollContainerRef, scrollToSourceLine]);

  const findingsByLine = useMemo(
    () => groupFindingsByAwareLine(detail.findings),
    [detail.findings],
  );
  const remoteByLine = useMemo(
    () => groupRemoteThreadsByAwareLine(detail.threads.remote),
    [detail.threads.remote],
  );
  const includeOverviewFindings = useMemo(
    () => hasOverviewFindings(detail.findings),
    [detail.findings],
  );
  const virtualItemsModel = useMemo(
    () =>
      buildDiffSourceVirtualItems({
        lines,
        canExpandUp,
        canExpandDown,
        includeOverviewFindings,
      }),
    [canExpandDown, canExpandUp, includeOverviewFindings, lines],
  );
  const lineMetaByKey = useMemo(
    () => buildLineMetaByKey({ lines, findingsByLine, remoteByLine }),
    [findingsByLine, lines, remoteByLine],
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
      onThreadResolved,
    }),
    [detail, onThreadResolved, providerKind, publishComments],
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
      onThreadResolved,
    }),
    [detail, onThreadResolved, publishComments],
  );
  const listHandlers = useMemo(
    () => ({
      onExpandRange: expandRange,
      onRowFocus: handleRowFocus,
      onRowKeyDown: handleRowKeyDown,
      onCloseComposer: closeComposer,
      onComposerDraftChange: setComposerDraft,
      onSubmitInlineComment: submitInlineComment,
      registerVirtualScroller,
    }),
    [
      closeComposer,
      expandRange,
      handleRowFocus,
      handleRowKeyDown,
      registerVirtualScroller,
      setComposerDraft,
      submitInlineComment,
    ],
  );

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
            onPointerCancel={handlePointerCancel}
            style={{
              touchAction: 'none',
              ...(selectionState.status === 'selecting' ? { userSelect: 'none' as const } : {}),
            }}
          >
            <VirtualDiffSourceList
              items={virtualItemsModel.items}
              virtualItemsModel={virtualItemsModel}
              lineMetaByKey={lineMetaByKey}
              scrollContainerRef={scrollContainerRef}
              activeSelection={activeSelection}
              activeSelectableLine={activeSelectableLine}
              composerSelection={composerSelection}
              composerSourceKey={composerSourceKey}
              composerDraft={composerDraft}
              composerError={composerError}
              isComposerInFlight={isComposerInFlight}
              language={language}
              highlighted={highlighted}
              effectiveFilePath={effectiveFilePath}
              overviewPublishProps={overviewPublishProps}
              remoteReplyProps={remoteReplyProps}
              handlers={listHandlers}
            />
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
