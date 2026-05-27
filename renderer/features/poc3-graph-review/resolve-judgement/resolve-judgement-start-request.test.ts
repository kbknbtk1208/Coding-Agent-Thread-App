import { describe, expect, it } from 'vitest';
import { buildResolveJudgementStartRequest } from './resolve-judgement-start-request';

describe('resolve-judgement-start-request', () => {
  it('includes Codex model and effort only for Codex starts', () => {
    expect(
      buildResolveJudgementStartRequest({
        reviewWorkspaceId: 'workspace-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        options: {
          agent: 'codex',
          codexModel: ' gpt-5.4 ',
          codexReasoningEffort: ' medium ',
        },
      }),
    ).toEqual({
      reviewWorkspaceId: 'workspace-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      agent: 'codex',
      codexModel: 'gpt-5.4',
      codexReasoningEffort: 'medium',
    });

    expect(
      buildResolveJudgementStartRequest({
        reviewWorkspaceId: 'workspace-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        options: {
          agent: 'copilot',
          codexModel: 'gpt-5.4',
          codexReasoningEffort: 'medium',
        },
      }),
    ).toEqual({
      reviewWorkspaceId: 'workspace-1',
      scopeKey: 'initial:diff-plus-1-hop:v1',
      agent: 'copilot',
      codexModel: undefined,
      codexReasoningEffort: undefined,
    });
  });

  it('omits blank Codex model and effort values', () => {
    expect(
      buildResolveJudgementStartRequest({
        reviewWorkspaceId: 'workspace-1',
        scopeKey: 'initial:diff-plus-1-hop:v1',
        options: {
          agent: 'codex',
          codexModel: ' ',
          codexReasoningEffort: '',
        },
      }),
    ).toMatchObject({
      agent: 'codex',
      codexModel: undefined,
      codexReasoningEffort: undefined,
    });
  });
});
