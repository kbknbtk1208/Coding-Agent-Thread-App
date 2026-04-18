import React from 'react';
import type { ReviewProvider } from '../../../shared/domain/review';
import { getReviewTokenEnvName } from './review-source';
import { reviewTheme } from './review-ui';

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
      className={`${reviewTheme.surface} grid gap-3 p-4`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={reviewTheme.headerLabel}>Review Source</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onProviderChange('github')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'github'
                ? 'border border-[#FFA16C]/30 bg-[#FFA16C]/12 text-[#ffd9c0]'
                : 'bg-white/5 text-[#8b949e] hover:text-white'
            }`}
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => onProviderChange('gitlab')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'gitlab'
                ? 'border border-[#479FFA]/30 bg-[#479FFA]/12 text-[#dcecff]'
                : 'bg-white/5 text-[#8b949e] hover:text-white'
            }`}
          >
            GitLab
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs text-[#b3b9c2]">
          <span>Host</span>
          <input
            type="text"
            value={host}
            onChange={(event) => onHostChange(event.target.value)}
            placeholder="https://api.github.com"
            className={reviewTheme.field}
            disabled={loading}
          />
        </label>

        <label className="grid gap-1 text-xs text-[#b3b9c2]">
          <span>Review URL</span>
          <input
            type="text"
            value={reviewUrl}
            onChange={(event) => onReviewUrlChange(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className={reviewTheme.field}
            disabled={loading}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className={`${reviewTheme.primaryButton} min-h-[44px] px-5`}
        >
          {loading ? '読み込み中...' : 'Load'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8b949e]">
        <p>Token は main process が環境変数 `{getReviewTokenEnvName(provider)}` から解決します。</p>
        <p>self-hosted の場合も provider はそのままで、host だけ書き換えてください。</p>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-sm text-[#ffd9d9]">
          {error}
        </div>
      ) : null}
    </form>
  );
}
