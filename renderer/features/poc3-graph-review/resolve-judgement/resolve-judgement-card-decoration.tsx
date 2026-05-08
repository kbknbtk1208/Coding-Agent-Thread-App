'use client';

import { Check, X } from 'lucide-react';
import { MarkdownBody } from '../node-detail/thread/markdown-body';
import type { ResolveJudgementViewModel } from './use-resolve-judgements';

const RESOLVABLE_BG = 'rgba(126, 226, 184, 0.10)';
const RESOLVABLE_BORDER = 'rgba(126, 226, 184, 0.32)';
const RESOLVABLE_TEXT = '#cdf6e3';
const UNRESOLVABLE_BG = 'rgba(255, 132, 112, 0.10)';
const UNRESOLVABLE_BORDER = 'rgba(255, 132, 112, 0.32)';
const UNRESOLVABLE_TEXT = '#ffd2c8';

interface PillProps {
  judgement: ResolveJudgementViewModel;
  className?: string;
}

export function ResolveJudgementPill({ judgement, className }: PillProps) {
  const isResolvable = judgement.decision === 'resolvable';
  const Icon = isResolvable ? Check : X;
  const label = isResolvable ? 'Resolve可能' : 'Resolve不可';
  const bg = isResolvable ? RESOLVABLE_BG : UNRESOLVABLE_BG;
  const border = isResolvable ? RESOLVABLE_BORDER : UNRESOLVABLE_BORDER;
  const color = isResolvable ? RESOLVABLE_TEXT : UNRESOLVABLE_TEXT;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${className ?? ''}`}
      style={{
        background: bg,
        borderColor: border,
        color,
      }}
      title={`判定結果: ${label}`}
    >
      <Icon className="size-2.5" aria-hidden="true" />
      <span>判定結果: {label}</span>
    </span>
  );
}

export function ResolveJudgementReasonBlock({
  judgement,
}: {
  judgement: ResolveJudgementViewModel;
}) {
  const isResolvable = judgement.decision === 'resolvable';
  const accent = isResolvable ? RESOLVABLE_BORDER : UNRESOLVABLE_BORDER;
  const tint = isResolvable ? 'rgba(126, 226, 184, 0.05)' : 'rgba(255, 132, 112, 0.05)';
  return (
    <div
      className="mt-2 rounded-[6px] border px-2.5 py-2"
      style={{ borderColor: accent, background: tint }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
        根拠
      </div>
      <div className="mt-1 text-[11px] leading-5 text-white/80">
        <MarkdownBody variant="compact">{judgement.reasonMarkdown}</MarkdownBody>
      </div>
      {judgement.evidence.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-white/55">
          {judgement.evidence.map((line, idx) => (
            <li key={idx} className="truncate">
              ・{line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
