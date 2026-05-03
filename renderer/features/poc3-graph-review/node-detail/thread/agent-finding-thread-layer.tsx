'use client';

import { ExternalLink, SendHorizontal } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { Poc3PublishedCommentRecord } from '../../../../../shared/poc3-domain/comment-publish';
import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';
import { useAgentThreadConversationContext } from '../../agent-review/agent-thread-conversation-context';
import { FindingPublishComposer } from '../../provider-comments/finding-publish-composer';
import { resolveProviderLabel } from '../utils/format';
import { FindingThreadAccordionHeader } from './finding-accordion-header';
import { FindingMessagesList } from './finding-messages-list';
import { InlineThreadStreamingPanel } from './inline-thread-streaming-panel';
import { ThreadErrorBanner, ThreadReplyComposer } from './thread-reply-composer';

export interface AgentFindingPublishProps {
  detail: NodeDetailSnapshot;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  onPublishFinding(finding: NodeDetailSnapshot['findings'][number], body: string): void;
  onClearPublishError(sourceKey: string): void;
  providerKind?: ReviewProviderKind;
}

export function OverviewFindingThreads({
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

export function AgentFindingThreadLayer({
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
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
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
              </div>
            ) : null}
            <FindingMessagesList finding={finding} messages={conversation?.messages ?? null} />
            {replyStatus === 'replying' ? (
              <InlineThreadStreamingPanel conversation={conversation} />
            ) : null}
            {conversation?.lastError ? (
              <ThreadErrorBanner message={conversation.lastError} />
            ) : null}
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
