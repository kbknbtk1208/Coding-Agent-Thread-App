import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ReviewDraftFallbackReason,
  ReviewRunRecord,
  ReviewSummaryDraft,
} from '../../../shared/domain/review-draft';
import type { ReviewDraftReviewStatus } from './review-draft-state';

interface ReviewSummaryPanelProps {
  status: ReviewDraftReviewStatus;
  latestRun: ReviewRunRecord | null;
  summary: ReviewSummaryDraft | null;
  fallbackRichText: string | null;
  fallbackReason: ReviewDraftFallbackReason | null;
  threadCount: number;
  error: string | null;
}

function getFallbackReasonLabel(reason: ReviewDraftFallbackReason | null): string {
  switch (reason) {
    case 'emptyResponse':
      return 'empty response';
    case 'schemaValidationFailed':
      return 'schema validation failed';
    case 'structuredParseFailed':
      return 'structured parse failed';
    default:
      return 'unknown';
  }
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReviewSummaryPanel({
  status,
  latestRun,
  summary,
  fallbackRichText,
  fallbackReason,
  threadCount,
  error,
}: ReviewSummaryPanelProps) {
  const hasFallback = fallbackRichText !== null;
  const hasResult = Boolean(summary || error) || hasFallback;

  return (
    <section className="border-b border-white/10 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Review Summary</h2>
          <p className="mt-1 text-xs text-slate-500">
            structured success では summary と inline draft を同期表示します。
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
          {latestRun
            ? `${latestRun.reviewAgent} / ${formatTimestamp(latestRun.completedAt ?? latestRun.createdAt)}`
            : 'no run'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
          <div className="mt-1 font-medium text-slate-200">{status}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Findings</div>
          <div className="mt-1 font-medium text-slate-200">{threadCount}</div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <p className="text-sm font-semibold text-cyan-100">{summary.headline}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
              {summary.overview}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Positives
              </p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                {summary.positives.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                Risks
              </p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                {summary.risks.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {hasFallback ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            structured 化に失敗したため inline draft は生成していません。reason:{' '}
            {getFallbackReasonLabel(fallbackReason)}
          </div>
          {fallbackRichText ? (
            <div className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackRichText}</ReactMarkdown>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
              fallback の raw rich text は空でした。
            </div>
          )}
        </div>
      ) : null}

      {!hasResult ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
          review を実行すると headline、overview、AI draft findings をここへ表示します。
        </div>
      ) : null}
    </section>
  );
}
