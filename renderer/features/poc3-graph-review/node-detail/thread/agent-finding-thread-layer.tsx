'use client';

import { ExternalLink, SendHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type {
  NodeCompanionDetailSnapshot,
  NodeDetailSnapshot,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { Poc3PublishedCommentRecord } from '../../../../../shared/poc3-domain/comment-publish';
import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';
import { useAgentThreadConversationContext } from '../../agent-review/agent-thread-conversation-context';
import {
  isAgentThreadScrollTarget,
  useNodeDetailScrollTarget,
} from '../node-detail-scroll-target-context';
import { FindingPublishComposer } from '../../provider-comments/finding-publish-composer';
import {
  ResolveJudgementPill,
  ResolveJudgementReasonBlock,
} from '../../resolve-judgement/resolve-judgement-card-decoration';
import {
  ResolveErrorBanner,
  ResolveThreadButton,
  ResolvedBadge,
} from '../../thread-resolve/resolve-thread-button';
import {
  lookupResolveJudgement,
  useResolveJudgementContext,
} from '../../resolve-judgement/resolve-judgement-context';
import { formatShortDate, resolveProviderLabel } from '../utils/format';
import { FindingThreadAccordionHeader } from './finding-accordion-header';
import { FindingMessagesList } from './finding-messages-list';
import { InlineThreadStreamingPanel } from './inline-thread-streaming-panel';
import { MarkdownBody } from './markdown-body';
import { ThreadErrorBanner, ThreadReplyComposer } from './thread-reply-composer';

export interface AgentFindingPublishProps {
  detail: NodeDetailSnapshot | NodeCompanionDetailSnapshot;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  onPublishFinding(finding: NodeDetailSnapshot['findings'][number], body: string): void;
  onClearPublishError(sourceKey: string): void;
  onThreadResolved?: () => void;
  providerKind?: ReviewProviderKind;
}

export function OverviewFindingThreads({
  findings,
  publishProps,
  reviewWorkspaceId,
  revisionId,
}: {
  findings: NodeDetailSnapshot['findings'];
  publishProps?: AgentFindingPublishProps;
  reviewWorkspaceId: string;
  revisionId: string;
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
            reviewWorkspaceId={reviewWorkspaceId}
            revisionId={revisionId}
          />
        ))}
      </div>
    </div>
  );
}

export function AgentFindingThreadLayer({
  findings,
  publishProps,
  reviewWorkspaceId,
  revisionId,
}: {
  findings: NodeDetailSnapshot['findings'];
  publishProps?: AgentFindingPublishProps;
  reviewWorkspaceId: string;
  revisionId: string;
}) {
  return (
    <div className="border-l-2 border-fuchsia-400/40 bg-fuchsia-400/[0.05] px-3 py-3">
      <div className="space-y-3">
        {findings.map((finding) => (
          <AgentFindingThreadCard
            key={finding.findingId}
            finding={finding}
            publishProps={publishProps}
            reviewWorkspaceId={reviewWorkspaceId}
            revisionId={revisionId}
          />
        ))}
      </div>
    </div>
  );
}

function AgentFindingThreadCard({
  finding,
  publishProps,
  reviewWorkspaceId,
  revisionId,
}: {
  finding: NodeDetailSnapshot['findings'][number];
  publishProps?: AgentFindingPublishProps;
  reviewWorkspaceId: string;
  revisionId: string;
}) {
  const threadContext = useAgentThreadConversationContext();
  const { loadOne } = threadContext;
  const resolveJudgementContext = useResolveJudgementContext();
  const scrollTarget = useNodeDetailScrollTarget();
  const articleRef = useRef<HTMLElement | null>(null);
  const handledScrollNonceRef = useRef<number | null>(null);
  const headerId = useId();
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPublishComposer, setShowPublishComposer] = useState(false);
  const [optimisticResolved, setOptimisticResolved] = useState(false);
  const [resolveInFlight, setResolveInFlight] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const displayStatus = optimisticResolved ? 'resolved' : finding.status;
  const displayableRemoteThreads = finding.publishedRemoteThreads
    .filter((item) => item.status === 'active' && item.remoteThread)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const missingRemoteCount = finding.publishedRemoteThreads.filter(
    (item) => item.status === 'missingRemote' || !item.remoteThread,
  ).length;
  const initialRemoteThreadId =
    displayableRemoteThreads.find((item) => item.remoteThread?.isResolved === false)
      ?.providerThreadId ??
    displayableRemoteThreads[0]?.providerThreadId ??
    null;
  const [viewMode, setViewMode] = useState<'agent' | 'remote'>('agent');
  const [selectedRemoteThreadId, setSelectedRemoteThreadId] = useState<string | null>(
    initialRemoteThreadId,
  );
  const conversation = threadContext.conversations[finding.localThreadId] ?? null;
  const draft = threadContext.draftReplies[finding.localThreadId] ?? '';
  const isReplyPending = threadContext.isReplyPending(finding.localThreadId);
  const replyStatus = isReplyPending ? 'replying' : (conversation?.replyStatus ?? 'idle');
  const judgement =
    displayStatus === 'resolved'
      ? null
      : lookupResolveJudgement(resolveJudgementContext, {
          reviewWorkspaceId,
          revisionId,
          commentType: 'agent-thread',
          commentId: finding.localThreadId,
        });

  const sourceKey = `agent-finding:${finding.localThreadId}`;
  const published = publishProps?.publishedBySourceKey[sourceKey] ?? null;
  const publishInFlight = publishProps?.inFlightKey === sourceKey;
  const publishError = publishProps?.errorByKey[sourceKey] ?? null;
  const publishedCommentUrl = publishProps?.commentUrlBySourceKey[sourceKey] ?? null;
  const selectedRemote =
    displayableRemoteThreads.find((item) => item.providerThreadId === selectedRemoteThreadId) ??
    displayableRemoteThreads[0] ??
    null;
  const firstRemoteUrl =
    selectedRemote?.remoteThread?.comments[0]?.url ?? publishedCommentUrl ?? null;
  const postedCount =
    finding.publishedRemoteThreads.length > 0
      ? finding.publishedRemoteThreads.length
      : published
        ? 1
        : 0;

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

  useEffect(() => {
    if (!selectedRemoteThreadId && initialRemoteThreadId) {
      setSelectedRemoteThreadId(initialRemoteThreadId);
    }
    if (
      selectedRemoteThreadId &&
      !displayableRemoteThreads.some((item) => item.providerThreadId === selectedRemoteThreadId)
    ) {
      setSelectedRemoteThreadId(initialRemoteThreadId);
    }
    if (displayableRemoteThreads.length === 0) {
      setViewMode('agent');
    }
  }, [displayableRemoteThreads, initialRemoteThreadId, selectedRemoteThreadId]);

  useEffect(() => {
    if (!isAgentThreadScrollTarget(scrollTarget, finding.localThreadId)) return;
    if (handledScrollNonceRef.current === scrollTarget.nonce) return;
    handledScrollNonceRef.current = scrollTarget.nonce;
    setIsExpanded(true);
    const frameId = window.requestAnimationFrame(() => {
      articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [finding.localThreadId, scrollTarget]);

  const handleResolve = async () => {
    if (resolveInFlight) return;
    setResolveInFlight(true);
    setResolveError(null);
    setOptimisticResolved(true);
    const result = await window.poc3GraphReviewApi.resolveAgentThread({
      reviewWorkspaceId,
      revisionId,
      localThreadId: finding.localThreadId,
    });
    setResolveInFlight(false);
    if (!result.ok) {
      setOptimisticResolved(false);
      setResolveError(result.message);
      return;
    }
    const failedCount = result.remoteResults.filter((item) => item.status === 'failed').length;
    if (failedCount > 0) {
      setResolveError('一部の Remote Comment を resolve できませんでした。');
    }
    publishProps?.onThreadResolved?.();
  };

  return (
    <article
      ref={articleRef}
      data-thread-id={`agent:${finding.localThreadId}`}
      className="relative overflow-hidden rounded-[8px] bg-[linear-gradient(182.51deg,rgba(255,255,255,0.02)_27.09%,rgba(90,90,90,0.02)_58.59%,rgba(0,0,0,0.02)_92.75%)] px-[9px] py-[7.5px] pl-5 shadow-[0_30.0444px_16.2444px_rgba(0,0,0,0.12),0_15.6px_8.2875px_rgba(0,0,0,0.07),0_6.35556px_4.15556px_rgba(0,0,0,0.04)] [--gradientBorder-gradient:linear-gradient(178.8deg,rgba(255,255,255,0.2464)_10.85%,rgba(20,20,20,0.46)_24.36%,rgba(50,50,50,0.46)_73.67%,rgba(255,255,255,0.46)_90.68%)] [--gradientBorder-size:1px] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-[var(--gradientBorder-size)] before:content-[''] before:[background:var(--gradientBorder-gradient)] before:[user-select:none] before:[-webkit-mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)] before:[mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0.038)_48%,rgba(255,255,255,0.018)_100%)] opacity-80"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <FindingThreadAccordionHeader
              headerId={headerId}
              contentId={contentId}
              finding={finding}
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((current) => !current)}
            />
          </div>
          {judgement ? <ResolveJudgementPill judgement={judgement} /> : null}
          {displayStatus === 'resolved' ? <ResolvedBadge /> : null}
          {finding.line !== null && displayStatus === 'open' ? (
            <ResolveThreadButton inFlight={resolveInFlight} onClick={handleResolve} />
          ) : null}
        </div>
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            {judgement ? <ResolveJudgementReasonBlock judgement={judgement} /> : null}
            {resolveError ? <ResolveErrorBanner message={resolveError} /> : null}
            {finding.publishedRemoteThreads.length > 0 || published ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1.5 rounded-full border border-[#4EBE96]/25 bg-[#4EBE96]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7f5e8]">
                  posted {postedCount}
                </span>
                {missingRemoteCount > 0 ? (
                  <span className="rounded-full border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#ffe0b5]">
                    missing {missingRemoteCount}
                  </span>
                ) : null}
                {displayableRemoteThreads.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setViewMode((current) => (current === 'agent' ? 'remote' : 'agent'))
                    }
                    className="cursor-pointer rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    {viewMode === 'agent' ? 'Remote' : 'Agent'}
                  </button>
                ) : null}
                {firstRemoteUrl ? (
                  <a
                    href={firstRemoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-5 items-center justify-center rounded-[5px] border border-[#4EBE96]/20 text-[#d7f5e8]/70 transition hover:bg-[#4EBE96]/10 hover:text-[#d7f5e8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4EBE96]/35"
                    aria-label="Open published comment"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
            {viewMode === 'remote' && selectedRemote?.remoteThread ? (
              <div className="mt-2 space-y-2 border-t border-[#58d7ff]/15 pt-2">
                {displayableRemoteThreads.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayableRemoteThreads.map((item, index) => (
                      <button
                        key={item.linkId}
                        type="button"
                        onClick={() => setSelectedRemoteThreadId(item.providerThreadId)}
                        className={`cursor-pointer rounded-[6px] border px-2 py-0.5 text-[10px] font-semibold transition ${
                          item.providerThreadId === selectedRemote.providerThreadId
                            ? 'border-[#58d7ff]/35 bg-[#58d7ff]/12 text-[#dff7ff]'
                            : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.07]'
                        }`}
                      >
                        Remote {displayableRemoteThreads.length - index}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedRemote.remoteThread.comments.map((comment) => (
                  <div
                    key={comment.providerCommentId}
                    className="border-t border-[#58d7ff]/10 pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-white/42">
                      <span className="font-semibold text-[#dff7ff]/78">
                        {comment.author.login}
                      </span>
                      <span>{formatShortDate(comment.createdAt)}</span>
                    </div>
                    <div className="poc3-remote-comment-body text-[11px] leading-5 text-white/70">
                      <MarkdownBody variant="compact">{comment.body}</MarkdownBody>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <FindingMessagesList finding={finding} messages={conversation?.messages ?? null} />
                {replyStatus === 'replying' ? (
                  <InlineThreadStreamingPanel conversation={conversation} />
                ) : null}
                {conversation?.lastError ? (
                  <ThreadErrorBanner message={conversation.lastError} />
                ) : null}
              </>
            )}
            {finding.line !== null && publishProps ? (
              published ? (
                published.providerCommentIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPublishComposer(true)}
                    className="mt-2 cursor-pointer text-[10px] text-white/42 underline"
                  >
                    再投稿
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-full border border-[#d8e071]/20 bg-[#d8e071]/08 px-2 py-0.5 text-[10px] font-semibold text-[#f6ffc0] transition hover:border-[#d8e071]/40 hover:bg-[#d8e071]/14"
                  onClick={() => setShowPublishComposer(true)}
                >
                  <SendHorizontal className="size-3" aria-hidden="true" />
                  {resolveProviderLabel(publishProps.providerKind)} に投稿
                </button>
              )
            ) : null}
            {publishProps ? (
              <FindingPublishComposer
                finding={finding}
                detail={publishProps.detail}
                initialBody={finding.body}
                inFlight={publishInFlight}
                errorMessage={publishError ?? null}
                providerKind={publishProps.providerKind}
                open={showPublishComposer}
                onOpenChange={(open) => {
                  if (!open) {
                    setShowPublishComposer(false);
                    if (publishError) {
                      publishProps.onClearPublishError(sourceKey);
                    }
                  }
                }}
                onSubmit={(body) => {
                  publishProps.onPublishFinding(finding, body);
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
        </div>
      </div>
    </article>
  );
}
