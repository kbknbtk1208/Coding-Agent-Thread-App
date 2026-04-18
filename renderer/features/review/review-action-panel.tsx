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
import { reviewTheme } from './review-ui';

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
      <section className={`${reviewTheme.surface} p-4`}>
        <div className="max-h-[400px] overflow-y-auto">
          <SessionEventPanel pendingSessionId={pendingSessionId} session={session} />
        </div>
      </section>
    );
  }

  return (
    <section className={`${reviewTheme.surface} overflow-hidden`}>
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
        <div className="border-t border-white/10 px-4 py-3 text-xs text-[#8b949e]">
          Overview conversation は main content 側で表示しています。
        </div>
      ) : null}

      {draftCount > 0 ? (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#d0d5db]">未投稿: {draftCount} 件</p>
              {publishFailure ? (
                <p className="mt-0.5 text-xs text-[#FF5C5C]">{publishFailure}</p>
              ) : null}
            </div>
            <button
              onClick={openPublishPanel}
              disabled={publishing}
              className="shrink-0 rounded-[10px] bg-[#FFA16C] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#ffb98d] disabled:opacity-50"
            >
              {publishing ? '投稿中…' : 'PR に投稿'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
