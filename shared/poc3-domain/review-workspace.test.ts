import { describe, expect, it } from 'vitest';
import { repositoryLabelFromLocator } from './review-workspace';

describe('repositoryLabelFromLocator', () => {
  it('formats GitHub repositories as owner/repo', () => {
    expect(repositoryLabelFromLocator({ kind: 'github', owner: 'openai', repo: 'codex' })).toBe(
      'openai/codex',
    );
  });

  it('uses the GitLab project path or id', () => {
    expect(
      repositoryLabelFromLocator({
        kind: 'gitlab',
        projectPathOrId: 'platform/review/workspace',
      }),
    ).toBe('platform/review/workspace');
  });
});
