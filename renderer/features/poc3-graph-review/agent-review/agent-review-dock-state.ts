import type { AgentReviewRun, AgentReviewRunCommitSnapshot } from './agent-review-types';

export type AgentReviewStatusLabel = 'Processing' | 'DONE' | 'FAILED';

export function getStatusLabel(status: AgentReviewRun['status']): AgentReviewStatusLabel {
  if (status === 'starting' || status === 'running' || status === 'waiting_permission') {
    return 'Processing';
  }
  if (status === 'completed' || status === 'fallback_rich_text') {
    return 'DONE';
  }
  return 'FAILED';
}

export function getAgentLabel(agent: AgentReviewRun['agent']): string {
  return agent === 'codex' ? 'GPT' : 'Copilot';
}

export function getModelLabel(run: AgentReviewRun): string {
  if (run.agent === 'codex') {
    if (run.codexModel && run.codexReasoningEffort) {
      return `${run.codexModel} / ${run.codexReasoningEffort}`;
    }
    return run.codexModel ?? '';
  }
  return run.codexModel ?? 'gpt-5-mini';
}

export function getCommitLabel(commit: AgentReviewRunCommitSnapshot | null): {
  shortSha: string;
  message: string;
} {
  if (!commit) {
    return { shortSha: '-------', message: '(commit message unavailable)' };
  }
  return { shortSha: commit.shortSha, message: commit.message };
}
