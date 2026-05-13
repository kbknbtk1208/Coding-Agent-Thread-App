import { describe, expect, it } from 'vitest';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import { buildRepositoryIdentityKey, repoRelativeWorktreeRootSubpath } from './repository-identity';

function githubProfile(localClonePath: string, worktreeRootPath: string): RepositoryProfile {
  return {
    repositoryProfileId: 'profile',
    repositoryProviderId: 'provider',
    originUrl: 'https://github.com/Owner/Repo.git',
    resolvedProvider: {
      kind: 'github',
      baseUrl: 'https://github.com',
      host: 'github.com',
    },
    repoLocator: {
      kind: 'github',
      owner: 'Owner',
      repo: 'Repo',
    },
    localClonePath,
    worktreeRootPath,
    setupScript: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('repository identity', () => {
  it('does not include local clone path differences when worktree root is repository root', () => {
    const first = buildRepositoryIdentityKey(githubProfile('C:\\dev\\repo-a', 'C:\\dev\\repo-a'));
    const second = buildRepositoryIdentityKey(
      githubProfile('D:\\work\\repo-b', 'D:\\work\\repo-b'),
    );
    expect(first).toBe(second);
  });

  it('includes monorepo subpath relative to local clone path', () => {
    expect(
      repoRelativeWorktreeRootSubpath({
        localClonePath: 'C:\\dev\\repo',
        worktreeRootPath: 'C:\\dev\\repo\\packages\\app',
      }),
    ).toBe('packages/app');
  });
});
