import { describe, expect, it } from 'vitest';
import {
  getAutoWorktreePath,
  isEmptyNewProfileDraft,
  isProviderResolutionFailure,
  isSameProfileDraftInput,
  newProfileDraft,
  profilePayload,
  repositoryDisplayName,
} from './repository-draft-helpers';

describe('repository draft helpers', () => {
  it('derives a repository display name from https and scp-like origins', () => {
    expect(repositoryDisplayName('https://github.com/acme/project.git')).toBe('project.git');
    expect(repositoryDisplayName('git@gitlab.com:group/subgroup/project.git')).toBe(
      'subgroup/project.git',
    );
  });

  it('derives an adjacent worktree path', () => {
    expect(getAutoWorktreePath('C:\\Users\\nkubo\\Dev\\repo')).toBe(
      'C:\\Users\\nkubo\\Dev\\repo_worktree',
    );
    expect(getAutoWorktreePath('/home/dev/repo/')).toBe('/home/dev/repo_worktree');
  });

  it('detects an untouched new profile draft', () => {
    expect(isEmptyNewProfileDraft(newProfileDraft(0))).toBe(true);
    expect(
      isEmptyNewProfileDraft({ ...newProfileDraft(0), originUrl: 'https://github.com/a/b' }),
    ).toBe(false);
  });

  it('keeps setup script payload compatible with the current UI contract', () => {
    const draft = {
      ...newProfileDraft(0),
      repositoryProfileId: 'profile-1',
      originUrl: 'https://github.com/acme/project',
      localClonePath: 'C:\\repo',
      worktreeRootPath: 'C:\\repo_worktree',
      setupScriptText: 'npm install',
    };

    expect(profilePayload(draft, 'provider-1', true)).toEqual({
      repositoryProfileId: 'profile-1',
      repositoryProviderId: 'provider-1',
      originUrl: 'https://github.com/acme/project',
      localClonePath: 'C:\\repo',
      worktreeRootPath: 'C:\\repo_worktree',
      allowOriginMismatch: true,
      setupScript: {
        scriptText: 'npm install',
        shell: 'powershell',
        cwdMode: 'worktreePath',
      },
    });
  });

  it('compares profile input fields for stale async guards', () => {
    const snapshot = {
      ...newProfileDraft(0),
      draftId: 'draft-1',
      repositoryProviderId: 'provider-1',
      originUrl: 'https://github.com/acme/project',
      localClonePath: 'C:\\repo',
      worktreeRootPath: 'C:\\repo_worktree',
      setupScriptText: 'npm install',
    };

    expect(isSameProfileDraftInput({ ...snapshot, message: 'changed' }, snapshot)).toBe(true);
    expect(
      isSameProfileDraftInput({ ...snapshot, repositoryProviderId: 'provider-2' }, snapshot),
    ).toBe(true);
    expect(
      isSameProfileDraftInput(
        { ...snapshot, originUrl: 'https://github.com/acme/changed' },
        snapshot,
      ),
    ).toBe(false);
    expect(isSameProfileDraftInput({ ...snapshot, setupScriptText: '' }, snapshot)).toBe(false);
  });

  it('keeps provider resolution failure statuses consistent', () => {
    const base = {
      normalizedOriginUrl: null,
      candidates: [
        {
          repositoryProviderId: 'provider-1',
          displayName: 'GitHub',
          kind: 'github' as const,
          baseUrl: 'https://github.com',
          match: 'sameHost' as const,
        },
      ],
      repoLocator: null,
      message: null,
    };

    expect(isProviderResolutionFailure({ ...base, status: 'unsupportedUrl' })).toBe(true);
    expect(isProviderResolutionFailure({ ...base, status: 'noProvider', candidates: [] })).toBe(
      true,
    );
    expect(isProviderResolutionFailure({ ...base, status: 'multipleCandidates' })).toBe(false);
  });
});
