import React, { useMemo } from 'react';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { DraftThreadCard } from './draft-thread-card';
import { reviewTheme } from './review-ui';

interface OverviewDraftThreadSectionProps {
  threads: ReviewLocalThread[];
  selectedLocalThreadId: string | null;
  replyBodies: Record<string, string>;
  onSelectThread: (localThreadId: string) => void;
  onReplyBodyChange: (localThreadId: string, body: string) => void;
  onSubmitReply: (localThreadId: string, body: string) => void;
  onRespondToPermission: (localThreadId: string, requestId: string, actionId: string) => void;
}

export function OverviewDraftThreadSection({
  threads,
  selectedLocalThreadId,
  replyBodies,
  onSelectThread,
  onReplyBodyChange,
  onSubmitReply,
  onRespondToPermission,
}: OverviewDraftThreadSectionProps) {
  const sortedThreads = useMemo(
    () =>
      [...threads].sort((left, right) => left.draft.title.localeCompare(right.draft.title, 'ja')),
    [threads],
  );

  if (sortedThreads.length === 0) {
    return null;
  }

  return (
    <section className={`mb-4 overflow-hidden ${reviewTheme.surface}`}>
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={reviewTheme.title}>Overview Findings</h2>
            <p className="mt-1 text-xs text-[#8b949e]">
              diff にアンカーできない finding の会話を main content 側で扱います。
            </p>
          </div>
          <span className={reviewTheme.pillAccent}>{sortedThreads.length} drafts</span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        {sortedThreads.map((thread) => (
          <DraftThreadCard
            key={thread.localThreadId}
            thread={thread}
            isSelected={thread.localThreadId === selectedLocalThreadId}
            replyBody={replyBodies[thread.localThreadId] ?? ''}
            onSelectThread={onSelectThread}
            onReplyBodyChange={onReplyBodyChange}
            onSubmitReply={onSubmitReply}
            onRespondToPermission={onRespondToPermission}
          />
        ))}
      </div>
    </section>
  );
}
