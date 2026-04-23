'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Terminal, X } from 'lucide-react';
import type { ReviewWorkspaceCreationJobStatus } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { Poc3MorphingShimmerText } from './poc3-morphing-shimmer-text';
import type { WorkspaceCreationJobView } from './use-workspace-creation-jobs';
import { workspaceCardLayoutId } from './use-workspace-creation-jobs';

interface WorkspaceCreationCardProps {
  job: WorkspaceCreationJobView;
  onToggleExpand: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

const STATUS_TONE: Record<ReviewWorkspaceCreationJobStatus, { iconText: string }> = {
  queued: {
    iconText: 'text-[#d6dae0]',
  },
  running: {
    iconText: 'text-[#e50914]',
  },
  completed: {
    iconText: 'text-[#4ebe96]',
  },
  failed: {
    iconText: 'text-[#ff5c5c]',
  },
};

const FEY_BORDER_GRADIENT =
  'linear-gradient(210deg, rgba(255, 255, 255, 0.22) 6.2%, rgba(20, 20, 20, 0.5) 21.56%, rgba(50, 50, 50, 0.5) 69.03%, rgba(255, 255, 255, 0.4) 96.99%) border-box';

const FEY_BORDER_MASK = 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)';

export function WorkspaceCreationCard({
  job,
  onToggleExpand,
  onDismiss,
}: WorkspaceCreationCardProps) {
  const tone = STATUS_TONE[job.status];
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const latestLogLine = job.latestLogLine ?? '準備中...';
  const shouldShimmerLog = job.status === 'running';

  return (
    <motion.div
      layoutId={workspaceCardLayoutId(job.jobId)}
      layout
      initial={{ opacity: 0, x: -12, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      className="pointer-events-auto relative isolate min-h-16 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[7px] bg-[#131313]/85 px-5 text-white shadow-[0_0_44px_rgba(0,0,0,0.8)] backdrop-blur-[6px] transition-colors hover:bg-[#212121]/80"
    >
      <FeyNoiseFilter />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-white opacity-[0.05]"
        style={{
          filter: 'url("#poc3-fey-card-noise")',
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 rounded-[7px] border border-transparent opacity-50"
        style={{
          background: FEY_BORDER_GRADIENT,
          WebkitMask: FEY_BORDER_MASK,
          mask: FEY_BORDER_MASK,
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-16 w-full items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleExpand(job.jobId)}
          className="flex h-full min-w-0 flex-1 items-center justify-between text-left"
          aria-expanded={job.expanded}
          aria-label={`Toggle ${job.repositoryLabel} creation log`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-[14px]">
            <StatusIcon status={job.status} tone={tone} shimmer={shouldShimmerLog} />
            <div className="h-7 w-px shrink-0 bg-black/45" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-bold leading-4 text-[#e6e6e6]"
                title={job.repositoryLabel}
              >
                {job.repositoryLabel}
              </p>
              {shouldShimmerLog ? (
                <Poc3MorphingShimmerText
                  text={latestLogLine}
                  className="mt-1 block truncate whitespace-nowrap text-sm leading-[17px]"
                  title={latestLogLine}
                />
              ) : (
                <p
                  className="mt-1 truncate text-sm leading-[17px] text-[#e6e6e6]/80"
                  title={latestLogLine}
                >
                  {latestLogLine}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pl-2">
            <motion.span
              animate={{ rotate: job.expanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="grid h-7 w-6 place-items-center text-[#111]"
            >
              <ChevronDown className="h-4 w-4 opacity-80" aria-hidden="true" />
            </motion.span>
          </div>
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
            className="relative z-10 overflow-hidden border-t border-white/[0.08] bg-[#131313]/95"
          >
            <ExpandedContent job={job} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isCompleted ? <CompletionShimmer /> : null}
    </motion.div>
  );
}

function FeyNoiseFilter() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
      <filter id="poc3-fey-card-noise">
        <feTurbulence baseFrequency="0.86" numOctaves="4" seed="7" type="fractalNoise" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </svg>
  );
}

function StatusIcon({
  status,
  tone,
  shimmer,
}: {
  status: ReviewWorkspaceCreationJobStatus;
  tone: (typeof STATUS_TONE)[ReviewWorkspaceCreationJobStatus];
  shimmer: boolean;
}) {
  if (status === 'completed') {
    return (
      <span
        className={`relative grid h-[30px] w-[30px] place-items-center rounded-[7px] ${tone.iconText}`}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        className={`relative grid h-[30px] w-[30px] place-items-center rounded-[7px] ${tone.iconText}`}
      >
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={`relative grid h-[30px] w-[30px] place-items-center rounded-[7px] ${tone.iconText}`}
    >
      {shimmer ? (
        <ShimmerLoaderIcon />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
    </span>
  );
}

function ShimmerLoaderIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="poc3-loader-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
          <stop offset="38%" stopColor="rgba(255,255,255,0.96)" />
          <stop offset="52%" stopColor="rgba(255,161,108,0.9)" />
          <stop offset="72%" stopColor="rgba(134,143,151,0.82)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.56)" />
        </linearGradient>
      </defs>
      <path
        d="M21 12a9 9 0 1 1-6.219-8.56"
        stroke="url(#poc3-loader-shimmer)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
