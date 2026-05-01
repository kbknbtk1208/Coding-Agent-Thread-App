import { describe, expect, it, vi } from 'vitest';
import type {
  AnalysisRunSnapshot,
  CodeGraphSnapshot,
  GraphAnalysisEvent,
  LayoutSnapshot,
} from '../../../shared/poc3-domain/graph';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import { AnalysisCoordinator } from './analysis-coordinator';

const { runInitialGraphAnalysisMock, layoutGraphMock } = vi.hoisted(() => ({
  runInitialGraphAnalysisMock: vi.fn(),
  layoutGraphMock: vi.fn(),
}));

vi.mock('./analysis-worker-client', () => ({
  AnalysisWorkerClient: class AnalysisWorkerClientMock {
    runInitialGraphAnalysis = runInitialGraphAnalysisMock;
  },
}));

vi.mock('../layout/elk-layout-service', () => ({
  layoutGraph: layoutGraphMock,
}));

function createAnalysisRun(revisionId = 'revision-1'): AnalysisRunSnapshot {
  return {
    analysisRunId: 'analysis-1',
    revisionId,
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'queued',
    phase: 'diffScope',
    progress: {},
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createWorkspace(): ReviewWorkspace {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    reviewId: '123',
    title: 'Review workspace',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/test',
    worktreePath: 'C:\\worktrees\\project-pr-123',
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createRevision(): RevisionContext {
  return {
    revisionId: 'revision-1',
    reviewWorkspaceId: 'workspace-1',
    provider: 'github',
    reviewId: '123',
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

function createSourceSnapshot(): ReviewSourceSnapshot {
  return {
    sourceSnapshotId: 'source-1',
    revisionId: 'revision-1',
    provider: 'github',
    reviewId: '123',
    title: 'Review workspace',
    description: 'description',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    startSha: null,
    diffVersion: null,
    changedFiles: [],
    remoteThreads: [],
    remoteThreadsSummary: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createGraph(): CodeGraphSnapshot {
  return {
    graphSnapshotId: 'graph-1',
    revisionId: 'revision-1',
    scopeKey: 'initial:diff-plus-1-hop:v1',
    status: 'ready',
    nodes: [],
    edges: [],
    limits: {
      nodeLimit: 200,
      edgeLimit: 300,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createLayout(): LayoutSnapshot {
  return {
    layoutSnapshotId: 'layout-1',
    graphSnapshotId: 'graph-1',
    engine: 'elk',
    positions: {},
    viewport: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

class FakeGraphReviewStore {
  public analysisRun = createAnalysisRun();
  public readonly savedLayouts: Array<{ graph: CodeGraphSnapshot; layout: LayoutSnapshot }> = [];

  getRevision(): RevisionContext | null {
    return createRevision();
  }

  getWorkspace(): ReviewWorkspace | null {
    return createWorkspace();
  }

  getSourceSnapshotByRevision(): ReviewSourceSnapshot | null {
    return createSourceSnapshot();
  }

  saveAnalysisRun(run: AnalysisRunSnapshot): AnalysisRunSnapshot {
    this.analysisRun = run;
    return run;
  }

  getAnalysisRun(analysisRunId: string): AnalysisRunSnapshot | null {
    return this.analysisRun.analysisRunId === analysisRunId ? this.analysisRun : null;
  }

  updateAnalysisRun(
    analysisRunId: string,
    patch: Partial<Pick<AnalysisRunSnapshot, 'status' | 'phase' | 'progress' | 'errorMessage'>>,
  ): AnalysisRunSnapshot | null {
    if (analysisRunId !== this.analysisRun.analysisRunId) {
      return null;
    }
    this.analysisRun = {
      ...this.analysisRun,
      ...patch,
      startedAt:
        this.analysisRun.startedAt ??
        (patch.status === 'running' ? '2026-01-01T00:00:00.500Z' : this.analysisRun.startedAt),
      completedAt:
        patch.status === 'completed' || patch.status === 'failed'
          ? '2026-01-01T00:00:01.000Z'
          : this.analysisRun.completedAt,
      updatedAt: '2026-01-01T00:00:01.000Z',
    };
    return this.analysisRun;
  }

  saveGraphAndLayout(graph: CodeGraphSnapshot, layout: LayoutSnapshot): void {
    this.savedLayouts.push({ graph, layout });
  }
}

describe('AnalysisCoordinator', () => {
  it('reports progress callbacks for worker and layout/persist phases while keeping graph events intact', async () => {
    const store = new FakeGraphReviewStore();
    const events: GraphAnalysisEvent[] = [];
    const progress: Array<{ phase: string; message: string }> = [];

    runInitialGraphAnalysisMock.mockImplementationOnce(
      async (
        _input,
        onProgress?: (event: {
          phase: 'program' | 'extract' | 'buildGraph';
          message: string;
        }) => void,
      ) => {
        onProgress?.({ phase: 'program', message: 'TypeScript Program を構築しています。' });
        onProgress?.({ phase: 'extract', message: '依存関係を抽出しています。' });
        onProgress?.({ phase: 'buildGraph', message: '依存関係 Graph を構築しています。' });
        return { graph: createGraph() };
      },
    );
    layoutGraphMock.mockResolvedValueOnce({ graph: createGraph(), layout: createLayout() });

    const coordinator = new AnalysisCoordinator(store as unknown as never, (event) =>
      events.push(event),
    );

    const result = await coordinator.runInitialGraphAnalysisAndWait(
      'analysis-1',
      'revision-1',
      (event) => progress.push(event),
    );

    expect(result.status).toBe('completed');
    expect(progress.map((event) => event.phase)).toEqual([
      'program',
      'extract',
      'buildGraph',
      'layout',
      'persist',
      'persist',
    ]);
    expect(progress.map((event) => event.message)).toContain('Graph layout を計算しています。');
    expect(progress.map((event) => event.message)).toContain('Graph snapshot を保存しています。');
    expect(events.some((event) => event.type === 'graph.ready')).toBe(true);
    expect(store.savedLayouts).toHaveLength(1);
  });
});
