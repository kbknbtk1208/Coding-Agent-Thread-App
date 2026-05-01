'use client';

import { ArrowLeft, Bot, Check, ChevronDown, Loader2, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FaGithub } from 'react-icons/fa6';
import { SiOpenai } from 'react-icons/si';
import type { AgentKind } from '../../../../shared/domain/agent';
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

const AGENT_OPTIONS: { value: AgentKind; label: string; provider: string }[] = [
  { value: 'codex', label: 'Codex', provider: 'OpenAI' },
  { value: 'copilot', label: 'Copilot', provider: 'GitHub' },
];

export function AgentReviewNewRunPanel({
  review,
  graph,
  selectedWorkspace,
  onBack,
  onStarted,
}: AgentReviewNewRunPanelProps) {
  const disabled = !review.canStart || graph.nodes.length === 0;
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const selectedAgentOption =
    AGENT_OPTIONS.find((option) => option.value === review.selectedAgent) ?? AGENT_OPTIONS[0];

  useEffect(() => {
    if (!review.canStart) {
      setIsAgentMenuOpen(false);
    }
  }, [review.canStart]);

  useEffect(() => {
    if (!isAgentMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!agentMenuRef.current?.contains(event.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAgentMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAgentMenuOpen]);

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

      <div className="flex items-center gap-2">
        <div ref={agentMenuRef} className="relative w-[164px] shrink-0">
          <button
            type="button"
            disabled={!review.canStart}
            aria-haspopup="listbox"
            aria-expanded={isAgentMenuOpen}
            aria-label="Agent"
            className="flex h-12 w-full items-center gap-2 rounded-[9px] border border-white/[0.08] bg-[#25262b]/92 px-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-[18px] transition hover:bg-[#2c2d33] focus:border-[#58d7ff]/30 focus:shadow-[0_0_0_2px_rgba(88,215,255,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setIsAgentMenuOpen((current) => !current)}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${
                review.selectedAgent === 'codex'
                  ? 'bg-[#89c9bd] text-white'
                  : 'bg-white text-[#111217]'
              }`}
            >
              <AgentChoiceIcon agent={review.selectedAgent} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold leading-4 text-white">
                {selectedAgentOption.label}
              </span>
              <span className="block truncate text-[11px] font-medium leading-4 text-white/50">
                {selectedAgentOption.provider}
              </span>
            </span>
            <ChevronDown
              className={`size-3.5 shrink-0 text-white/70 transition ${
                isAgentMenuOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {isAgentMenuOpen ? (
            <div
              role="listbox"
              aria-label="Agent options"
              className="absolute left-0 top-[calc(100%+6px)] z-50 w-[260px] overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#17181d]/96 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.46)] backdrop-blur-[20px]"
            >
              {AGENT_OPTIONS.map((option) => {
                const isSelected = option.value === review.selectedAgent;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`flex w-full items-center gap-3 rounded-[7px] px-2 py-2 text-left transition ${
                      isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.045]'
                    }`}
                    onClick={() => {
                      review.setSelectedAgent(option.value);
                      setIsAgentMenuOpen(false);
                    }}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] ${
                        option.value === 'codex'
                          ? 'bg-[#89c9bd] text-white'
                          : 'bg-white text-[#111217]'
                      }`}
                    >
                      <AgentChoiceIcon agent={option.value} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold leading-4 text-white">
                          {option.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-white/48">
                        {option.provider}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check className="size-3.5 shrink-0 text-[#66dd89]" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {review.selectedAgent === 'codex' ? (
          <>
            <div className="min-w-0 flex-1">
              <AgentReviewGlassSelect
                value={review.codexModelState.selectedModel}
                onChange={review.setCodexModel}
                disabled={
                  !review.canStart ||
                  review.codexModelState.isLoading ||
                  review.codexModelState.models.length === 0
                }
                ariaLabel="Codex model"
                buttonHeight="h-12"
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
            </div>
            <div className="w-[112px] shrink-0">
              <AgentReviewGlassSelect
                value={review.codexModelState.selectedReasoningEffort}
                onChange={review.setCodexReasoningEffort}
                disabled={!review.canStart || codexReasoningOptions.length === 0}
                ariaLabel="Codex reasoning effort"
                buttonHeight="h-12"
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
          </>
        ) : null}
      </div>

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

function AgentChoiceIcon({ agent }: { agent: AgentKind }) {
  if (agent === 'copilot') {
    return <FaGithub className="size-4" aria-hidden="true" />;
  }

  if (agent === 'codex') {
    return <SiOpenai className="size-5" aria-hidden="true" />;
  }

  return <Bot className="size-4" aria-hidden="true" />;
}
