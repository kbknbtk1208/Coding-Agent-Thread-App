'use client';

import { AlertTriangle } from 'lucide-react';
import type { AgentReviewRun, AgentReviewRunDetail } from './agent-review-types';

export interface AgentReviewRunOverviewProps {
  run: AgentReviewRun;
  detail: AgentReviewRunDetail | null;
}

interface OverviewContent {
  title: string;
  body: string;
  tone: 'structured' | 'fallback' | 'session' | 'empty';
}

export function getAgentReviewOverview(
  detail: AgentReviewRunDetail | null,
  run: AgentReviewRun,
): OverviewContent {
  const envelope = detail?.envelope ?? null;

  if (envelope?.kind === 'structured') {
    const { summary } = envelope;
    if (summary.overview) {
      return { title: summary.headline || 'Overview', body: summary.overview, tone: 'structured' };
    }
    const body = [summary.headline, ...(summary.risks?.map((r) => `• ${r}`) ?? [])]
      .filter(Boolean)
      .join('\n');
    return { title: 'Summary', body: body || '(No overview available)', tone: 'structured' };
  }

  if (envelope?.kind === 'fallback-richText') {
    return { title: 'Review Result', body: envelope.content, tone: 'fallback' };
  }

  const lastTurn = run.session?.turns.at(-1) ?? null;
  if (lastTurn) {
    const body =
      lastTurn.result?.kind === 'richText' ? lastTurn.result.content : (lastTurn.response ?? '');
    if (body) {
      return { title: 'Review Result', body, tone: 'session' };
    }
  }

  return { title: 'Review Result', body: '(No overview available)', tone: 'empty' };
}

export function AgentReviewRunOverview({ run, detail }: AgentReviewRunOverviewProps) {
  const { title, body, tone } = getAgentReviewOverview(detail, run);

  return (
    <div className="flex flex-col gap-3">
      {tone === 'fallback' ? (
        <div className="flex items-center gap-1.5 rounded-[6px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-2.5 py-1.5 text-[10px] text-[#ffe0b5]">
          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
          Structured output の解析に失敗しました。テキスト結果を表示しています。
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/32">{title}</p>
        <p className="whitespace-pre-wrap text-[11px] leading-5 text-white/65">{body}</p>
      </div>
    </div>
  );
}
