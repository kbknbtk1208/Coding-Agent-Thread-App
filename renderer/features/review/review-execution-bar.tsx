import React from 'react';
import type { AgentKind } from '../../../shared/domain/agent';
import { reviewTheme } from './review-ui';

interface ReviewExecutionBarProps {
  reviewAgent: AgentKind;
  instructions: string;
  disabled: boolean;
  running: boolean;
  error: string | null;
  onReviewAgentChange: (agent: AgentKind) => void;
  onInstructionsChange: (value: string) => void;
  onSubmit: () => void;
}

export function ReviewExecutionBar({
  reviewAgent,
  instructions,
  disabled,
  running,
  error,
  onReviewAgentChange,
  onInstructionsChange,
  onSubmit,
}: ReviewExecutionBarProps) {
  return (
    <section className={`${reviewTheme.surface} grid gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className={reviewTheme.title}>AI Review Draft</h2>
          <p className="mt-1 text-xs text-[#8b949e]">
            review source と review agent を分離し、草案だけをローカル表示します。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onReviewAgentChange('codex')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              reviewAgent === 'codex'
                ? 'border border-[#FFA16C]/30 bg-[#FFA16C]/12 text-[#ffd9c0]'
                : 'bg-white/5 text-[#8b949e] hover:text-white'
            }`}
          >
            Codex
          </button>
          <button
            type="button"
            onClick={() => onReviewAgentChange('copilot')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              reviewAgent === 'copilot'
                ? 'border border-[#479FFA]/30 bg-[#479FFA]/12 text-[#dcecff]'
                : 'bg-white/5 text-[#8b949e] hover:text-white'
            }`}
          >
            Copilot
          </button>
        </div>
      </div>

      <label className="grid gap-2 text-xs text-[#b3b9c2]">
        <span>レビュー観点</span>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          rows={4}
          placeholder="全体の設計、テスト、保守性の観点からレビューして。指摘は重大度付きで、改善提案も含めて。"
          className={reviewTheme.textarea}
          disabled={running}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[#8b949e]">
          {running
            ? 'review 実行中です。完了まで再実行を抑止します。'
            : 'structured 出力失敗時は rich text を summary に表示します。'}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || running || !instructions.trim()}
          className={`${reviewTheme.primaryButton} min-h-[40px]`}
        >
          {running ? 'レビュー実行中...' : 'レビュー実行'}
        </button>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-sm text-[#ffd9d9]">
          {error}
        </div>
      ) : null}
    </section>
  );
}
