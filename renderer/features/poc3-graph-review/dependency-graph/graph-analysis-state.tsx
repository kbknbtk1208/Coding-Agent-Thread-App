'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

export function GraphAnalysisState({
  status,
  message,
  onRetry,
}: {
  status: 'loading' | 'failed' | 'missing';
  message: string | null;
  onRetry?: () => void;
}) {
  const failed = status !== 'loading';
  return (
    <section
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="flex h-full min-h-[420px] items-center justify-center"
    >
      <div className="flex items-center gap-3 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm text-white/78">
        {failed ? (
          <AlertTriangle className="size-5 text-[#ffbf6b]" aria-hidden="true" />
        ) : (
          <Loader2 className="size-5 animate-spin text-[#d8e071]" aria-hidden="true" />
        )}
        <span className="max-w-[420px] truncate">
          {message ?? (failed ? 'Graph を読み込めませんでした。' : 'Graph analysis running')}
        </span>
        {failed && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 flex size-8 items-center justify-center rounded-[5px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Retry graph analysis"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
