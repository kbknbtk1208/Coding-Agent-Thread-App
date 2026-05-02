'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import {
  getAgentLabel,
  getCommitLabel,
  getModelLabel,
  getStatusLabel,
} from './agent-review-dock-state';
import { AgentReviewRunOverview } from './agent-review-run-overview';
import { AgentReviewRunStream } from './agent-review-run-stream';
import type { AgentReviewRun, AgentReviewRunDetail } from './agent-review-types';

export interface AgentReviewRunDetailPanelProps {
  run: AgentReviewRun;
  detail: AgentReviewRunDetail | null;
  loading: boolean;
  errorMessage: string | null;
  submittingPermissionKey: string | null;
  onBack(): void;
  onLoadDetail(runId: string): void;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
}

const STATUS_TONE = {
  Processing: 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]',
  DONE: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50',
  FAILED: 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]',
} as const;

export function AgentReviewRunDetailPanel({
  run,
  detail,
  loading,
  errorMessage,
  submittingPermissionKey,
  onBack,
  onLoadDetail,
  onRespondPermission,
}: AgentReviewRunDetailPanelProps) {
  const statusLabel = getStatusLabel(run.status);
  const toneCls = STATUS_TONE[statusLabel];
  const modelLabel = getModelLabel(run);

  useEffect(() => {
    if ((statusLabel === 'DONE' || statusLabel === 'FAILED') && !detail && !loading) {
      onLoadDetail(run.runId);
    }
  }, [detail, loading, onLoadDetail, run.runId, statusLabel]);

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-white/40 transition hover:bg-white/[0.08] hover:text-white/80"
          aria-label="履歴一覧に戻る"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
        </button>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${toneCls}`}
        >
          {statusLabel}
        </span>
        <span className="truncate text-[11px] text-white/38">
          {getAgentLabel(run.agent)}
          {modelLabel ? ` / ${modelLabel}` : ''}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-white/32">
        <span className="shrink-0 font-mono">{getCommitLabel(run.commit).shortSha}</span>
        <span className="truncate">{getCommitLabel(run.commit).message}</span>
      </div>

      {statusLabel === 'Processing' ? (
        <ProcessingView
          run={run}
          submittingPermissionKey={submittingPermissionKey}
          onRespondPermission={onRespondPermission}
        />
      ) : statusLabel === 'DONE' ? (
        <DoneView run={run} detail={detail} loading={loading} errorMessage={errorMessage} />
      ) : (
        <FailedView run={run} />
      )}
    </div>
  );
}

function ProcessingView({
  run,
  submittingPermissionKey,
  onRespondPermission,
}: {
  run: AgentReviewRun;
  submittingPermissionKey: string | null;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
}) {
  if (!run.session) {
    return <p className="text-[11px] text-white/38">Session を開始しています。</p>;
  }
  return (
    <AgentReviewRunStream
      run={run}
      session={run.session}
      submittingPermissionKey={submittingPermissionKey}
      onRespondPermission={onRespondPermission}
    />
  );
}

function DoneView({
  run,
  detail,
  loading,
  errorMessage,
}: {
  run: AgentReviewRun;
  detail: AgentReviewRunDetail | null;
  loading: boolean;
  errorMessage: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/38">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        読み込み中...
      </div>
    );
  }
  if (errorMessage) {
    return (
      <p className="rounded-[6px] border border-[#ff7d7d]/25 bg-[#ff7d7d]/10 px-2 py-1.5 text-[11px] text-[#ffd4d4]">
        {errorMessage}
      </p>
    );
  }
  return <AgentReviewRunOverview run={run} detail={detail} />;
}

function FailedView({ run }: { run: AgentReviewRun }) {
  return (
    <div className="flex flex-col gap-2">
      {run.errorMessage ? (
        <p className="rounded-[6px] border border-[#ff7d7d]/25 bg-[#ff7d7d]/10 px-2 py-1.5 text-[11px] text-[#ffd4d4]">
          {run.errorMessage}
        </p>
      ) : (
        <p className="text-[11px] text-white/38">Agent Review が失敗しました。</p>
      )}
    </div>
  );
}
