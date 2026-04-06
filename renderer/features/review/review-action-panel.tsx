import React from 'react';
import type { AgentKind, AppSession } from '../../../shared/domain/agent';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import type {
  ReviewDraftFallbackReason,
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewSummaryDraft,
} from '../../../shared/domain/review-draft';
import { SessionEventPanel } from '../../components/session-event-panel';
import { LocalThreadPanel } from './local-thread-panel';
import { OverviewDiscussionPanel } from './overview-discussion-panel';
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
  localThreads: ReviewLocalThread[];
  overviewThreads: ReviewSnapshotThread[];
  selectedFileId: string | null;
  selectedThreadId: string | null;
  fallbackActive: boolean;
  activeTab: 'drafts' | 'overview';
  onSelectFile: (fileId: string) => void;
  onSelectThread: (localThreadId: string) => void;
  onTabChange: (tab: 'drafts' | 'overview') => void;
  onReplyOverviewThread: (threadId: string, body: string) => void;
  onReplyLocalThread: (localThreadId: string, body: string) => void;
  onRespondThreadPermission: (localThreadId: string, requestId: string, actionId: string) => void;
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
  localThreads,
  overviewThreads,
  selectedFileId,
  selectedThreadId,
  fallbackActive,
  activeTab,
  onSelectFile,
  onSelectThread,
  onTabChange,
  onReplyOverviewThread,
  onReplyLocalThread,
  onRespondThreadPermission,
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
      <div className="max-h-[560px] overflow-y-auto">
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
              threads={localThreads}
              selectedFileId={selectedFileId}
              selectedLocalThreadId={selectedThreadId}
              onSelectFile={onSelectFile}
              onSelectThread={onSelectThread}
              onReply={onReplyLocalThread}
              onRespondToPermission={onRespondThreadPermission}
              fallbackActive={fallbackActive}
            />
          ) : (
            <OverviewDiscussionPanel threads={overviewThreads} onReply={onReplyOverviewThread} />
          )}
        </div>
      </div>
    </section>
  );
}
