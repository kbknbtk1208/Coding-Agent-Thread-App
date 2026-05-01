'use client';

import { ArrowLeft, Loader2, Play } from 'lucide-react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import { AgentReviewGlassSelect } from './agent-review-glass-select';
import type { UseAgentReviewResult } from './use-agent-review';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

export interface AgentReviewNewRunPanelProps {
  review: UseAgentReviewResult;
  graph: GraphRenderSnapshot;
  selectedWorkspace: ReviewWorkspaceListItem;
  onBack(): void;
  onStarted(runId: string): void;
}

const AGENT_OPTIONS = [
  { value: 'codex' as const, label: 'Codex' },
  { value: 'copilot' as const, label: 'Copilot' },
];

export function AgentReviewNewRunPanel({
  review,
  graph,
  selectedWorkspace,
  onBack,
  onStarted,
}: AgentReviewNewRunPanelProps) {
  const disabled = !review.canStart || graph.nodes.length === 0;

  const selectedCodexModel = review.codexModelState.models.find(
    (model) => model.model === review.codexModelState.selectedModel,
  );
  const codexReasoningOptions =
    selectedCodexModel &&
    selectedCodexModel.defaultReasoningEffort &&
    !selectedCodexModel.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === selectedCodexModel.defaultReasoningEffort,
    )
      ? [
          ...selectedCodexModel.supportedReasoningEfforts,
          { reasoningEffort: selectedCodexModel.defaultReasoningEffort },
        ]
      : (selectedCodexModel?.supportedReasoningEfforts ?? []);

  const handleRunReview = async () => {
    const started = await review.startReview({
      target: { workspace: selectedWorkspace, graph },
    });
    if (started) {
      onStarted(started.runId);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-white/40 transition hover:bg-white/[0.08] hover:text-white/80"
          aria-label="履歴一覧に戻る"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
        </button>
        <span className="text-[11px] font-semibold text-white/55">New Review</span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-[7px] border border-white/[0.06] bg-white/[0.03] p-1">
        {AGENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-[5px] px-2 py-1.5 text-[12px] font-semibold transition ${
              review.selectedAgent === option.value
                ? 'bg-white text-black'
                : 'text-white/52 hover:bg-white/[0.08] hover:text-white'
            }`}
            onClick={() => review.setSelectedAgent(option.value)}
            disabled={!review.canStart}
          >
            {option.label}
          </button>
        ))}
      </div>

      {review.selectedAgent === 'codex' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-1.5">
          <AgentReviewGlassSelect
            value={review.codexModelState.selectedModel}
            onChange={review.setCodexModel}
            disabled={
              !review.canStart ||
              review.codexModelState.isLoading ||
              review.codexModelState.models.length === 0
            }
            ariaLabel="Codex model"
          >
            {review.codexModelState.models.length === 0 ? (
              <option value="">
                {review.codexModelState.isLoading ? 'Loading models' : 'Provider default'}
              </option>
            ) : (
              review.codexModelState.models.map((model) => (
                <option key={model.id} value={model.model}>
                  {model.displayName ?? model.model}
                </option>
              ))
            )}
          </AgentReviewGlassSelect>
          <AgentReviewGlassSelect
            value={review.codexModelState.selectedReasoningEffort}
            onChange={review.setCodexReasoningEffort}
            disabled={!review.canStart || codexReasoningOptions.length === 0}
            ariaLabel="Codex reasoning effort"
          >
            {codexReasoningOptions.length === 0 ? (
              <option value="">effort</option>
            ) : (
              codexReasoningOptions.map((option) => (
                <option key={option.reasoningEffort} value={option.reasoningEffort}>
                  {option.reasoningEffort}
                </option>
              ))
            )}
          </AgentReviewGlassSelect>
        </div>
      ) : null}

      {review.selectedAgent === 'codex' && review.codexModelState.errorMessage ? (
        <p className="rounded-[6px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-2 py-1.5 text-[11px] text-[#ffe0b5]">
          {review.codexModelState.errorMessage}
        </p>
      ) : null}

      <textarea
        value={review.instructions}
        onChange={(e) => review.setInstructions(e.target.value)}
        disabled={!review.canStart}
        rows={4}
        className="min-h-[96px] resize-none rounded-[7px] border border-white/[0.06] bg-black/22 px-3 py-2 text-[12px] leading-5 text-white/72 outline-none transition placeholder:text-white/22 focus:border-[#58d7ff]/28 disabled:opacity-50"
        aria-label="Agent Review instructions"
      />

      <button
        type="button"
        disabled={disabled}
        className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[7px] bg-[#d8e071] px-3 text-[12px] font-semibold text-black transition hover:bg-[#edf58a] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/28"
        onClick={() => void handleRunReview()}
      >
        {review.activeRun ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
        {review.activeRun ? 'Running' : 'Run Review'}
      </button>
    </div>
  );
}
