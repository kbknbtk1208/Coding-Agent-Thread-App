import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ReviewDraftFallbackReason,
  ReviewRunRecord,
  ReviewSummaryDraft,
} from '../../../shared/domain/review-draft';
import type { ReviewDraftReviewStatus } from './review-draft-state';
import { reviewTheme } from './review-ui';

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
  const [isOpen, setIsOpen] = useState(true);
  const hasFallback = fallbackRichText !== null;
  const hasResult = Boolean(summary || error) || hasFallback;

  const runLabel = latestRun
    ? `${latestRun.reviewAgent} / ${formatTimestamp(latestRun.completedAt ?? latestRun.createdAt)}`
    : 'no run';

  return (
    <section className={`${reviewTheme.surfaceSoft} border-b border-white/10 px-4 py-4`}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div>
          <h2 className={reviewTheme.title}>Review Summary</h2>
          {!isOpen && <p className="mt-1 text-xs text-[#8b949e]">{runLabel}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isOpen && <span className={reviewTheme.pill}>{runLabel}</span>}
          <span className="text-[#8b949e]" aria-hidden>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#b3b9c2]">
            <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className={reviewTheme.headerLabel}>Status</div>
              <div className="mt-1 font-medium text-[#f8f7f4]">{status}</div>
            </div>
            <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className={reviewTheme.headerLabel}>Findings</div>
              <div className="mt-1 font-medium text-[#f8f7f4]">{threadCount}</div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-[12px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-4 py-3 text-sm text-[#ffd9d9]">
              {error}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[12px] border border-[#FFA16C]/20 bg-[#FFA16C]/10 px-4 py-3">
                <p className="text-sm font-semibold text-[#ffd9c0]">{summary.headline}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#d0d5db]">
                  {summary.overview}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[12px] border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d7f5e8]">
                    Positives
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[#d0d5db]">
                    {summary.positives.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[12px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd9d9]">
                    Risks
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[#d0d5db]">
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
              <div className="rounded-[12px] border border-[#479FFA]/20 bg-[#479FFA]/10 px-4 py-3 text-sm text-[#dcecff]">
                structured 化に失敗したため inline draft は生成していません。reason:{' '}
                {getFallbackReasonLabel(fallbackReason)}
              </div>
              {fallbackRichText ? (
                <div className="prose prose-invert max-w-none rounded-[12px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackRichText}</ReactMarkdown>
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-[#8b949e]">
                  fallback の raw rich text は空でした。
                </div>
              )}
            </div>
          ) : null}

          {!hasResult ? (
            <div className="mt-4 rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-[#8b949e]">
              review を実行すると headline、overview、AI draft findings をここへ表示します。
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
