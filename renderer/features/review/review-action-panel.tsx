import React from 'react';
import type { AppSession, AgentKind } from '../../../shared/domain/agent';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type {
  ReviewDraftFallbackReason,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadDraft,
} from '../../../shared/domain/review-draft';
import { SessionEventPanel } from '../../components/session-event-panel';
import type { ReviewDraftReviewStatus } from './review-draft-state';
import { LocalThreadPanel } from './local-thread-panel';
import { OverviewDiscussionPanel } from './overview-discussion-panel';
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
  localDraftThreads: ReviewThreadDraft[];
  overviewThreads: ReviewSnapshotThread[];
  selectedFileId: string | null;
  fallbackActive: boolean;
  activeTab: 'drafts' | 'overview';
  onSelectFile: (fileId: string) => void;
  onTabChange: (tab: 'drafts' | 'overview') => void;
  onReply: (threadId: string, body: string) => void;
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
  localDraftThreads,
  overviewThreads,
  selectedFileId,
  fallbackActive,
  activeTab,
  onSelectFile,
  onTabChange,
  onReply,
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="max-h-[480px] overflow-y-auto">
        <ReviewSummaryPanel
          status={reviewStatus}
          latestRun={latestRun}
          summary={summary}
          fallbackRichText={fallbackRichText}
          fallbackReason={fallbackReason}
          threadCount={threadCount}
          error={reviewStatus === 'failed' ? executionError : null}
        />

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => onTabChange('drafts')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTab === 'drafts'
                ? 'bg-fuchsia-500/20 text-fuchsia-200'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Drafts
          </button>
          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTab === 'overview'
                ? 'bg-amber-500/20 text-amber-100'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
        </div>

        <div className="min-h-0">
          {activeTab === 'drafts' ? (
            <LocalThreadPanel
              threads={localDraftThreads}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              fallbackActive={fallbackActive}
            />
          ) : (
            <OverviewDiscussionPanel threads={overviewThreads} onReply={onReply} />
          )}
        </div>
      </div>
    </section>
  );
}
