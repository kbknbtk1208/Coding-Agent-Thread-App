import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryProfile } from '../../shared/poc3-domain/repository';
import type { ReviewWorkspace } from '../../shared/poc3-domain/review-workspace';
import { GraphReviewGateway } from './graph-review-gateway';

const { removeWorktreeMock } = vi.hoisted(() => ({
  removeWorktreeMock: vi.fn(),
}));

vi.mock('./workspace/worktree-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace/worktree-manager')>();
  return {
    ...actual,
    removeWorktree: removeWorktreeMock,
  };
});

vi.mock('./workspace/repository-provider-store', () => ({
  RepositoryProviderStore: class RepositoryProviderStoreMock {
    list() {
      return [];
    }

    listInternal() {
      return [];
    }

    get() {
      return null;
    }

    getToken() {
      return null;
    }

    close(): void {}
  },
}));

vi.mock('./workspace/repository-profile-store', () => ({
  RepositoryProfileStore: class RepositoryProfileStoreMock {
    private readonly profiles = new Map<string, RepositoryProfile>();

    list(): RepositoryProfile[] {
      return Array.from(this.profiles.values());
    }

    get(repositoryProfileId: string): RepositoryProfile | null {
      return this.profiles.get(repositoryProfileId) ?? null;
    }

    save(profile: RepositoryProfile): RepositoryProfile {
      this.profiles.set(profile.repositoryProfileId, profile);
      return profile;
    }

    close(): void {}
  },
}));

vi.mock('./workspace/review-workspace-store', () => ({
  ReviewWorkspaceStore: class ReviewWorkspaceStoreMock {
    private readonly workspaces = new Map<string, ReviewWorkspace>();

    list(): ReviewWorkspace[] {
      return Array.from(this.workspaces.values());
    }

    get(reviewWorkspaceId: string): ReviewWorkspace | null {
      return this.workspaces.get(reviewWorkspaceId) ?? null;
    }

    save(workspace: ReviewWorkspace): ReviewWorkspace {
      this.workspaces.set(workspace.reviewWorkspaceId, workspace);
      return workspace;
    }

    delete(reviewWorkspaceId: string): void {
      this.workspaces.delete(reviewWorkspaceId);
    }

    close(): void {}
  },
}));

vi.mock('./store/graph-review-store', () => ({
  GraphReviewStore: class GraphReviewStoreMock {
    private readonly workspaces = new Map<string, ReviewWorkspace>();

    listWorkspaces(): ReviewWorkspace[] {
      return Array.from(this.workspaces.values());
    }

    getWorkspace(reviewWorkspaceId: string): ReviewWorkspace | null {
      return this.workspaces.get(reviewWorkspaceId) ?? null;
    }

    saveWorkspace(workspace: ReviewWorkspace): ReviewWorkspace {
      this.workspaces.set(workspace.reviewWorkspaceId, workspace);
      return workspace;
    }

    saveInitialWorkspaceBundle(bundle: { workspace: ReviewWorkspace }): {
      workspace: ReviewWorkspace;
    } {
      this.workspaces.set(bundle.workspace.reviewWorkspaceId, bundle.workspace);
      return bundle;
    }

    deleteWorkspaceBundle(reviewWorkspaceId: string): void {
      this.workspaces.delete(reviewWorkspaceId);
    }

    getWorkspaceGraphRecord(): null {
      return null;
    }

    updateAnalysisRun(): null {
      return null;
    }

    saveAnalysisRun(): void {}

    getRevision(): null {
      return null;
    }

    getSourceSnapshotByRevision(): null {
      return null;
    }

    saveGraphAndLayout(): void {}

    close(): void {}
  },
}));

function createTempDir(tempDirs: string[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-thread-app-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function createProfile(): RepositoryProfile {
  return {
    repositoryProfileId: 'profile-1',
    repositoryProviderId: 'provider-1',
    originUrl: 'https://github.com/acme/project.git',
    resolvedProvider: {
      kind: 'github',
      baseUrl: 'https://github.com',
      host: 'github.com',
    },
    repoLocator: {
      kind: 'github',
      owner: 'acme',
      repo: 'project',
    },
    localClonePath: 'C:\\repo',
    worktreeRootPath: 'C:\\worktrees',
    setupScript: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createWorkspace(overrides: Partial<ReviewWorkspace> = {}): ReviewWorkspace {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    reviewId: '123',
    title: 'Review workspace',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/remove-workspace',
    worktreePath: 'C:\\worktrees\\project-pr-123',
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedGateway(tempDirs: string[]) {
  const gateway = new GraphReviewGateway(createTempDir(tempDirs), () => undefined);
  const stores = gateway as unknown as {
    profileStore: { save: (profile: RepositoryProfile) => RepositoryProfile };
    graphStore: {
      save: (workspace: ReviewWorkspace) => ReviewWorkspace;
      get: (reviewWorkspaceId: string) => ReviewWorkspace | null;
      saveWorkspace: (workspace: ReviewWorkspace) => ReviewWorkspace;
      getWorkspace: (reviewWorkspaceId: string) => ReviewWorkspace | null;
    };
  };
  stores.profileStore.save(createProfile());
  stores.graphStore.saveWorkspace(createWorkspace());
  return { gateway, stores };
}

describe('GraphReviewGateway.removeReviewWorkspace', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    removeWorktreeMock.mockReset();
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('removes the git worktree before deleting the stored workspace', async () => {
    const { gateway, stores } = seedGateway(tempDirs);
    removeWorktreeMock.mockResolvedValueOnce(undefined);

    try {
      const result = await gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
      });

      expect(result).toEqual({ ok: true, reviewWorkspaceId: 'workspace-1' });
      expect(removeWorktreeMock).toHaveBeenCalledWith(
        'C:\\repo',
        'C:\\worktrees\\project-pr-123',
        false,
      );
      expect(stores.graphStore.getWorkspace('workspace-1')).toBeNull();
    } finally {
      gateway.dispose();
    }
  });

  it('keeps the stored workspace and requests force when normal remove fails', async () => {
    const { gateway, stores } = seedGateway(tempDirs);
    removeWorktreeMock.mockRejectedValueOnce(
      new Error('contains modified or untracked files, use --force to delete it'),
    );

    try {
      const result = await gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
      });

      expect(result).toEqual({
        ok: false,
        reviewWorkspaceId: 'workspace-1',
        reason: 'forceRequired',
        message: 'contains modified or untracked files, use --force to delete it',
      });
      expect(stores.graphStore.getWorkspace('workspace-1')).toEqual(createWorkspace());
    } finally {
      gateway.dispose();
    }
  });

  it('reports gitFailed for normal remove failures that are not force recoverable', async () => {
    const { gateway, stores } = seedGateway(tempDirs);
    removeWorktreeMock.mockRejectedValueOnce(new Error('not a git repository'));

    try {
      const result = await gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
      });

      expect(result).toEqual({
        ok: false,
        reviewWorkspaceId: 'workspace-1',
        reason: 'gitFailed',
        message: 'not a git repository',
      });
      expect(stores.graphStore.getWorkspace('workspace-1')).toEqual(createWorkspace());
    } finally {
      gateway.dispose();
    }
  });

  it('blocks concurrent workspace removals', async () => {
    const { gateway } = seedGateway(tempDirs);
    let releaseRemove!: () => void;
    removeWorktreeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseRemove = resolve;
      }),
    );

    try {
      const firstRemove = gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
      });
      await Promise.resolve();

      await expect(
        gateway.removeReviewWorkspace({ reviewWorkspaceId: 'workspace-1' }),
      ).resolves.toEqual({
        ok: false,
        reviewWorkspaceId: 'workspace-1',
        reason: 'gitFailed',
        message: 'Workspace の削除処理が進行中です。',
      });

      releaseRemove();
      await expect(firstRemove).resolves.toEqual({
        ok: true,
        reviewWorkspaceId: 'workspace-1',
      });
    } finally {
      gateway.dispose();
    }
  });

  it('blocks workspace creation while removal is running', async () => {
    const { gateway } = seedGateway(tempDirs);
    let releaseRemove!: () => void;
    removeWorktreeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseRemove = resolve;
      }),
    );

    try {
      const activeRemove = gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
      });
      await Promise.resolve();

      expect(() =>
        gateway.createReviewWorkspace({
          reviewUrl: 'https://github.com/acme/project/pull/123',
          repositoryProfileId: 'profile-1',
        }),
      ).toThrow('Workspace の削除処理が進行中です。');

      releaseRemove();
      await activeRemove;
    } finally {
      gateway.dispose();
    }
  });

  it('uses forced git remove and deletes the stored workspace when force succeeds', async () => {
    const { gateway, stores } = seedGateway(tempDirs);
    removeWorktreeMock.mockResolvedValueOnce(undefined);

    try {
      const result = await gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
        force: true,
      });

      expect(result).toEqual({ ok: true, reviewWorkspaceId: 'workspace-1' });
      expect(removeWorktreeMock).toHaveBeenCalledWith(
        'C:\\repo',
        'C:\\worktrees\\project-pr-123',
        true,
      );
      expect(stores.graphStore.getWorkspace('workspace-1')).toBeNull();
    } finally {
      gateway.dispose();
    }
  });

  it('keeps the stored workspace and reports gitFailed when forced remove fails', async () => {
    const { gateway, stores } = seedGateway(tempDirs);
    removeWorktreeMock.mockRejectedValueOnce(new Error('remove failed'));

    try {
      const result = await gateway.removeReviewWorkspace({
        reviewWorkspaceId: 'workspace-1',
        force: true,
      });

      expect(result).toEqual({
        ok: false,
        reviewWorkspaceId: 'workspace-1',
        reason: 'gitFailed',
        message: 'remove failed',
      });
      expect(stores.graphStore.getWorkspace('workspace-1')).toEqual(createWorkspace());
    } finally {
      gateway.dispose();
    }
  });

  it('returns notFound when the workspace does not exist', async () => {
    const gateway = new GraphReviewGateway(createTempDir(tempDirs), () => undefined);

    try {
      await expect(
        gateway.removeReviewWorkspace({ reviewWorkspaceId: 'missing-workspace' }),
      ).resolves.toEqual({
        ok: false,
        reviewWorkspaceId: 'missing-workspace',
        reason: 'notFound',
        message: 'Review Workspace が見つかりません。',
      });
      expect(removeWorktreeMock).not.toHaveBeenCalled();
    } finally {
      gateway.dispose();
    }
  });
});
