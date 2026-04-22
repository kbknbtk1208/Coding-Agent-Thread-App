'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Terminal, X } from 'lucide-react';
import type {
  ReviewWorkspaceCreationJobStatus,
  WorkspaceCreationPhase,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { WorkspaceCreationJobView } from './use-workspace-creation-jobs';
import { workspaceCardLayoutId } from './use-workspace-creation-jobs';

interface WorkspaceCreationCardProps {
  job: WorkspaceCreationJobView;
  onToggleExpand: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

const PHASE_LABELS: Record<WorkspaceCreationPhase, string> = {
  resolveTarget: 'Target 解決',
  loadSourceSnapshot: 'Provider 情報取得',
  fetchSource: 'git fetch',
  createWorktree: 'worktree 作成',
  verifyHead: 'HEAD 照合',
  runSetupScript: 'setup script 実行',
  persistWorkspace: '保存',
  startAnalysis: '解析開始',
  done: '完了',
};

const STATUS_TONE: Record<
  ReviewWorkspaceCreationJobStatus,
  { border: string; glow: string; accent: string }
> = {
  queued: {
    border: 'border-white/[0.1]',
    glow: 'shadow-[0_0_24px_rgba(0,0,0,0.4)]',
    accent: 'text-[#a8b0b8]',
  },
  running: {
    border: 'border-[#479ffa]/25',
    glow: 'shadow-[0_0_28px_rgba(71,159,250,0.2)]',
    accent: 'text-[#7ab5ff]',
  },
  completed: {
    border: 'border-[#5ae5a0]/35',
    glow: 'shadow-[0_0_32px_rgba(90,229,160,0.24)]',
    accent: 'text-[#9bf0c3]',
  },
  failed: {
    border: 'border-[#ff5c5c]/40',
    glow: 'shadow-[0_0_32px_rgba(255,92,92,0.22)]',
    accent: 'text-[#ffb4b4]',
  },
};

export function WorkspaceCreationCard({
  job,
  onToggleExpand,
  onDismiss,
}: WorkspaceCreationCardProps) {
  const tone = STATUS_TONE[job.status];
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const phaseLabel = PHASE_LABELS[job.phase];

  return (
    <motion.div
      layoutId={workspaceCardLayoutId(job.jobId)}
      layout
      initial={{ opacity: 0, x: -12, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      className={`pointer-events-auto relative w-[340px] overflow-hidden rounded-xl border ${tone.border} bg-[#131313]/85 text-white backdrop-blur-[8px] ${tone.glow}`}
    >
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onToggleExpand(job.jobId)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90"
          aria-expanded={job.expanded}
          aria-label={`Toggle ${job.repositoryLabel} creation log`}
        >
          <StatusIcon status={job.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {job.repositoryLabel}
              </p>
              <p
                className={`shrink-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide ${tone.accent}`}
              >
                {phaseLabel}
              </p>
            </div>
            <p className="mt-0.5 truncate text-xs text-[#8e98a4]">
              {job.latestLogLine ?? '準備中...'}
            </p>
          </div>
          <motion.span
            animate={{ rotate: job.expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="text-[#8e98a4]"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </motion.span>
        </button>
        {(isCompleted || isFailed) && (
          <button
            type="button"
            aria-label="Dismiss card"
            onClick={() => onDismiss(job.jobId)}
            className="rounded-md p-1 text-[#8e98a4] transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {job.expanded ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-white/[0.08] bg-black/20"
          >
            <ExpandedContent job={job} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isCompleted ? <CompletionShimmer /> : null}
    </motion.div>
  );
}

function StatusIcon({ status }: { status: ReviewWorkspaceCreationJobStatus }) {
  if (status === 'completed') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5ae5a0]/15 text-[#9bf0c3]">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5c5c]/15 text-[#ffb4b4]">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#479ffa]/15 text-[#7ab5ff]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    </span>
  );
}

function ExpandedContent({ job }: { job: WorkspaceCreationJobView }) {
  const visibleLines = job.logLines.slice(-80);
  return (
    <div className="space-y-2 px-3 py-3">
      {job.errorMessage ? (
        <div className="rounded-md border border-[#ff5c5c]/25 bg-[#ff5c5c]/10 px-2 py-1.5 text-xs text-[#ffd1d1]">
          {job.errorMessage}
        </div>
      ) : null}
      {job.worktreePath ? (
        <p className="text-[11px] text-[#8e98a4]">
          <span className="font-semibold text-[#cfd78a]">worktree: </span>
          <span className="break-all">{job.worktreePath}</span>
        </p>
      ) : null}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#8e98a4]">
        <Terminal className="h-3 w-3" aria-hidden="true" />
        command log
      </div>
      <pre className="max-h-[220px] overflow-auto rounded-md bg-black/50 px-2 py-1.5 text-[11px] leading-5 text-[#d6dae0]">
        {visibleLines.length > 0 ? visibleLines.join('\n') : 'no output yet'}
      </pre>
    </div>
  );
}

function CompletionShimmer() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0] }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(90,229,160,0.18)_50%,transparent_100%)]"
      aria-hidden="true"
    />
  );
}
