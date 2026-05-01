import { describe, expect, it } from 'vitest';
import {
  getAgentLabel,
  getCommitLabel,
  getModelLabel,
  getStatusLabel,
} from './agent-review-dock-state';
import type { AgentReviewRun, AgentReviewRunCommitSnapshot } from './agent-review-types';

function makeRun(overrides: Partial<AgentReviewRun> = {}): AgentReviewRun {
  return {
    runId: 'run-1',
    agent: 'codex',
    instructions: '',
    status: 'completed',
    appSessionId: null,
    session: null,
    errorMessage: null,
    codexModel: null,
    codexReasoningEffort: null,
    commit: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getStatusLabel', () => {
  it.each([
    'starting',
    'running',
    'waiting_permission',
  ] as const)('%s maps to Processing', (status) => {
    expect(getStatusLabel(status)).toBe('Processing');
  });

  it.each(['completed', 'fallback_rich_text'] as const)('%s maps to DONE', (status) => {
    expect(getStatusLabel(status)).toBe('DONE');
  });

  it('failed maps to FAILED', () => {
    expect(getStatusLabel('failed')).toBe('FAILED');
  });
});

describe('getAgentLabel', () => {
  it('codex maps to GPT', () => {
    expect(getAgentLabel('codex')).toBe('GPT');
  });

  it('copilot maps to Copilot', () => {
    expect(getAgentLabel('copilot')).toBe('Copilot');
  });
});

describe('getModelLabel', () => {
  it('returns model / effort when both are set for codex', () => {
    const run = makeRun({ agent: 'codex', codexModel: 'gpt-5.4', codexReasoningEffort: 'high' });
    expect(getModelLabel(run)).toBe('gpt-5.4 / high');
  });

  it('returns only model when effort is absent for codex', () => {
    const run = makeRun({ agent: 'codex', codexModel: 'gpt-5.4', codexReasoningEffort: null });
    expect(getModelLabel(run)).toBe('gpt-5.4');
  });

  it('returns empty string when codex model is absent', () => {
    const run = makeRun({ agent: 'codex', codexModel: null, codexReasoningEffort: null });
    expect(getModelLabel(run)).toBe('');
  });

  it('returns codexModel for copilot when set', () => {
    const run = makeRun({ agent: 'copilot', codexModel: 'gpt-4o' });
    expect(getModelLabel(run)).toBe('gpt-4o');
  });

  it('returns gpt-5-mini fallback for copilot when model is absent', () => {
    const run = makeRun({ agent: 'copilot', codexModel: null });
    expect(getModelLabel(run)).toBe('gpt-5-mini');
  });
});

describe('getCommitLabel', () => {
  it('returns shortSha and message from commit snapshot', () => {
    const commit: AgentReviewRunCommitSnapshot = {
      revisionId: 'revision-1',
      headSha: 'a'.repeat(40),
      shortSha: 'a1b2c3d',
      message: 'Fix validation around review source',
    };
    const result = getCommitLabel(commit);
    expect(result.shortSha).toBe('a1b2c3d');
    expect(result.message).toBe('Fix validation around review source');
  });

  it('returns placeholder values when commit is null', () => {
    const result = getCommitLabel(null);
    expect(result.shortSha).toBe('-------');
    expect(result.message).toBe('(commit message unavailable)');
  });
});
