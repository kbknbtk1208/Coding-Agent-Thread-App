'use client';

import { ChevronDown, ExternalLink, MessageSquareText } from 'lucide-react';
import { useId, useState } from 'react';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { Poc3PublishedCommentRecord } from '../../../../../shared/poc3-domain/comment-publish';
import { RemoteThreadReplyComposer } from '../../provider-comments/remote-thread-reply-composer';
import { formatShortDate } from '../utils/format';
import { MarkdownBody } from './markdown-body';

export interface RemoteCommentReplyProps {
  detail: NodeDetailSnapshot;
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  draftReplyByThread: Record<string, string>;
  onReply(providerThreadId: string, body: string): void;
  onDraftChange(threadId: string, body: string): void;
  onClearError(sourceKey: string): void;
}

export function isRemoteThreadReplyable(
  thread: NodeDetailSnapshot['threads']['remote'][number],
): boolean {
  return (
    thread.anchorStatus === 'current' &&
    thread.location.kind === 'diff' &&
    thread.comments.length > 0 &&
    (thread.providerThreadId.startsWith('github-review-comment:') ||
      thread.providerThreadId.startsWith('gitlab-discussion:'))
  );
}

export function RemoteCommentThreadLayer({
  threads,
  replyProps,
}: {
  threads: NodeDetailSnapshot['threads']['remote'];
  replyProps?: RemoteCommentReplyProps;
}) {
  return (
    <div className="border-l-2 border-[#58d7ff]/35 bg-[#58d7ff]/[0.045] px-3 py-3">
      <div className="space-y-3">
        {threads.map((thread) => (
          <RemoteCommentThreadCard
            key={thread.providerThreadId}
            thread={thread}
            replyProps={replyProps}
          />
        ))}
      </div>
    </div>
  );
}

function RemoteCommentThreadCard({
  thread,
  replyProps,
}: {
  thread: NodeDetailSnapshot['threads']['remote'][number];
  replyProps?: RemoteCommentReplyProps;
}) {
  const headerId = useId();
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const commentCount = thread.comments.length;
  const firstUrl = thread.comments[0]?.url ?? null;

  return (
    <article className="relative overflow-hidden rounded-[8px] bg-[linear-gradient(182.51deg,rgba(255,255,255,0.02)_27.09%,rgba(90,90,90,0.02)_58.59%,rgba(0,0,0,0.02)_92.75%)] px-[9px] py-[7.5px] pl-5 shadow-[0_30.0444px_16.2444px_rgba(0,0,0,0.12),0_15.6px_8.2875px_rgba(0,0,0,0.07),0_6.35556px_4.15556px_rgba(0,0,0,0.04)] backdrop-blur-[10px] [--gradientBorder-gradient:linear-gradient(178.8deg,rgba(88,215,255,0.2464)_10.85%,rgba(20,20,20,0.46)_24.36%,rgba(50,50,50,0.46)_73.67%,rgba(88,215,255,0.46)_90.68%)] [--gradientBorder-size:1px] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-[var(--gradientBorder-size)] before:content-[''] before:[background:var(--gradientBorder-gradient)] before:[user-select:none] before:[-webkit-mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)] before:[mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[inherit] bg-[linear-gradient(180deg,rgba(88,215,255,0.045)_0%,rgba(88,215,255,0.02)_48%,rgba(255,255,255,0.01)_100%)] opacity-80 backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(145%)]"
      />
      <div className="relative z-10">
        <button
          id={headerId}
          type="button"
          className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] px-1 py-1 text-left text-[#dff7ff] transition hover:bg-[#58d7ff]/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#58d7ff]/35"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
        >
          <ChevronDown
            className={`size-4 shrink-0 text-[#58d7ff]/75 transition-transform duration-200 ease-in-out ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
            aria-hidden="true"
          />
          <MessageSquareText className="size-3.5 shrink-0 text-[#58d7ff]/70" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5">
            {commentCount}件のコメントスレッド
          </span>
          {thread.isResolved !== null ? (
            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/55">
              {thread.isResolved ? 'resolved' : 'open'}
            </span>
          ) : null}
          {thread.isOutdated ? (
            <span className="shrink-0 rounded-full border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#ffe0b5]">
              outdated
            </span>
          ) : null}
          {firstUrl ? (
            <a
              href={firstUrl}
              target="_blank"
              rel="noreferrer"
              className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-[#58d7ff]/18 text-[#dff7ff]/70 transition hover:bg-[#58d7ff]/10 hover:text-[#dff7ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#58d7ff]/35"
              aria-label="Open remote comment"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </button>
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="space-y-2 border-t border-[#58d7ff]/15 pt-2">
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
                    <MarkdownBody variant="compact">{comment.body}</MarkdownBody>
                  </div>
                </div>
              ))}
              {replyProps && isRemoteThreadReplyable(thread) ? (
                <RemoteThreadReplyComposer
                  thread={thread}
                  inFlight={replyProps.inFlightKey === `remote-thread:${thread.providerThreadId}`}
                  published={
                    !!replyProps.publishedBySourceKey[`remote-thread:${thread.providerThreadId}`]
                  }
                  errorMessage={
                    replyProps.errorByKey[`remote-thread:${thread.providerThreadId}`] || null
                  }
                  initialDraft={replyProps.draftReplyByThread[thread.providerThreadId] ?? ''}
                  onSubmit={(body) => {
                    replyProps.onReply(thread.providerThreadId, body);
                  }}
                  onDraftChange={(body) => {
                    replyProps.onDraftChange(thread.providerThreadId, body);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
