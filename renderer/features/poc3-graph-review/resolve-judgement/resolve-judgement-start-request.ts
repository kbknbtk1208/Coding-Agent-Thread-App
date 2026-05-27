import type { AgentKind } from '../../../../shared/domain/agent';
import type { StartResolveJudgementInput } from '../../../../shared/poc3-contracts/graph-review-ipc';

export interface ResolveJudgementStartOptions {
  agent: AgentKind;
  codexModel?: string;
  codexReasoningEffort?: string;
}

export function buildResolveJudgementStartRequest(input: {
  reviewWorkspaceId: string;
  scopeKey: string;
  options: ResolveJudgementStartOptions;
}): StartResolveJudgementInput {
  const codexModel = input.options.codexModel?.trim();
  const codexReasoningEffort = input.options.codexReasoningEffort?.trim();

  return {
    reviewWorkspaceId: input.reviewWorkspaceId,
    scopeKey: input.scopeKey,
    agent: input.options.agent,
    codexModel: input.options.agent === 'codex' ? codexModel || undefined : undefined,
    codexReasoningEffort:
      input.options.agent === 'codex' ? codexReasoningEffort || undefined : undefined,
  };
}
