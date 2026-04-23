import { randomUUID } from 'crypto';
import type { AnalysisRunSnapshot, GraphAnalysisEvent } from '../../../shared/poc3-domain/graph';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { InitialGraphAnalysisProgress } from './analysis-worker-entry';
import type { GraphReviewStore } from '../store/graph-review-store';
import { layoutGraph } from '../layout/elk-layout-service';
import { AnalysisWorkerClient } from './analysis-worker-client';

function nowIso(): string {
  return new Date().toISOString();
}

export function createQueuedInitialAnalysisRun(revisionId: string): AnalysisRunSnapshot {
  const timestamp = nowIso();
  return {
    analysisRunId: randomUUID(),
    revisionId,
    scopeKey: INITIAL_GRAPH_SCOPE_KEY,
    status: 'queued',
    phase: 'diffScope',
    progress: {},
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface InitialGraphAnalysisProgressEvent {
  phase: AnalysisRunSnapshot['phase'];
  message: string;
}

export class AnalysisCoordinator {
  private readonly runningByRevisionScope = new Set<string>();
  private readonly workerClient = new AnalysisWorkerClient();

  constructor(
    private readonly store: GraphReviewStore,
    private readonly emit: (event: GraphAnalysisEvent) => void,
  ) {}

  enqueueInitialGraphAnalysis(analysisRunId: string, revisionId: string): void {
    const key = this.tryClaimRunKey(revisionId);
    if (!key) {
      return;
    }
    const run = this.store.updateAnalysisRun(analysisRunId, {
      status: 'queued',
      phase: 'diffScope',
      errorMessage: null,
    });
    if (run) {
      this.emitSnapshot(run, 'Graph analysis queued');
    }

    setTimeout(() => {
      void this.run(analysisRunId, revisionId, key);
    }, 0);
  }

  async runInitialGraphAnalysisAndWait(
    analysisRunId: string,
    revisionId: string,
    onProgress?: (event: InitialGraphAnalysisProgressEvent) => void,
  ): Promise<AnalysisRunSnapshot> {
    const key = this.claimRunKey(revisionId);
    return this.run(analysisRunId, revisionId, key, onProgress);
  }

  retryInitialGraphAnalysis(revisionId: string): AnalysisRunSnapshot {
    const run = createQueuedInitialAnalysisRun(revisionId);
    this.store.saveAnalysisRun(run);
    this.enqueueInitialGraphAnalysis(run.analysisRunId, revisionId);
    return run;
  }

  private async run(
    analysisRunId: string,
    revisionId: string,
    runningKey: string,
    onProgress?: (event: InitialGraphAnalysisProgressEvent) => void,
  ): Promise<AnalysisRunSnapshot> {
    try {
      const revision = this.store.getRevision(revisionId);
      if (!revision) {
        throw new Error('RevisionContext が見つかりません。');
      }
      const workspace = this.store.getWorkspace(revision.reviewWorkspaceId);
      const sourceSnapshot = this.store.getSourceSnapshotByRevision(revisionId);
      if (!workspace || !sourceSnapshot) {
        throw new Error('解析に必要な Workspace または Source Snapshot が見つかりません。');
      }

      const output = await this.workerClient.runInitialGraphAnalysis(
        {
          revisionId,
          worktreePath: workspace.worktreePath,
          sourceSnapshot,
        },
        (progress) => {
          const mapped = this.toProgressEvent(progress);
          this.updateAndEmit(analysisRunId, 'running', mapped.phase, mapped.message, onProgress);
        },
      );

      this.updateAndEmit(
        analysisRunId,
        'running',
        'layout',
        'Graph layout を計算しています。',
        onProgress,
      );
      const { graph, layout } = await layoutGraph(output.graph);
      this.updateAndEmit(
        analysisRunId,
        'running',
        'persist',
        'Graph snapshot を保存しています。',
        onProgress,
      );
      this.store.saveGraphAndLayout(graph, layout);

      const completed = this.store.updateAnalysisRun(analysisRunId, {
        status: 'completed',
        phase: 'persist',
        progress: { graphSnapshotId: graph.graphSnapshotId, nodeCount: graph.nodes.length },
        errorMessage: null,
      });
      if (completed) {
        this.emitSnapshot(completed, 'Graph analysis completed');
        onProgress?.({
          phase: 'persist',
          message: 'Graph analysis completed',
        });
        this.emit({
          type: 'graph.ready',
          revisionId,
          scopeKey: graph.scopeKey,
          graphSnapshotId: graph.graphSnapshotId,
        });
        return completed;
      }
      throw new Error('AnalysisRunSnapshot の更新に失敗しました。');
    } catch (err) {
      const failed = this.store.updateAnalysisRun(analysisRunId, {
        status: 'failed',
        phase: 'persist',
        progress: {},
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      if (failed) {
        this.emitSnapshot(failed, failed.errorMessage);
        onProgress?.({
          phase: failed.phase,
          message: failed.errorMessage ?? 'Graph analysis が失敗しました。',
        });
        throw new Error(failed.errorMessage ?? 'Graph analysis が失敗しました。');
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      this.runningByRevisionScope.delete(runningKey);
    }
  }

  private updateAndEmit(
    analysisRunId: string,
    status: AnalysisRunSnapshot['status'],
    phase: AnalysisRunSnapshot['phase'],
    message: string,
    onProgress?: (event: InitialGraphAnalysisProgressEvent) => void,
  ): void {
    const run = this.store.updateAnalysisRun(analysisRunId, {
      status,
      phase,
      progress: { message },
      errorMessage: null,
    });
    if (run) {
      this.emitSnapshot(run, message);
      onProgress?.({ phase, message });
    }
  }

  private toProgressEvent(
    progress: InitialGraphAnalysisProgress,
  ): InitialGraphAnalysisProgressEvent {
    if (progress.phase === 'program') {
      return { phase: 'program', message: progress.message };
    }
    if (progress.phase === 'extract') {
      return { phase: 'extract', message: progress.message };
    }
    return { phase: 'buildGraph', message: progress.message };
  }

  private buildRunKey(revisionId: string): string {
    return `${revisionId}:${INITIAL_GRAPH_SCOPE_KEY}`;
  }

  private tryClaimRunKey(revisionId: string): string | null {
    const key = this.buildRunKey(revisionId);
    if (this.runningByRevisionScope.has(key)) {
      return null;
    }
    this.runningByRevisionScope.add(key);
    return key;
  }

  private claimRunKey(revisionId: string): string {
    const key = this.tryClaimRunKey(revisionId);
    if (!key) {
      throw new Error('Graph analysis is already running.');
    }
    return key;
  }

  private emitSnapshot(run: AnalysisRunSnapshot, message: string | null): void {
    this.emit({
      type: 'analysis.snapshot',
      analysisRunId: run.analysisRunId,
      revisionId: run.revisionId,
      scopeKey: run.scopeKey,
      status: run.status,
      phase: run.phase,
      message,
    });
  }
}
