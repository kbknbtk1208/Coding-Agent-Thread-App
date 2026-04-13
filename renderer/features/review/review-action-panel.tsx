import React from 'react';
import type { AgentKind, AppSession } from '../../../shared/domain/agent';
import type {
  ReviewDraftFallbackReason,
  ReviewRunRecord,
  ReviewSummaryDraft,
} from '../../../shared/domain/review-draft';
import { SessionEventPanel } from '../../components/session-event-panel';
import type { ReviewDraftReviewStatus } from './review-draft-state';
import { ReviewExecutionBar } from './review-execution-bar';
import { ReviewSummaryPanel } from './review-summary-panel';

interface ReviewActionPanelIdleProps {
  reviewAgent: AgentKind;
  instructions: string;
  disabled: boolean;
  running: boolean;
  executionError: string | null;
  onReviewAgentChange: (agent: AgentKind) => void;
  onInstructionsChange: (value: string) => void;
  onSubmit: () => void;
}

interface ReviewActionPanelStreamProps {
  pendingSessionId: string | null;
  session: AppSession | null;
}

interface ReviewActionPanelResultProps {
  reviewStatus: ReviewDraftReviewStatus;
  latestRun: ReviewRunRecord | null;
  summary: ReviewSummaryDraft | null;
  fallbackRichText: string | null;
  fallbackReason: ReviewDraftFallbackReason | null;
  threadCount: number;
  overviewConversationCount: number;
}

interface ReviewActionPanelPublishProps {
  unpublishedDraftCount?: number;
  isPublishing?: boolean;
  publishError?: string | null;
  onOpenPublishPanel?: () => void;
}

export interface ReviewActionPanelProps
  extends ReviewActionPanelIdleProps,
    ReviewActionPanelStreamProps,
    ReviewActionPanelResultProps,
    ReviewActionPanelPublishProps {
  reviewStatus: ReviewDraftReviewStatus;
}

export function ReviewActionPanel({
  reviewStatus,
  reviewAgent,
  instructions,
  disabled,
  running,
  executionError,
  onReviewAgentChange,
  onInstructionsChange,
  onSubmit,
  pendingSessionId,
  session,
  latestRun,
  summary,
  fallbackRichText,
  fallbackReason,
  threadCount,
  overviewConversationCount,
  unpublishedDraftCount = 0,
  isPublishing = false,
  publishError = null,
  onOpenPublishPanel,
}: ReviewActionPanelProps) {
  const draftCount = unpublishedDraftCount ?? 0;
  const publishing = isPublishing ?? false;
  const publishFailure = publishError ?? null;
  const openPublishPanel = onOpenPublishPanel ?? (() => undefined);

  if (reviewStatus === 'idle') {
    return (
      <ReviewExecutionBar
        reviewAgent={reviewAgent}
        instructions={instructions}
        disabled={disabled}
        running={running}
        error={executionError}
        onReviewAgentChange={onReviewAgentChange}
        onInstructionsChange={onInstructionsChange}
        onSubmit={onSubmit}
      />
    );
  }

  if (reviewStatus === 'drafting_review') {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="max-h-[400px] overflow-y-auto">
          <SessionEventPanel pendingSessionId={pendingSessionId} session={session} />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <ReviewSummaryPanel
        status={reviewStatus}
        latestRun={latestRun}
        summary={summary}
        fallbackRichText={fallbackRichText}
        fallbackReason={fallbackReason}
        threadCount={threadCount}
        error={reviewStatus === 'failed' ? executionError : null}
      />

      {overviewConversationCount > 0 ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-400">
          Overview conversation は main content 側で表示しています。
        </div>
      ) : null}

      {draftCount > 0 ? (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">未投稿: {draftCount} 件</p>
              {publishFailure ? (
                <p className="mt-0.5 text-xs text-red-400">{publishFailure}</p>
              ) : null}
            </div>
            <button
              onClick={openPublishPanel}
              disabled={publishing}
              className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
            >
              {publishing ? '投稿中…' : 'PR に投稿'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
