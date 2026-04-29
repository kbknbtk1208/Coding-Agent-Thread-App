'use client';

import type { RevisionCommitView } from '../../../../shared/poc3-domain/revision-commit';

const RAIL_COLORS = ['#58d7ff', '#d8e071', '#ffbf6b', '#ff7d7d', '#b69cff', '#7df0c8'];
const ROW_HEIGHT = 42;

interface CommitGraphProps {
  commits: RevisionCommitView[];
  onSelectRevision(revisionId: string): void;
}

function railColor(index: number): string {
  return RAIL_COLORS[index % RAIL_COLORS.length];
}

export function CommitGraph({ commits, onSelectRevision }: CommitGraphProps) {
  if (commits.length === 0) {
    return <div className="px-3 py-4 text-xs text-white/38">commit はまだ取得されていません</div>;
  }

  return (
    <div className="overflow-hidden">
      {commits.map((commit, index) => {
        const active = commit.role === 'active' || commit.role === 'head';
        const disabled = !commit.revisionId;
        const color = railColor(0);
        return (
          <button
            key={`${commit.sha}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (commit.revisionId) {
                onSelectRevision(commit.revisionId);
              }
            }}
            className={`grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-t border-white/[0.06] px-3 text-left transition first:border-t-0 ${
              disabled ? 'cursor-default' : 'hover:bg-white/[0.045]'
            }`}
            style={{ minHeight: ROW_HEIGHT }}
          >
            <span className="relative flex h-full items-center justify-center" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.12]" />
              <span
                className="relative z-10 size-2.5 rounded-full border border-black/40"
                style={{ backgroundColor: active ? '#d8e071' : color }}
              />
            </span>
            <span className="min-w-0 py-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12px] font-medium text-white/72">
                  {commit.message}
                </span>
                {active ? (
                  <span className="shrink-0 rounded-[3px] border border-[#d8e071]/25 bg-[#d8e071]/10 px-1 py-[1px] text-[9px] font-semibold uppercase text-[#edf58a]">
                    active
                  </span>
                ) : null}
                {commit.role === 'orphaned' ? (
                  <span className="shrink-0 rounded-[3px] border border-[#ffbf6b]/25 bg-[#ffbf6b]/10 px-1 py-[1px] text-[9px] font-semibold uppercase text-[#ffe0b5]">
                    orphaned
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-white/36">
                <span className="truncate">{commit.author.name}</span>
                <span>{formatRelativeTime(commit.committedAt ?? commit.authoredAt)}</span>
              </span>
            </span>
            <code className="font-mono text-[10px] text-white/38">{commit.shortSha}</code>
          </button>
        );
      })}
    </div>
  );
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}
