import React from 'react';
import type {
  ReviewFindingCategory,
  ReviewFindingConfidence,
  ReviewFindingSeverity,
} from '../../../shared/domain/review-draft';
import type { ReviewMentionThread } from '../../../shared/domain/review-mention';
import { MentionThreadCard } from './mention-thread-card';
import { reviewTheme } from './review-ui';

interface PromoteDraftValues {
  title: string;
  body: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  suggestion?: string;
}

interface SelectionMentionSectionProps {
  threads: ReviewMentionThread[];
  selectedMentionThreadId: string | null;
  replyBodies: Record<string, string>;
  onSelectThread: (mentionThreadId: string) => void;
  onReplyBodyChange: (mentionThreadId: string, body: string) => void;
  onSubmitReply: (mentionThreadId: string, body: string) => void;
  onPromote: (mentionThreadId: string, values: PromoteDraftValues) => void;
  onRespondToPermission: (mentionThreadId: string, requestId: string, actionId: string) => void;
}

export function SelectionMentionSection({
  threads,
  selectedMentionThreadId,
  replyBodies,
  onSelectThread,
  onReplyBodyChange,
  onSubmitReply,
  onPromote,
  onRespondToPermission,
}: SelectionMentionSectionProps) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="mb-4 rounded-[12px] border border-[#4EBE96]/20 bg-[#4EBE96]/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7f5e8]">
            Selection Mentions
          </p>
          <p className="mt-1 text-xs text-[#8b949e]">
            選択範囲に紐づく local-only の相談 thread です。
          </p>
        </div>
        <span className={reviewTheme.pillSuccess}>{threads.length}</span>
      </div>
      <div className="space-y-3">
        {threads.map((thread) => (
          <MentionThreadCard
            key={thread.mentionThreadId}
            thread={thread}
            isSelected={thread.mentionThreadId === selectedMentionThreadId}
            replyBody={replyBodies[thread.mentionThreadId] ?? ''}
            onSelectThread={onSelectThread}
            onReplyBodyChange={onReplyBodyChange}
            onSubmitReply={onSubmitReply}
            onPromote={onPromote}
            onRespondToPermission={onRespondToPermission}
          />
        ))}
      </div>
    </section>
  );
}
