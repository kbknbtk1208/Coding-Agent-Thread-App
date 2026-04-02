import React from 'react';
import type { ReviewProvider } from '../../../shared/domain/review';
import { getReviewTokenEnvName } from './review-source';

interface ReviewSourceSelectorProps {
  provider: ReviewProvider;
  host: string;
  reviewUrl: string;
  loading: boolean;
  error: string | null;
  onProviderChange: (provider: ReviewProvider) => void;
  onHostChange: (value: string) => void;
  onReviewUrlChange: (value: string) => void;
  onSubmit: () => void;
}

export function ReviewSourceSelector({
  provider,
  host,
  reviewUrl,
  loading,
  error,
  onProviderChange,
  onHostChange,
  onReviewUrlChange,
  onSubmit,
}: ReviewSourceSelectorProps) {
  return (
    <form
      className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Review Source
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onProviderChange('github')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'github'
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => onProviderChange('gitlab')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'gitlab'
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            GitLab
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs text-slate-400">
          <span>Host</span>
          <input
            type="text"
            value={host}
            onChange={(event) => onHostChange(event.target.value)}
            placeholder="https://api.github.com"
            className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            disabled={loading}
          />
        </label>

        <label className="grid gap-1 text-xs text-slate-400">
          <span>Review URL</span>
          <input
            type="text"
            value={reviewUrl}
            onChange={(event) => onReviewUrlChange(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            disabled={loading}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="min-h-[44px] rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
        >
          {loading ? '読み込み中...' : 'Load'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>Token は main process が環境変数 `{getReviewTokenEnvName(provider)}` から解決します。</p>
        <p>self-hosted の場合も provider はそのままで、host だけ書き換えてください。</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </form>
  );
}
