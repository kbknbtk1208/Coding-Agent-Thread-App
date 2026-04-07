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

export interface ReviewActionPanelProps
  extends ReviewActionPanelIdleProps,
    ReviewActionPanelStreamProps,
    ReviewActionPanelResultProps {
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
}: ReviewActionPanelProps) {
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
    </section>
  );
}
