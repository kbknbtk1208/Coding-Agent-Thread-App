'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ListCodexModelsResult } from '../../../../shared/contracts/agent-ipc';
import type { CodexModelOption, CodexReasoningEffortOption } from '../../../../shared/domain/agent';

export interface CodexModelSelectionState {
  models: CodexModelOption[];
  selectedModel: string;
  selectedReasoningEffort: string;
  isLoading: boolean;
  errorMessage: string | null;
  setSelectedModel(value: string): void;
  setSelectedReasoningEffort(value: string): void;
}

let cachedCodexModelList: ListCodexModelsResult | null = null;
let inFlightCodexModelList: Promise<ListCodexModelsResult> | null = null;

export function loadCodexModelsForSelection(): Promise<ListCodexModelsResult> {
  if (cachedCodexModelList) {
    return Promise.resolve(cachedCodexModelList);
  }

  if (inFlightCodexModelList) {
    return inFlightCodexModelList;
  }

  inFlightCodexModelList = window.agentApi
    .listCodexModels()
    .then((result) => {
      cachedCodexModelList = result;
      return result;
    })
    .finally(() => {
      inFlightCodexModelList = null;
    });

  return inFlightCodexModelList;
}

export function resetCodexModelSelectionCacheForTests(): void {
  cachedCodexModelList = null;
  inFlightCodexModelList = null;
}

export function useCodexModelSelection(): CodexModelSelectionState {
  const [models, setModels] = useState<CodexModelOption[]>(cachedCodexModelList?.models ?? []);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedCodexModelList);
  const [selectedModel, setSelectedModel] = useState(() =>
    cachedCodexModelList ? pickDefaultModel(cachedCodexModelList.models) : '',
  );
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState('');

  useEffect(() => {
    let disposed = false;
    setIsLoading(!cachedCodexModelList);
    setErrorMessage(null);
    void loadCodexModelsForSelection()
      .then((result) => {
        if (disposed) return;
        setModels(result.models);
        const defaultModel = pickDefaultModel(result.models);
        setSelectedModel((current) =>
          current && result.models.some((model) => model.model === current)
            ? current
            : defaultModel,
        );
      })
      .catch((error) => {
        if (disposed) return;
        setModels([]);
        setSelectedModel('');
        setSelectedReasoningEffort('');
        setErrorMessage(
          error instanceof Error ? error.message : 'Codex model list の取得に失敗しました。',
        );
      })
      .finally(() => {
        if (!disposed) {
          setIsLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const selected = models.find((model) => model.model === selectedModel);
    if (!selected) {
      setSelectedReasoningEffort('');
      return;
    }
    setSelectedReasoningEffort((current) =>
      current &&
      selected.supportedReasoningEfforts.some((option) => option.reasoningEffort === current)
        ? current
        : pickDefaultReasoningEffort(selected),
    );
  }, [models, selectedModel]);

  return useMemo(
    () => ({
      models,
      selectedModel,
      selectedReasoningEffort,
      isLoading,
      errorMessage,
      setSelectedModel,
      setSelectedReasoningEffort,
    }),
    [errorMessage, isLoading, models, selectedModel, selectedReasoningEffort],
  );
}

export function getCodexReasoningOptions(
  models: CodexModelOption[],
  selectedModel: string,
): CodexReasoningEffortOption[] {
  const selected = models.find((model) => model.model === selectedModel);
  if (!selected) {
    return [];
  }
  if (
    selected.defaultReasoningEffort &&
    !selected.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === selected.defaultReasoningEffort,
    )
  ) {
    return [
      ...selected.supportedReasoningEfforts,
      { reasoningEffort: selected.defaultReasoningEffort },
    ];
  }
  return selected.supportedReasoningEfforts;
}

function pickDefaultModel(models: CodexModelOption[]): string {
  return models.find((model) => model.isDefault)?.model ?? models[0]?.model ?? '';
}

function pickDefaultReasoningEffort(model: CodexModelOption): string {
  return model.defaultReasoningEffort ?? model.supportedReasoningEfforts[0]?.reasoningEffort ?? '';
}
