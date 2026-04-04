import React from 'react';
import type { AgentKind } from '../../../shared/domain/agent';

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
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">AI Review Draft</h2>
          <p className="mt-1 text-xs text-slate-500">
            review source と review agent を分離し、草案だけをローカル表示します。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onReviewAgentChange('codex')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              reviewAgent === 'codex'
                ? 'bg-emerald-400/20 text-emerald-200'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Codex
          </button>
          <button
            type="button"
            onClick={() => onReviewAgentChange('copilot')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              reviewAgent === 'copilot'
                ? 'bg-sky-400/20 text-sky-200'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Copilot
          </button>
        </div>
      </div>

      <label className="grid gap-2 text-xs text-slate-400">
        <span>レビュー観点</span>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          rows={4}
          placeholder="全体の設計、テスト、保守性の観点からレビューして。指摘は重大度付きで、改善提案も含めて。"
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
          disabled={running}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {running
            ? 'review 実行中です。完了まで再実行を抑止します。'
            : 'structured 出力失敗時は rich text を summary に表示します。'}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || running || !instructions.trim()}
          className="min-h-[40px] rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
        >
          {running ? 'レビュー実行中...' : 'レビュー実行'}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
