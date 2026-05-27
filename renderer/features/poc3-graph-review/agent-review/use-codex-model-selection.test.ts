import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListCodexModelsResult } from '../../../../shared/contracts/agent-ipc';
import {
  loadCodexModelsForSelection,
  resetCodexModelSelectionCacheForTests,
} from './use-codex-model-selection';

const result: ListCodexModelsResult = {
  models: [
    {
      id: 'gpt-5-mini',
      model: 'gpt-5-mini',
      supportedReasoningEfforts: [{ reasoningEffort: 'medium' }],
      isDefault: true,
    },
  ],
};

describe('loadCodexModelsForSelection', () => {
  afterEach(() => {
    resetCodexModelSelectionCacheForTests();
    vi.unstubAllGlobals();
  });

  it('shares an in-flight Codex model request and caches the successful result', async () => {
    let resolveRequest: (value: ListCodexModelsResult) => void = () => {};
    const listCodexModels = vi.fn(
      () =>
        new Promise<ListCodexModelsResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal('window', { agentApi: { listCodexModels } });

    const firstRequest = loadCodexModelsForSelection();
    const secondRequest = loadCodexModelsForSelection();

    expect(listCodexModels).toHaveBeenCalledTimes(1);

    resolveRequest(result);
    await expect(firstRequest).resolves.toBe(result);
    await expect(secondRequest).resolves.toBe(result);

    await expect(loadCodexModelsForSelection()).resolves.toBe(result);
    expect(listCodexModels).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures so the next call can retry', async () => {
    const listCodexModels = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(result);
    vi.stubGlobal('window', { agentApi: { listCodexModels } });

    await expect(loadCodexModelsForSelection()).rejects.toThrow('failed');
    await expect(loadCodexModelsForSelection()).resolves.toBe(result);
    expect(listCodexModels).toHaveBeenCalledTimes(2);
  });
});
