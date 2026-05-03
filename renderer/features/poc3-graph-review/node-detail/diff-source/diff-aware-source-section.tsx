'use client';

import { useMemo } from 'react';
import type {
  NodeDetailSnapshot,
  NodeDetailViewMode,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { UsePublishCommentsReturn } from '../../provider-comments/use-publish-comments';
import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';
import { DiffInlineCommentComposer } from '../../provider-comments/diff-inline-comment-composer';
import type { DiffAwareSourceBase } from '../diff-aware-source-model';
import {
  awareLineLookupKey,
  groupFindingsByAwareLine,
  groupRemoteThreadsByAwareLine,
  providerLineNumberForAwareLine,
} from '../utils/aware-line-lookup';
import {
  RemoteCommentThreadLayer,
  type RemoteCommentReplyProps,
} from '../thread/remote-thread-layer';
import {
  AgentFindingThreadLayer,
  OverviewFindingThreads,
  type AgentFindingPublishProps,
} from '../thread/agent-finding-thread-layer';
import { DiffAwareSourceRow, ExpandSourceButton } from './diff-aware-source-row';
import { useDiffLineSelection } from './use-diff-line-selection';

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
  const fileContext = detail.fileContext;
  const functionCode = detail.functionCode;
  const canExpandWithinFile =
    Boolean(functionCode && fileContext && functionCode.filePath === fileContext.filePath) &&
    source?.filePath === functionCode?.filePath;

  const {
    lines,
    language,
    highlighted,
    effectiveFilePath,
    selectionState,
    composerSelection,
    composerSourceKey,
    composerError,
    isComposerInFlight,
    selectionHighlightStyle,
    canExpandUp,
    canExpandDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    closeComposer,
    submitInlineComment,
    expandRange,
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
            {canExpandUp ? (
              <ExpandSourceButton direction="up" onClick={() => expandRange('up')} />
            ) : null}
            <OverviewFindingThreads
              findings={detail.findings}
              publishProps={overviewPublishProps}
            />
            <div className="min-w-full" data-poc3-source-file-path={effectiveFilePath}>
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
                        onSubmit={submitInlineComment}
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
