import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCreationEvent } from '../../../shared/poc3-domain/review-workspace';
import { ReviewWorkspaceCreationCoordinator } from './review-workspace-creation-coordinator';

const {
  addWorktreeMock,
  ensureDirectoryExistsMock,
  fetchHeadRefMock,
  planWorktreePathMock,
  verifyHeadShaMock,
  runSetupScriptMock,
  fetchReviewSourceSnapshotMock,
} = vi.hoisted(() => ({
  addWorktreeMock: vi.fn(),
  ensureDirectoryExistsMock: vi.fn(),
  fetchHeadRefMock: vi.fn(),
  planWorktreePathMock: vi.fn(),
  verifyHeadShaMock: vi.fn(),
  runSetupScriptMock: vi.fn(),
  fetchReviewSourceSnapshotMock: vi.fn(),
}));

vi.mock('./worktree-manager', () => ({
  addWorktree: addWorktreeMock,
  ensureDirectoryExists: ensureDirectoryExistsMock,
  fetchHeadRef: fetchHeadRefMock,
  planWorktreePath: planWorktreePathMock,
  verifyHeadSha: verifyHeadShaMock,
}));

vi.mock('./setup-script-runner', () => ({
  runSetupScript: runSetupScriptMock,
}));

vi.mock('../source/review-source-gateway', () => ({
  fetchReviewSourceSnapshot: fetchReviewSourceSnapshotMock,
}));

function createInputs() {
  return {
    jobId: 'job-1',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    repositoryProfileId: 'profile-1',
    target: {
      repositoryProviderId: 'provider-1',
      repositoryProfileId: 'profile-1',
      provider: 'github' as const,
      reviewUrl: 'https://github.com/acme/project/pull/123',
      reviewId: '123',
      repositoryLabel: 'acme/project',
      originUrl: 'https://github.com/acme/project.git',
      localClonePath: 'C:\\repo',
      worktreeRootPath: 'C:\\worktrees',
      setupScript: {
        shell: 'powershell' as const,
        scriptText: 'npm install',
        cwdMode: 'worktreePath' as const,
      },
    },
    provider: {
      repositoryProviderId: 'provider-1',
      kind: 'github' as const,
      displayName: 'GitHub',
      baseUrl: 'https://github.com',
      tokenRef: 'token-ref',
      isDefaultForKind: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    profile: {
      repositoryProfileId: 'profile-1',
      repositoryProviderId: 'provider-1',
      originUrl: 'https://github.com/acme/project.git',
      resolvedProvider: {
        kind: 'github' as const,
        baseUrl: 'https://github.com',
        host: 'github.com',
      },
      repoLocator: {
        kind: 'github' as const,
        owner: 'acme',
        repo: 'project',
      },
      localClonePath: 'C:\\repo',
      worktreeRootPath: 'C:\\worktrees',
      setupScript: {
        shell: 'powershell' as const,
        scriptText: 'npm install',
        cwdMode: 'worktreePath' as const,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    providerToken: 'token',
  };
}

function createSnapshot() {
  return {
    provider: 'github' as const,
    reviewId: '123',
    title: 'Review workspace',
    description: 'description',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    startSha: null,
    sourceBranchName: 'feature/test',
    diffVersion: null,
    changedFiles: [],
    remoteThreads: [],
    diagnostics: [],
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ReviewWorkspaceCreationCoordinator', () => {
  afterEach(() => {
    addWorktreeMock.mockReset();
    ensureDirectoryExistsMock.mockReset();
    fetchHeadRefMock.mockReset();
    planWorktreePathMock.mockReset();
    verifyHeadShaMock.mockReset();
    runSetupScriptMock.mockReset();
    fetchReviewSourceSnapshotMock.mockReset();
  });

  it('keeps the job running until graph analysis completes', async () => {
    const events: WorkspaceCreationEvent[] = [];
    const savedBundles: unknown[] = [];
    let releaseAnalysis!: () => void;

    fetchReviewSourceSnapshotMock.mockResolvedValue(createSnapshot());
    planWorktreePathMock.mockReturnValue({ worktreePath: 'C:\\worktrees\\project-pr-123' });
    ensureDirectoryExistsMock.mockResolvedValue(undefined);
    addWorktreeMock.mockResolvedValue(undefined);
    fetchHeadRefMock.mockResolvedValue(undefined);
    verifyHeadShaMock.mockResolvedValue(undefined);
    runSetupScriptMock.mockResolvedValue({ code: 0 });

    const coordinator = new ReviewWorkspaceCreationCoordinator({
      emit: (event) => events.push(event),
      saveInitialWorkspaceBundle: (bundle) => {
        savedBundles.push(bundle);
        return bundle;
      },
      runInitialGraphAnalysis: async (_analysisRunId, _revisionId, onProgress) => {
        onProgress?.({ phase: 'program', message: 'TypeScript Program を構築しています。' });
        await new Promise<void>((resolve) => {
          releaseAnalysis = resolve;
        });
        onProgress?.({ phase: 'persist', message: 'Graph snapshot を保存しています。' });
        return {
          analysisRunId: 'analysis-1',
          revisionId: 'revision-1',
          scopeKey: 'initial:diff-plus-1-hop:v1',
          status: 'completed',
          phase: 'persist',
          progress: {},
          errorMessage: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
        };
      },
    });

    coordinator.startJob(createInputs());
    await flushPromises();

    const runningJob = coordinator.getJob('job-1');
    expect(runningJob?.status).toBe('running');
    expect(runningJob?.phase).toBe('analysisProgram');
    expect(savedBundles).toHaveLength(1);

    releaseAnalysis();
    await flushPromises();

    const completedJob = coordinator.getJob('job-1');
    expect(completedJob?.status).toBe('completed');
    expect(completedJob?.phase).toBe('done');
    expect(completedJob?.reviewWorkspaceId).toBeTruthy();

    const logLines = completedJob?.logLines ?? [];
    expect(logLines.some((line) => line.includes('[runSetupScript] setup script completed.'))).toBe(
      true,
    );
    expect(logLines.some((line) => line.includes('TypeScript Program を構築しています。'))).toBe(
      true,
    );
    expect(logLines[logLines.length - 1]).toContain('[done] Review Workspace を作成しました。');

    const snapshots = events.filter(
      (event): event is Extract<WorkspaceCreationEvent, { type: 'snapshot' }> =>
        event.type === 'snapshot',
    );
    expect(snapshots[snapshots.length - 1].job.status).toBe('completed');
  });

  it('keeps the workspace persisted and marks the job failed when graph analysis fails', async () => {
    const savedBundles: unknown[] = [];

    fetchReviewSourceSnapshotMock.mockResolvedValue(createSnapshot());
    planWorktreePathMock.mockReturnValue({ worktreePath: 'C:\\worktrees\\project-pr-123' });
    ensureDirectoryExistsMock.mockResolvedValue(undefined);
    addWorktreeMock.mockResolvedValue(undefined);
    fetchHeadRefMock.mockResolvedValue(undefined);
    verifyHeadShaMock.mockResolvedValue(undefined);
    runSetupScriptMock.mockResolvedValue({ code: 0 });

    const coordinator = new ReviewWorkspaceCreationCoordinator({
      emit: () => undefined,
      saveInitialWorkspaceBundle: (bundle) => {
        savedBundles.push(bundle);
        return bundle;
      },
      runInitialGraphAnalysis: async () => {
        throw new Error('TypeScript Program の構築に失敗しました。');
      },
    });

    coordinator.startJob(createInputs());
    await flushPromises();

    const failedJob = coordinator.getJob('job-1');
    expect(savedBundles).toHaveLength(1);
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.reviewWorkspaceId).toBeTruthy();
    expect(failedJob?.errorMessage).toBe('TypeScript Program の構築に失敗しました。');
    expect(
      failedJob?.logLines.some((line) =>
        line.includes('[error] TypeScript Program の構築に失敗しました。'),
      ),
    ).toBe(true);
  });
});
