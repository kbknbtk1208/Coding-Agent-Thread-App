import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryProfile } from '../../shared/poc3-domain/repository';
import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewRun,
} from '../../shared/poc3-domain/agent-review';
import type { RevisionCommitView } from '../../shared/poc3-domain/revision-commit';
import type { RevisionContext } from '../../shared/poc3-domain/revision';
import type { ReviewWorkspace } from '../../shared/poc3-domain/review-workspace';
import { GraphReviewGateway } from './graph-review-gateway';

vi.mock('./workspace/worktree-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace/worktree-manager')>();
  return { ...actual, removeWorktree: vi.fn() };
});

vi.mock('./workspace/repository-provider-store', () => ({
  RepositoryProviderStore: class {
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
  RepositoryProfileStore: class {
    private readonly profiles = new Map<string, RepositoryProfile>();
    list() {
      return Array.from(this.profiles.values());
    }
    get(id: string) {
      return this.profiles.get(id) ?? null;
    }
    save(p: RepositoryProfile) {
      this.profiles.set(p.repositoryProfileId, p);
      return p;
    }
    close(): void {}
  },
}));

vi.mock('./workspace/review-workspace-store', () => ({
  ReviewWorkspaceStore: class {
    private readonly workspaces = new Map<string, ReviewWorkspace>();
    list() {
      return Array.from(this.workspaces.values());
    }
    get(id: string) {
      return this.workspaces.get(id) ?? null;
    }
    save(w: ReviewWorkspace) {
      this.workspaces.set(w.reviewWorkspaceId, w);
      return w;
    }
    delete(id: string) {
      this.workspaces.delete(id);
    }
    close(): void {}
  },
}));

vi.mock('./store/graph-review-store', () => ({
  GraphReviewStore: class {
    private readonly workspaces = new Map<string, ReviewWorkspace>();
    private readonly revisions = new Map<string, RevisionContext>();
    private readonly commitViews = new Map<string, RevisionCommitView[]>();

    listWorkspaces() {
      return Array.from(this.workspaces.values());
    }
    getWorkspace(id: string) {
      return this.workspaces.get(id) ?? null;
    }
    saveWorkspace(w: ReviewWorkspace) {
      this.workspaces.set(w.reviewWorkspaceId, w);
      return w;
    }
    saveInitialWorkspaceBundle(bundle: { workspace: ReviewWorkspace }) {
      this.workspaces.set(bundle.workspace.reviewWorkspaceId, bundle.workspace);
      return bundle;
    }
    deleteWorkspaceBundle(id: string) {
      this.workspaces.delete(id);
    }
    getWorkspaceGraphRecord() {
      return null;
    }
    updateAnalysisRun() {
      return null;
    }
    saveAnalysisRun(): void {}
    getRevision(revisionId: string) {
      return this.revisions.get(revisionId) ?? null;
    }
    getRevisionCommitView(workspaceId: string) {
      return this.commitViews.get(workspaceId) ?? [];
    }
    getSourceSnapshotByRevision() {
      return null;
    }
    saveGraphAndLayout(): void {}
    saveRevision(r: RevisionContext) {
      this.revisions.set(r.revisionId, r);
    }
    saveCommitViews(workspaceId: string, views: RevisionCommitView[]) {
      this.commitViews.set(workspaceId, views);
    }
    close(): void {}
  },
}));

vi.mock('./agent/store', () => ({
  Poc3AgentReviewStore: class {
    private readonly runs = new Map<string, Poc3AgentReviewRun>();
    private readonly envelopes = new Map<string, Poc3AgentReviewEnvelope>();

    saveRun(run: Poc3AgentReviewRun) {
      this.runs.set(run.runId, run);
      return run;
    }
    getRun(runId: string) {
      return this.runs.get(runId) ?? null;
    }
    getRunByAppSessionId() {
      return null;
    }
    listRuns(workspaceId: string) {
      return Array.from(this.runs.values()).filter((r) => r.reviewWorkspaceId === workspaceId);
    }
    getEnvelope(runId: string) {
      return this.envelopes.get(runId) ?? null;
    }
    saveEnvelope(e: Poc3AgentReviewEnvelope) {
      this.envelopes.set(e.run.runId, e);
      return e;
    }
    listThreadsForNode() {
      return [];
    }
    listThreadsForWorkspace() {
      return [];
    }
    deleteWorkspaceRuns(): void {}
    getBindingByDiscussionSession() {
      return null;
    }
    close(): void {}
  },
}));

vi.mock('./resolve-judgement/store', () => ({
  ResolveJudgementStore: class {
    deleteWorkspace(): void {}
    close(): void {}
  },
}));

vi.mock('./published-agent-thread/store', () => ({
  PublishedAgentThreadLinkStore: class {
    deleteWorkspaceLinks(): void {}
    listLinksForWorkspace(): unknown[] {
      return [];
    }
    markSyncResult(): void {}
  },
}));

function createTempDir(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-thread-app-ar-'));
  tempDirs.push(dir);
  return dir;
}

function createProfile(): RepositoryProfile {
  return {
    repositoryProfileId: 'profile-1',
    repositoryProviderId: 'provider-1',
    originUrl: 'https://github.com/acme/project.git',
    resolvedProvider: { kind: 'github', baseUrl: 'https://github.com', host: 'github.com' },
    repoLocator: { kind: 'github', owner: 'acme', repo: 'project' },
    localClonePath: 'C:\\repo',
    worktreeRootPath: 'C:\\worktrees',
    setupScript: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createWorkspace(): ReviewWorkspace {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/1',
    reviewId: '1',
    title: 'Test PR',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/test',
    worktreePath: 'C:\\worktrees\\project-pr-1',
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createRun(overrides: Partial<Poc3AgentReviewRun> = {}): Poc3AgentReviewRun {
  return {
    runId: 'run-1',
    reviewWorkspaceId: 'workspace-1',
    revisionId: 'revision-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    reviewAgent: 'codex',
    lensId: 'lens-1',
    instructions: 'Review this.',
    codexModel: 'gpt-5.4',
    codexReasoningEffort: 'high',
    rootAppSessionId: 'session-1',
    status: 'completed',
    resultSource: 'codexOutputSchema',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

function createRevision(): RevisionContext {
  return {
    revisionId: 'revision-1',
    reviewWorkspaceId: 'workspace-1',
    provider: 'github',
    reviewId: '1',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    startSha: null,
    sourceBranchName: 'feature/test',
    diffVersion: null,
    isActive: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

type GatewayStores = {
  profileStore: { save(p: RepositoryProfile): RepositoryProfile };
  graphStore: {
    saveWorkspace(w: ReviewWorkspace): ReviewWorkspace;
    saveRevision(r: RevisionContext): void;
    saveCommitViews(workspaceId: string, views: RevisionCommitView[]): void;
  };
  agentReviewStore: {
    saveRun(run: Poc3AgentReviewRun): Poc3AgentReviewRun;
    saveEnvelope(e: Poc3AgentReviewEnvelope): Poc3AgentReviewEnvelope;
  };
};

function seedGateway(tempDirs: string[]) {
  const gateway = new GraphReviewGateway(createTempDir(tempDirs), () => undefined);
  const stores = gateway as unknown as GatewayStores;
  stores.profileStore.save(createProfile());
  stores.graphStore.saveWorkspace(createWorkspace());
  return { gateway, stores };
}

describe('GraphReviewGateway.listAgentReviewRuns', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('attaches commit snapshot when revision and head commit are found', () => {
    const { gateway, stores } = seedGateway(tempDirs);
    const run = createRun();
    stores.agentReviewStore.saveRun(run);
    stores.graphStore.saveRevision(createRevision());
    stores.graphStore.saveCommitViews('workspace-1', [
      {
        sha: 'b'.repeat(40),
        shortSha: 'bbbbbbb',
        message: 'Fix validation around review source',
        author: { name: 'Dev', email: null, avatarUrl: null },
        authoredAt: '2026-01-01T00:00:00.000Z',
        committedAt: '2026-01-01T00:00:00.000Z',
        parents: [],
        refs: [],
        url: null,
        role: 'head',
        revisionId: 'revision-1',
      },
    ]);

    try {
      const result = gateway.listAgentReviewRuns({ reviewWorkspaceId: 'workspace-1' });
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]?.commit).toEqual({
        revisionId: 'revision-1',
        headSha: 'b'.repeat(40),
        shortSha: 'bbbbbbb',
        message: 'Fix validation around review source',
      });
    } finally {
      gateway.dispose();
    }
  });

  it('attaches fallback commit snapshot when revision is not found', () => {
    const { gateway, stores } = seedGateway(tempDirs);
    stores.agentReviewStore.saveRun(createRun());

    try {
      const result = gateway.listAgentReviewRuns({ reviewWorkspaceId: 'workspace-1' });
      expect(result.runs[0]?.commit).not.toBeNull();
      expect(result.runs[0]?.commit?.shortSha).toHaveLength(7);
    } finally {
      gateway.dispose();
    }
  });
});

describe('GraphReviewGateway.getAgentReviewRunDetail', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns envelope and commit snapshot for a found run', () => {
    const { gateway, stores } = seedGateway(tempDirs);
    const run = createRun();
    stores.agentReviewStore.saveRun(run);
    stores.graphStore.saveRevision(createRevision());
    stores.graphStore.saveCommitViews('workspace-1', [
      {
        sha: 'b'.repeat(40),
        shortSha: 'bbbbbbb',
        message: 'Add feature',
        author: { name: 'Dev', email: null, avatarUrl: null },
        authoredAt: '2026-01-01T00:00:00.000Z',
        committedAt: '2026-01-01T00:00:00.000Z',
        parents: [],
        refs: [],
        url: null,
        role: 'head',
        revisionId: 'revision-1',
      },
    ]);
    const envelope: Poc3AgentReviewEnvelope = {
      kind: 'structured',
      run,
      summary: {
        headline: 'Looks good',
        overview: 'The change is clean.',
        positives: [],
        risks: [],
      },
      threads: [],
    };
    stores.agentReviewStore.saveEnvelope(envelope);

    try {
      const result = gateway.getAgentReviewRunDetail({
        reviewWorkspaceId: 'workspace-1',
        runId: 'run-1',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.detail.envelope?.kind).toBe('structured');
      expect(result.detail.commit?.shortSha).toBe('bbbbbbb');
    } finally {
      gateway.dispose();
    }
  });

  it('returns runNotFound when run belongs to a different workspace', () => {
    const { gateway, stores } = seedGateway(tempDirs);
    stores.agentReviewStore.saveRun(createRun({ reviewWorkspaceId: 'workspace-other' }));

    try {
      const result = gateway.getAgentReviewRunDetail({
        reviewWorkspaceId: 'workspace-1',
        runId: 'run-1',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('runNotFound');
    } finally {
      gateway.dispose();
    }
  });

  it('returns workspaceNotFound when workspace does not exist', () => {
    const { gateway } = seedGateway(tempDirs);

    try {
      const result = gateway.getAgentReviewRunDetail({
        reviewWorkspaceId: 'workspace-unknown',
        runId: 'run-1',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('workspaceNotFound');
    } finally {
      gateway.dispose();
    }
  });
});
