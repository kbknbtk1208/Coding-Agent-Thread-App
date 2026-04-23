import path from 'path';
import Database from 'better-sqlite3';
import type {
  AnalysisRunSnapshot,
  CodeGraphSnapshot,
  GraphDiagnostic,
  GraphNodeLayout,
  GraphRenderSnapshot,
  LayoutSnapshot,
} from '../../../shared/poc3-domain/graph';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type {
  ReviewProviderKind,
  ReviewWorkspace,
} from '../../../shared/poc3-domain/review-workspace';

interface ReviewWorkspaceRow {
  review_workspace_id: string;
  repository_profile_id: string;
  provider: ReviewProviderKind;
  review_url: string;
  review_id: string;
  title: string;
  base_sha: string;
  head_sha: string;
  source_branch_name: string | null;
  worktree_path: string;
  setup_status: ReviewWorkspace['setupStatus'];
  status: ReviewWorkspace['status'];
  created_at: string;
  updated_at: string;
}

interface RevisionContextRow {
  revision_id: string;
  review_workspace_id: string;
  provider: ReviewProviderKind;
  review_id: string;
  base_sha: string;
  head_sha: string;
  start_sha: string | null;
  source_branch_name: string | null;
  diff_version: string | null;
  is_active: 0 | 1;
  status: RevisionContext['status'];
  created_at: string;
  updated_at: string;
}

interface ReviewSourceSnapshotRow {
  source_snapshot_id: string;
  revision_id: string;
  provider: ReviewProviderKind;
  review_id: string;
  title: string;
  description: string;
  base_sha: string;
  head_sha: string;
  start_sha: string | null;
  diff_version: string | null;
  changed_files_json: string;
  remote_threads_summary_json: string;
  created_at: string;
  updated_at: string;
}

interface AnalysisRunRow {
  analysis_run_id: string;
  revision_id: string;
  scope_key: string;
  status: AnalysisRunSnapshot['status'];
  phase: AnalysisRunSnapshot['phase'];
  progress_json: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GraphSnapshotRow {
  graph_snapshot_id: string;
  revision_id: string;
  scope_key: string;
  status: CodeGraphSnapshot['status'];
  nodes_json: string;
  edges_json: string;
  limits_json: string;
  diagnostics_json: string;
  created_at: string;
  updated_at: string;
}

interface LayoutSnapshotRow {
  layout_snapshot_id: string;
  graph_snapshot_id: string;
  engine: string;
  positions_json: string;
  viewport_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitialWorkspaceBundle {
  workspace: ReviewWorkspace;
  revision: RevisionContext;
  sourceSnapshot: ReviewSourceSnapshot;
  analysisRun: AnalysisRunSnapshot;
}

export interface WorkspaceGraphInput {
  workspace: ReviewWorkspace;
  activeRevision: RevisionContext;
  sourceSnapshot: ReviewSourceSnapshot;
}

export interface WorkspaceGraphRecord {
  workspace: ReviewWorkspace;
  activeRevision: RevisionContext | null;
  analysis: AnalysisRunSnapshot | null;
  graph: CodeGraphSnapshot | null;
  layout: LayoutSnapshot | null;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class GraphReviewStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  saveInitialWorkspaceBundle(bundle: InitialWorkspaceBundle): InitialWorkspaceBundle {
    const transaction = this.db.transaction((input: InitialWorkspaceBundle) => {
      this.insertWorkspace(input.workspace);
      this.insertRevision(input.revision);
      this.insertSourceSnapshot(input.sourceSnapshot);
      this.saveAnalysisRun(input.analysisRun);
    });
    transaction(bundle);
    return bundle;
  }

  listWorkspaces(): ReviewWorkspace[] {
    const rows = this.db
      .prepare('SELECT * FROM review_workspaces ORDER BY created_at DESC')
      .all() as ReviewWorkspaceRow[];
    return rows.map((row) => this.rowToWorkspace(row));
  }

  getWorkspace(reviewWorkspaceId: string): ReviewWorkspace | null {
    const row = this.db
      .prepare('SELECT * FROM review_workspaces WHERE review_workspace_id = ?')
      .get(reviewWorkspaceId) as ReviewWorkspaceRow | undefined;
    return row ? this.rowToWorkspace(row) : null;
  }

  saveWorkspace(workspace: ReviewWorkspace): ReviewWorkspace {
    this.insertWorkspace(workspace);
    return workspace;
  }

  getWorkspaceGraphInput(reviewWorkspaceId: string): WorkspaceGraphInput | null {
    const workspace = this.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return null;
    }
    const revision = this.getActiveRevision(reviewWorkspaceId);
    if (!revision) {
      return null;
    }
    const sourceSnapshot = this.getSourceSnapshotByRevision(revision.revisionId);
    if (!sourceSnapshot) {
      return null;
    }
    return { workspace, activeRevision: revision, sourceSnapshot };
  }

  getWorkspaceGraphRecord(
    reviewWorkspaceId: string,
    scopeKey: string,
  ): WorkspaceGraphRecord | null {
    const workspace = this.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return null;
    }
    const activeRevision = this.getActiveRevision(reviewWorkspaceId);
    if (!activeRevision) {
      return { workspace, activeRevision: null, analysis: null, graph: null, layout: null };
    }
    const analysis = this.getLatestAnalysisRun(activeRevision.revisionId, scopeKey);
    const graph = this.getGraphSnapshot(activeRevision.revisionId, scopeKey);
    const layout = graph ? this.getLayoutSnapshot(graph.graphSnapshotId) : null;
    return { workspace, activeRevision, analysis, graph, layout };
  }

  getActiveRevision(reviewWorkspaceId: string): RevisionContext | null {
    const row = this.db
      .prepare(
        'SELECT * FROM revision_contexts WHERE review_workspace_id = ? AND is_active = 1 LIMIT 1',
      )
      .get(reviewWorkspaceId) as RevisionContextRow | undefined;
    return row ? this.rowToRevision(row) : null;
  }

  getRevision(revisionId: string): RevisionContext | null {
    const row = this.db
      .prepare('SELECT * FROM revision_contexts WHERE revision_id = ?')
      .get(revisionId) as RevisionContextRow | undefined;
    return row ? this.rowToRevision(row) : null;
  }

  getSourceSnapshotByRevision(revisionId: string): ReviewSourceSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM review_source_snapshots WHERE revision_id = ?')
      .get(revisionId) as ReviewSourceSnapshotRow | undefined;
    return row ? this.rowToSourceSnapshot(row) : null;
  }

  getLatestAnalysisRun(revisionId: string, scopeKey: string): AnalysisRunSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM analysis_runs
          WHERE revision_id = ? AND scope_key = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(revisionId, scopeKey) as AnalysisRunRow | undefined;
    return row ? this.rowToAnalysisRun(row) : null;
  }

  saveAnalysisRun(run: AnalysisRunSnapshot): AnalysisRunSnapshot {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO analysis_runs (
            analysis_run_id, revision_id, scope_key, status, phase, progress_json,
            error_message, started_at, completed_at, created_at, updated_at
          ) VALUES (
            @analysis_run_id, @revision_id, @scope_key, @status, @phase, @progress_json,
            @error_message, @started_at, @completed_at, @created_at, @updated_at
          )
        `,
      )
      .run({
        analysis_run_id: run.analysisRunId,
        revision_id: run.revisionId,
        scope_key: run.scopeKey,
        status: run.status,
        phase: run.phase,
        progress_json: JSON.stringify(run.progress),
        error_message: run.errorMessage,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      });
    return run;
  }

  updateAnalysisRun(
    analysisRunId: string,
    patch: Partial<Pick<AnalysisRunSnapshot, 'status' | 'phase' | 'progress' | 'errorMessage'>>,
  ): AnalysisRunSnapshot | null {
    const current = this.getAnalysisRun(analysisRunId);
    if (!current) {
      return null;
    }
    const timestamp = nowIso();
    const next: AnalysisRunSnapshot = {
      ...current,
      ...patch,
      startedAt:
        current.startedAt ??
        (patch.status === 'running' || current.status === 'running' ? timestamp : null),
      completedAt:
        patch.status === 'completed' || patch.status === 'failed' ? timestamp : current.completedAt,
      updatedAt: timestamp,
    };
    return this.saveAnalysisRun(next);
  }

  getAnalysisRun(analysisRunId: string): AnalysisRunSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM analysis_runs WHERE analysis_run_id = ?')
      .get(analysisRunId) as AnalysisRunRow | undefined;
    return row ? this.rowToAnalysisRun(row) : null;
  }

  saveGraphAndLayout(graph: CodeGraphSnapshot, layout: LayoutSnapshot): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
            DELETE FROM layout_snapshots
            WHERE graph_snapshot_id IN (
              SELECT graph_snapshot_id FROM graph_snapshots
              WHERE revision_id = ? AND scope_key = ?
            )
          `,
        )
        .run(graph.revisionId, graph.scopeKey);
      this.db
        .prepare(
          `
            INSERT OR REPLACE INTO graph_snapshots (
              graph_snapshot_id, revision_id, scope_key, status, nodes_json, edges_json,
              limits_json, diagnostics_json, created_at, updated_at
            ) VALUES (
              @graph_snapshot_id, @revision_id, @scope_key, @status, @nodes_json, @edges_json,
              @limits_json, @diagnostics_json, @created_at, @updated_at
            )
          `,
        )
        .run({
          graph_snapshot_id: graph.graphSnapshotId,
          revision_id: graph.revisionId,
          scope_key: graph.scopeKey,
          status: graph.status,
          nodes_json: JSON.stringify(graph.nodes),
          edges_json: JSON.stringify(graph.edges),
          limits_json: JSON.stringify(graph.limits),
          diagnostics_json: JSON.stringify(graph.diagnostics),
          created_at: graph.createdAt,
          updated_at: graph.updatedAt,
        });
      this.db
        .prepare(
          `
            INSERT OR REPLACE INTO layout_snapshots (
              layout_snapshot_id, graph_snapshot_id, engine, positions_json, viewport_json,
              created_at, updated_at
            ) VALUES (
              @layout_snapshot_id, @graph_snapshot_id, @engine, @positions_json, @viewport_json,
              @created_at, @updated_at
            )
          `,
        )
        .run({
          layout_snapshot_id: layout.layoutSnapshotId,
          graph_snapshot_id: layout.graphSnapshotId,
          engine: layout.engine,
          positions_json: JSON.stringify(layout.positions),
          viewport_json: layout.viewport ? JSON.stringify(layout.viewport) : null,
          created_at: layout.createdAt,
          updated_at: layout.updatedAt,
        });
    });
    transaction();
  }

  getGraphSnapshot(revisionId: string, scopeKey: string): CodeGraphSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM graph_snapshots WHERE revision_id = ? AND scope_key = ?')
      .get(revisionId, scopeKey) as GraphSnapshotRow | undefined;
    return row ? this.rowToGraphSnapshot(row) : null;
  }

  getLayoutSnapshot(graphSnapshotId: string): LayoutSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM layout_snapshots WHERE graph_snapshot_id = ?')
      .get(graphSnapshotId) as LayoutSnapshotRow | undefined;
    return row ? this.rowToLayoutSnapshot(row) : null;
  }

  deleteWorkspaceBundle(reviewWorkspaceId: string): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
            DELETE FROM layout_snapshots
            WHERE graph_snapshot_id IN (
              SELECT graph_snapshot_id FROM graph_snapshots
              WHERE revision_id IN (
                SELECT revision_id FROM revision_contexts WHERE review_workspace_id = ?
              )
            )
          `,
        )
        .run(reviewWorkspaceId);
      this.db
        .prepare(
          `
            DELETE FROM graph_snapshots
            WHERE revision_id IN (
              SELECT revision_id FROM revision_contexts WHERE review_workspace_id = ?
            )
          `,
        )
        .run(reviewWorkspaceId);
      this.db
        .prepare(
          `
            DELETE FROM analysis_runs
            WHERE revision_id IN (
              SELECT revision_id FROM revision_contexts WHERE review_workspace_id = ?
            )
          `,
        )
        .run(reviewWorkspaceId);
      this.db
        .prepare(
          `
            DELETE FROM review_source_snapshots
            WHERE revision_id IN (
              SELECT revision_id FROM revision_contexts WHERE review_workspace_id = ?
            )
          `,
        )
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM revision_contexts WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM review_workspaces WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
    });
    transaction();
  }

  close(): void {
    this.db.close();
  }

  private insertWorkspace(workspace: ReviewWorkspace): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO review_workspaces (
            review_workspace_id, repository_profile_id, provider, review_url, review_id,
            title, base_sha, head_sha, source_branch_name, worktree_path,
            setup_status, status, created_at, updated_at
          ) VALUES (
            @review_workspace_id, @repository_profile_id, @provider, @review_url, @review_id,
            @title, @base_sha, @head_sha, @source_branch_name, @worktree_path,
            @setup_status, @status, @created_at, @updated_at
          )
        `,
      )
      .run({
        review_workspace_id: workspace.reviewWorkspaceId,
        repository_profile_id: workspace.repositoryProfileId,
        provider: workspace.provider,
        review_url: workspace.reviewUrl,
        review_id: workspace.reviewId,
        title: workspace.title,
        base_sha: workspace.baseSha,
        head_sha: workspace.headSha,
        source_branch_name: workspace.sourceBranchName,
        worktree_path: workspace.worktreePath,
        setup_status: workspace.setupStatus,
        status: workspace.status,
        created_at: workspace.createdAt,
        updated_at: workspace.updatedAt,
      });
  }

  private insertRevision(revision: RevisionContext): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO revision_contexts (
            revision_id, review_workspace_id, provider, review_id, base_sha, head_sha,
            start_sha, source_branch_name, diff_version, is_active, status, created_at, updated_at
          ) VALUES (
            @revision_id, @review_workspace_id, @provider, @review_id, @base_sha, @head_sha,
            @start_sha, @source_branch_name, @diff_version, @is_active, @status, @created_at, @updated_at
          )
        `,
      )
      .run({
        revision_id: revision.revisionId,
        review_workspace_id: revision.reviewWorkspaceId,
        provider: revision.provider,
        review_id: revision.reviewId,
        base_sha: revision.baseSha,
        head_sha: revision.headSha,
        start_sha: revision.startSha,
        source_branch_name: revision.sourceBranchName,
        diff_version: revision.diffVersion,
        is_active: revision.isActive ? 1 : 0,
        status: revision.status,
        created_at: revision.createdAt,
        updated_at: revision.updatedAt,
      });
  }

  private insertSourceSnapshot(snapshot: ReviewSourceSnapshot): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO review_source_snapshots (
            source_snapshot_id, revision_id, provider, review_id, title, description, base_sha,
            head_sha, start_sha, diff_version, changed_files_json, remote_threads_summary_json,
            created_at, updated_at
          ) VALUES (
            @source_snapshot_id, @revision_id, @provider, @review_id, @title, @description, @base_sha,
            @head_sha, @start_sha, @diff_version, @changed_files_json, @remote_threads_summary_json,
            @created_at, @updated_at
          )
        `,
      )
      .run({
        source_snapshot_id: snapshot.sourceSnapshotId,
        revision_id: snapshot.revisionId,
        provider: snapshot.provider,
        review_id: snapshot.reviewId,
        title: snapshot.title,
        description: snapshot.description,
        base_sha: snapshot.baseSha,
        head_sha: snapshot.headSha,
        start_sha: snapshot.startSha,
        diff_version: snapshot.diffVersion,
        changed_files_json: JSON.stringify(snapshot.changedFiles),
        remote_threads_summary_json: JSON.stringify(snapshot.remoteThreadsSummary),
        created_at: snapshot.createdAt,
        updated_at: snapshot.updatedAt,
      });
  }

  private rowToWorkspace(row: ReviewWorkspaceRow): ReviewWorkspace {
    return {
      reviewWorkspaceId: row.review_workspace_id,
      repositoryProfileId: row.repository_profile_id,
      provider: row.provider,
      reviewUrl: row.review_url,
      reviewId: row.review_id,
      title: row.title,
      baseSha: row.base_sha,
      headSha: row.head_sha,
      sourceBranchName: row.source_branch_name,
      worktreePath: row.worktree_path,
      setupStatus: row.setup_status,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToRevision(row: RevisionContextRow): RevisionContext {
    return {
      revisionId: row.revision_id,
      reviewWorkspaceId: row.review_workspace_id,
      provider: row.provider,
      reviewId: row.review_id,
      baseSha: row.base_sha,
      headSha: row.head_sha,
      startSha: row.start_sha,
      sourceBranchName: row.source_branch_name,
      diffVersion: row.diff_version,
      isActive: row.is_active === 1,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToSourceSnapshot(row: ReviewSourceSnapshotRow): ReviewSourceSnapshot {
    return {
      sourceSnapshotId: row.source_snapshot_id,
      revisionId: row.revision_id,
      provider: row.provider,
      reviewId: row.review_id,
      title: row.title,
      description: row.description,
      baseSha: row.base_sha,
      headSha: row.head_sha,
      startSha: row.start_sha,
      diffVersion: row.diff_version,
      changedFiles: parseJson(row.changed_files_json),
      remoteThreadsSummary: parseJson(row.remote_threads_summary_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToAnalysisRun(row: AnalysisRunRow): AnalysisRunSnapshot {
    return {
      analysisRunId: row.analysis_run_id,
      revisionId: row.revision_id,
      scopeKey: row.scope_key,
      status: row.status,
      phase: row.phase,
      progress: parseJson(row.progress_json),
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToGraphSnapshot(row: GraphSnapshotRow): CodeGraphSnapshot {
    return {
      graphSnapshotId: row.graph_snapshot_id,
      revisionId: row.revision_id,
      scopeKey: row.scope_key,
      status: row.status,
      nodes: parseJson(row.nodes_json),
      edges: parseJson(row.edges_json),
      limits: parseJson(row.limits_json),
      diagnostics: parseJson<GraphDiagnostic[]>(row.diagnostics_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToLayoutSnapshot(row: LayoutSnapshotRow): LayoutSnapshot {
    return {
      layoutSnapshotId: row.layout_snapshot_id,
      graphSnapshotId: row.graph_snapshot_id,
      engine: row.engine,
      positions: parseJson<Record<string, GraphNodeLayout>>(row.positions_json),
      viewport: row.viewport_json
        ? parseJson<GraphRenderSnapshot['viewport']>(row.viewport_json)
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_workspaces (
        review_workspace_id TEXT PRIMARY KEY,
        repository_profile_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        review_url TEXT NOT NULL,
        review_id TEXT NOT NULL,
        title TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        source_branch_name TEXT,
        worktree_path TEXT NOT NULL,
        setup_status TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS revision_contexts (
        revision_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        review_id TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        start_sha TEXT,
        source_branch_name TEXT,
        diff_version TEXT,
        is_active INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_revision_contexts_workspace_active
        ON revision_contexts(review_workspace_id, is_active);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_contexts_one_active
        ON revision_contexts(review_workspace_id)
        WHERE is_active = 1;

      CREATE TABLE IF NOT EXISTS review_source_snapshots (
        source_snapshot_id TEXT PRIMARY KEY,
        revision_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        review_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        start_sha TEXT,
        diff_version TEXT,
        changed_files_json TEXT NOT NULL,
        remote_threads_summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_source_snapshots_revision
        ON review_source_snapshots(revision_id);

      CREATE TABLE IF NOT EXISTS analysis_runs (
        analysis_run_id TEXT PRIMARY KEY,
        revision_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analysis_runs_revision_scope
        ON analysis_runs(revision_id, scope_key);

      CREATE TABLE IF NOT EXISTS graph_snapshots (
        graph_snapshot_id TEXT PRIMARY KEY,
        revision_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        status TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        edges_json TEXT NOT NULL,
        limits_json TEXT NOT NULL,
        diagnostics_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_snapshots_revision_scope
        ON graph_snapshots(revision_id, scope_key);

      CREATE TABLE IF NOT EXISTS layout_snapshots (
        layout_snapshot_id TEXT PRIMARY KEY,
        graph_snapshot_id TEXT NOT NULL,
        engine TEXT NOT NULL,
        positions_json TEXT NOT NULL,
        viewport_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_layout_snapshots_graph
        ON layout_snapshots(graph_snapshot_id);
    `);
  }
}
