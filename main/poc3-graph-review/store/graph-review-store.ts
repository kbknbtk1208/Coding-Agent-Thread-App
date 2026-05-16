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
import type { GraphLayerApplicationSnapshot } from '../../../shared/poc3-domain/layer-profile';
import type { Poc3PublishedCommentRecord } from '../../../shared/poc3-domain/comment-publish';
import type { RevisionContext } from '../../../shared/poc3-domain/revision';
import type {
  RevisionCommit,
  RevisionCommitRole,
  RevisionCommitView,
  RevisionRefreshSnapshot,
} from '../../../shared/poc3-domain/revision-commit';
import type {
  ReviewSourceDiagnostic,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
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
  remote_threads_json: string | null;
  diagnostics_json: string;
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
  companion_files_json: string | null;
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

interface GraphLayerApplicationRow {
  graph_layer_application_id: string;
  graph_snapshot_id: string;
  layer_profile_id: string;
  profile_version: number;
  positions_json: string;
  lanes_json: string;
  groups_json: string;
  node_classifications_json: string;
  edge_classifications_json: string;
  diagnostics_json: string;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

interface RevisionCommitRow {
  revision_commit_id: string;
  review_workspace_id: string;
  provider: ReviewProviderKind;
  review_id: string;
  sha: string;
  short_sha: string;
  message: string;
  author_json: string;
  authored_at: string | null;
  committed_at: string | null;
  parents_json: string;
  refs_json: string;
  url: string | null;
  created_at: string;
  updated_at: string;
}

interface RevisionCommitLinkRow {
  revision_id: string;
  sha: string;
  role: RevisionCommitRole;
  created_at: string;
}

interface RevisionRefreshRunRow {
  refresh_id: string;
  review_workspace_id: string;
  status: RevisionRefreshSnapshot['status'];
  previous_head_sha: string | null;
  latest_head_sha: string | null;
  created_revision_id: string | null;
  message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface InitialWorkspaceBundle {
  workspace: ReviewWorkspace;
  revision: RevisionContext;
  sourceSnapshot: ReviewSourceSnapshot;
  analysisRun: AnalysisRunSnapshot;
  commits?: RevisionCommit[];
}

export interface RevisionBundleInput {
  workspace: ReviewWorkspace;
  previousActiveRevisionId: string | null;
  revision: RevisionContext;
  sourceSnapshot: ReviewSourceSnapshot;
  analysisRun: AnalysisRunSnapshot | null;
  commits: RevisionCommit[];
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

function parseJsonOrNull<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

const SOURCE_DIAGNOSTIC_CODES = new Set([
  'CHANGED_FILES_LIMIT_EXCEEDED',
  'DIFF_TRUNCATED',
  'REMOTE_COMMENTS_FETCH_FAILED',
  'GITHUB_REVIEW_THREAD_STATE_FETCH_FAILED',
  'GITLAB_DIFFS_ENDPOINT_UNAVAILABLE',
  'GITLAB_CHANGES_FALLBACK_USED',
  'GITLAB_CHANGES_OVERFLOW',
  'GITLAB_RAW_DIFFS_FALLBACK_USED',
  'GITLAB_RAW_DIFFS_PARTIAL_METADATA',
  'GITLAB_DIFF_REFS_FALLBACK_USED',
  'GITLAB_DIFF_REFS_INCOMPLETE',
]);

function sourceDiagnosticToGraphDiagnostic(diagnostic: ReviewSourceDiagnostic): GraphDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    filePath: diagnostic.filePath ?? null,
  };
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
      if (input.commits) {
        this.saveRevisionCommits({
          reviewWorkspaceId: input.workspace.reviewWorkspaceId,
          provider: input.workspace.provider,
          reviewId: input.workspace.reviewId,
          revisionId: input.revision.revisionId,
          activeHeadSha: input.revision.headSha,
          commits: input.commits,
        });
      }
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

  listRevisions(reviewWorkspaceId: string): RevisionContext[] {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM revision_contexts
          WHERE review_workspace_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(reviewWorkspaceId) as RevisionContextRow[];
    return rows.map((row) => this.rowToRevision(row));
  }

  getRevisionByIdentity(input: {
    reviewWorkspaceId: string;
    provider: ReviewProviderKind;
    reviewId: string;
    baseSha: string;
    startSha: string | null;
    headSha: string;
    diffVersion: string | null;
  }): RevisionContext | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM revision_contexts
          WHERE review_workspace_id = ?
            AND provider = ?
            AND review_id = ?
            AND base_sha = ?
            AND COALESCE(start_sha, '') = COALESCE(?, '')
            AND head_sha = ?
            AND COALESCE(diff_version, '') = COALESCE(?, '')
          LIMIT 1
        `,
      )
      .get(
        input.reviewWorkspaceId,
        input.provider,
        input.reviewId,
        input.baseSha,
        input.startSha,
        input.headSha,
        input.diffVersion,
      ) as RevisionContextRow | undefined;
    return row ? this.rowToRevision(row) : null;
  }

  saveRevisionBundle(input: RevisionBundleInput): void {
    const transaction = this.db.transaction((bundle: RevisionBundleInput) => {
      if (bundle.previousActiveRevisionId) {
        this.db
          .prepare(
            `
              UPDATE revision_contexts
              SET is_active = 0, status = ?, updated_at = ?
              WHERE revision_id = ?
            `,
          )
          .run('stale', nowIso(), bundle.previousActiveRevisionId);
      }
      this.insertWorkspace(bundle.workspace);
      this.insertRevision(bundle.revision);
      this.insertSourceSnapshot(bundle.sourceSnapshot);
      if (bundle.analysisRun) {
        this.saveAnalysisRun(bundle.analysisRun);
      }
      this.saveRevisionCommits({
        reviewWorkspaceId: bundle.workspace.reviewWorkspaceId,
        provider: bundle.workspace.provider,
        reviewId: bundle.workspace.reviewId,
        revisionId: bundle.revision.revisionId,
        activeHeadSha: bundle.revision.headSha,
        commits: bundle.commits,
      });
    });
    transaction(input);
  }

  setActiveRevision(reviewWorkspaceId: string, revisionId: string): void {
    const timestamp = nowIso();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
            UPDATE revision_contexts
            SET is_active = 0,
                status = CASE WHEN status = 'active' THEN 'stale' ELSE status END,
                updated_at = ?
            WHERE review_workspace_id = ?
          `,
        )
        .run(timestamp, reviewWorkspaceId);
      this.db
        .prepare(
          `
            UPDATE revision_contexts
            SET is_active = 1, status = 'active', updated_at = ?
            WHERE review_workspace_id = ? AND revision_id = ?
          `,
        )
        .run(timestamp, reviewWorkspaceId, revisionId);
    });
    transaction();
  }

  markRevisionsOrphaned(input: { reviewWorkspaceId: string; missingHeadShas: string[] }): void {
    if (input.missingHeadShas.length === 0) {
      return;
    }
    const timestamp = nowIso();
    const update = this.db.prepare(
      `
        UPDATE revision_contexts
        SET status = 'orphaned', updated_at = ?
        WHERE review_workspace_id = ? AND head_sha = ? AND is_active = 0
      `,
    );
    const transaction = this.db.transaction((headShas: string[]) => {
      for (const headSha of headShas) {
        update.run(timestamp, input.reviewWorkspaceId, headSha);
      }
    });
    transaction(input.missingHeadShas);
  }

  saveRevisionCommits(input: {
    reviewWorkspaceId: string;
    provider: ReviewProviderKind;
    reviewId: string;
    revisionId: string;
    activeHeadSha: string;
    commits: RevisionCommit[];
  }): void {
    const timestamp = nowIso();
    const transaction = this.db.transaction(() => {
      for (const commit of input.commits) {
        this.db
          .prepare(
            `
              INSERT OR REPLACE INTO revision_commits (
                revision_commit_id, review_workspace_id, provider, review_id, sha, short_sha,
                message, author_json, authored_at, committed_at, parents_json, refs_json, url,
                created_at, updated_at
              ) VALUES (
                @revision_commit_id, @review_workspace_id, @provider, @review_id, @sha, @short_sha,
                @message, @author_json, @authored_at, @committed_at, @parents_json, @refs_json, @url,
                COALESCE((SELECT created_at FROM revision_commits WHERE review_workspace_id = @review_workspace_id AND sha = @sha), @created_at),
                @updated_at
              )
            `,
          )
          .run({
            revision_commit_id: `${input.reviewWorkspaceId}:${commit.sha}`,
            review_workspace_id: input.reviewWorkspaceId,
            provider: input.provider,
            review_id: input.reviewId,
            sha: commit.sha,
            short_sha: commit.shortSha,
            message: commit.message,
            author_json: JSON.stringify(commit.author),
            authored_at: commit.authoredAt,
            committed_at: commit.committedAt,
            parents_json: JSON.stringify(commit.parents),
            refs_json: JSON.stringify(commit.refs),
            url: commit.url,
            created_at: timestamp,
            updated_at: timestamp,
          });

        const role: RevisionCommitRole =
          commit.sha === input.activeHeadSha
            ? 'head'
            : commit.sha === input.activeHeadSha.slice(0, commit.sha.length)
              ? 'head'
              : 'included';
        this.db
          .prepare(
            `
              INSERT OR REPLACE INTO revision_commit_links (revision_id, sha, role, created_at)
              VALUES (?, ?, ?, ?)
            `,
          )
          .run(input.revisionId, commit.sha, role, timestamp);
      }
    });
    transaction();
  }

  getRevisionCommitView(reviewWorkspaceId: string): RevisionCommitView[] {
    const active = this.getActiveRevision(reviewWorkspaceId);
    const rows = this.db
      .prepare(
        `
          SELECT * FROM revision_commits
          WHERE review_workspace_id = ?
          ORDER BY COALESCE(committed_at, authored_at, created_at) DESC
        `,
      )
      .all(reviewWorkspaceId) as RevisionCommitRow[];
    const links = active
      ? ((this.db
          .prepare('SELECT * FROM revision_commit_links WHERE revision_id = ?')
          .all(active.revisionId) as RevisionCommitLinkRow[]) ?? [])
      : [];
    const linkBySha = new Map(links.map((link) => [link.sha, link]));
    return rows.map((row) => {
      const commit = this.rowToRevisionCommit(row);
      const link = linkBySha.get(commit.sha);
      const role: RevisionCommitRole =
        active && commit.sha === active.headSha
          ? 'active'
          : link?.role === 'head'
            ? 'head'
            : (link?.role ?? 'orphaned');
      return {
        ...commit,
        role,
        revisionId: link?.revision_id ?? null,
      };
    });
  }

  saveRevisionRefreshRun(snapshot: RevisionRefreshSnapshot): RevisionRefreshSnapshot {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO revision_refresh_runs (
            refresh_id, review_workspace_id, status, previous_head_sha, latest_head_sha,
            created_revision_id, message, started_at, completed_at
          ) VALUES (
            @refresh_id, @review_workspace_id, @status, @previous_head_sha, @latest_head_sha,
            @created_revision_id, @message, @started_at, @completed_at
          )
        `,
      )
      .run({
        refresh_id: snapshot.refreshId,
        review_workspace_id: snapshot.reviewWorkspaceId,
        status: snapshot.status,
        previous_head_sha: snapshot.previousHeadSha,
        latest_head_sha: snapshot.latestHeadSha,
        created_revision_id: snapshot.createdRevisionId,
        message: snapshot.message,
        started_at: snapshot.startedAt,
        completed_at: snapshot.completedAt,
      });
    return snapshot;
  }

  getLatestRevisionRefreshRun(reviewWorkspaceId: string): RevisionRefreshSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM revision_refresh_runs
          WHERE review_workspace_id = ?
          ORDER BY started_at DESC
          LIMIT 1
        `,
      )
      .get(reviewWorkspaceId) as RevisionRefreshRunRow | undefined;
    return row ? this.rowToRevisionRefreshRun(row) : null;
  }

  getSourceSnapshotByRevision(revisionId: string): ReviewSourceSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM review_source_snapshots WHERE revision_id = ?')
      .get(revisionId) as ReviewSourceSnapshotRow | undefined;
    return row ? this.rowToSourceSnapshot(row) : null;
  }

  updateRemoteThreadResolved(input: {
    revisionId: string;
    providerThreadId: string;
    isResolved: boolean;
    updatedAt: string;
  }): ReviewSourceSnapshot | null {
    return this.updateRemoteThreadsResolved({
      revisionId: input.revisionId,
      providerThreadIds: [input.providerThreadId],
      isResolved: input.isResolved,
      updatedAt: input.updatedAt,
    });
  }

  updateRemoteThreadsResolved(input: {
    revisionId: string;
    providerThreadIds: string[];
    isResolved: boolean;
    updatedAt: string;
  }): ReviewSourceSnapshot | null {
    const current = this.getSourceSnapshotByRevision(input.revisionId);
    if (!current) {
      return null;
    }
    const targetIds = new Set(input.providerThreadIds);
    let changed = false;
    const next: ReviewSourceSnapshot = {
      ...current,
      remoteThreads: current.remoteThreads.map((thread) => {
        if (!targetIds.has(thread.providerThreadId)) return thread;
        changed = true;
        return { ...thread, isResolved: input.isResolved };
      }),
      remoteThreadsSummary: current.remoteThreadsSummary.map((thread) =>
        targetIds.has(thread.providerThreadId)
          ? { ...thread, isResolved: input.isResolved }
          : thread,
      ),
      updatedAt: input.updatedAt,
    };
    if (!changed) {
      return null;
    }
    this.insertSourceSnapshot(next);
    return next;
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
            DELETE FROM graph_layer_applications
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
              companion_files_json, limits_json, diagnostics_json, created_at, updated_at
            ) VALUES (
              @graph_snapshot_id, @revision_id, @scope_key, @status, @nodes_json, @edges_json,
              @companion_files_json, @limits_json, @diagnostics_json, @created_at, @updated_at
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
          companion_files_json: JSON.stringify(graph.companionFiles ?? []),
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

  saveGraphLayerApplication(
    application: GraphLayerApplicationSnapshot,
  ): GraphLayerApplicationSnapshot {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO graph_layer_applications (
            graph_layer_application_id, graph_snapshot_id, layer_profile_id, profile_version,
            positions_json, lanes_json, groups_json, node_classifications_json,
            edge_classifications_json, diagnostics_json, applied_at, created_at, updated_at
          ) VALUES (
            @graph_layer_application_id, @graph_snapshot_id, @layer_profile_id, @profile_version,
            @positions_json, @lanes_json, @groups_json, @node_classifications_json,
            @edge_classifications_json, @diagnostics_json, @applied_at, @created_at, @updated_at
          )
        `,
      )
      .run({
        graph_layer_application_id: application.graphLayerApplicationId,
        graph_snapshot_id: application.graphSnapshotId,
        layer_profile_id: application.layerProfileId,
        profile_version: application.profileVersion,
        positions_json: JSON.stringify(application.positions),
        lanes_json: JSON.stringify(application.lanes),
        groups_json: JSON.stringify(application.groups),
        node_classifications_json: JSON.stringify(application.nodeClassifications),
        edge_classifications_json: JSON.stringify(application.edgeClassifications),
        diagnostics_json: JSON.stringify(application.diagnostics),
        applied_at: application.appliedAt,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      });
    return application;
  }

  getGraphLayerApplication(input: {
    graphSnapshotId: string;
    layerProfileId: string;
    profileVersion: number;
  }): GraphLayerApplicationSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM graph_layer_applications
          WHERE graph_snapshot_id = ?
            AND layer_profile_id = ?
            AND profile_version = ?
          LIMIT 1
        `,
      )
      .get(input.graphSnapshotId, input.layerProfileId, input.profileVersion) as
      | GraphLayerApplicationRow
      | undefined;
    return row ? this.rowToGraphLayerApplication(row) : null;
  }

  getLatestGraphLayerApplication(input: {
    graphSnapshotId: string;
    layerProfileId: string;
  }): GraphLayerApplicationSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM graph_layer_applications
          WHERE graph_snapshot_id = ?
            AND layer_profile_id = ?
          ORDER BY profile_version DESC, updated_at DESC
          LIMIT 1
        `,
      )
      .get(input.graphSnapshotId, input.layerProfileId) as GraphLayerApplicationRow | undefined;
    return row ? this.rowToGraphLayerApplication(row) : null;
  }

  getGraphSnapshot(revisionId: string, scopeKey: string): CodeGraphSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM graph_snapshots WHERE revision_id = ? AND scope_key = ?')
      .get(revisionId, scopeKey) as GraphSnapshotRow | undefined;
    return row ? this.rowToGraphSnapshot(row) : null;
  }

  replaceGraphSourceDiagnostics(
    revisionId: string,
    diagnostics: ReviewSourceDiagnostic[],
    updatedAt = nowIso(),
  ): void {
    const rows = this.db
      .prepare('SELECT * FROM graph_snapshots WHERE revision_id = ?')
      .all(revisionId) as GraphSnapshotRow[];
    const sourceDiagnostics = diagnostics.map(sourceDiagnosticToGraphDiagnostic);
    const update = this.db.prepare(
      'UPDATE graph_snapshots SET diagnostics_json = ?, updated_at = ? WHERE graph_snapshot_id = ?',
    );
    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        const graphDiagnostics = parseJson<GraphDiagnostic[]>(row.diagnostics_json);
        const nextDiagnostics = [
          ...sourceDiagnostics,
          ...graphDiagnostics.filter((diagnostic) => !SOURCE_DIAGNOSTIC_CODES.has(diagnostic.code)),
        ];
        update.run(JSON.stringify(nextDiagnostics), updatedAt, row.graph_snapshot_id);
      }
    });
    transaction();
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
            DELETE FROM graph_layer_applications
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
        .prepare(
          `
            DELETE FROM revision_commit_links
            WHERE revision_id NOT IN (SELECT revision_id FROM revision_contexts)
          `,
        )
        .run();
      this.db
        .prepare('DELETE FROM revision_refresh_runs WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM revision_commits WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM review_workspaces WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
    });
    transaction();
  }

  savePublishedCommentRecord(record: Poc3PublishedCommentRecord): Poc3PublishedCommentRecord {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO published_comment_records (
            local_publish_id, review_workspace_id, revision_id, source_kind, source_id,
            provider_thread_id, provider_comment_ids_json, body, anchor_json, created_at
          ) VALUES (
            @local_publish_id, @review_workspace_id, @revision_id, @source_kind, @source_id,
            @provider_thread_id, @provider_comment_ids_json, @body, @anchor_json, @created_at
          )
        `,
      )
      .run({
        local_publish_id: record.localPublishId,
        review_workspace_id: record.reviewWorkspaceId,
        revision_id: record.revisionId,
        source_kind: record.source.kind,
        source_id:
          'localThreadId' in record.source
            ? (record.source.localThreadId ?? null)
            : 'providerThreadId' in record.source && record.source.kind === 'remote-thread'
              ? (record.source as { kind: string; providerThreadId: string }).providerThreadId
              : null,
        provider_thread_id: record.providerThreadId,
        provider_comment_ids_json: JSON.stringify(record.providerCommentIds),
        body: record.body,
        anchor_json: record.anchor ? JSON.stringify(record.anchor) : null,
        created_at: record.createdAt,
      });
    return record;
  }

  listPublishedCommentRecords(input: {
    reviewWorkspaceId: string;
    revisionId: string;
  }): Poc3PublishedCommentRecord[] {
    interface PublishedCommentRow {
      local_publish_id: string;
      review_workspace_id: string;
      revision_id: string;
      source_kind: string;
      source_id: string | null;
      provider_thread_id: string;
      provider_comment_ids_json: string;
      body: string;
      anchor_json: string | null;
      created_at: string;
    }
    const rows = this.db
      .prepare(
        `
          SELECT * FROM published_comment_records
          WHERE review_workspace_id = ? AND revision_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(input.reviewWorkspaceId, input.revisionId) as PublishedCommentRow[];

    return rows.map((row) => ({
      localPublishId: row.local_publish_id,
      reviewWorkspaceId: row.review_workspace_id,
      revisionId: row.revision_id,
      source: {
        kind: row.source_kind as Poc3PublishedCommentRecord['source']['kind'],
        ...(row.source_id ? { localThreadId: row.source_id } : {}),
      } as Poc3PublishedCommentRecord['source'],
      providerThreadId: row.provider_thread_id,
      providerCommentIds: parseJson<string[]>(row.provider_comment_ids_json),
      body: row.body,
      anchor: row.anchor_json ? parseJson(row.anchor_json) : null,
      createdAt: row.created_at,
    }));
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

  saveSourceSnapshot(snapshot: ReviewSourceSnapshot): ReviewSourceSnapshot {
    this.insertSourceSnapshot(snapshot);
    return snapshot;
  }

  private insertSourceSnapshot(snapshot: ReviewSourceSnapshot): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO review_source_snapshots (
            source_snapshot_id, revision_id, provider, review_id, title, description, base_sha,
            head_sha, start_sha, diff_version, changed_files_json, remote_threads_summary_json,
            remote_threads_json, diagnostics_json, created_at, updated_at
          ) VALUES (
            @source_snapshot_id, @revision_id, @provider, @review_id, @title, @description, @base_sha,
            @head_sha, @start_sha, @diff_version, @changed_files_json, @remote_threads_summary_json,
            @remote_threads_json, @diagnostics_json, @created_at, @updated_at
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
        remote_threads_json: JSON.stringify(snapshot.remoteThreads ?? []),
        diagnostics_json: JSON.stringify(snapshot.diagnostics ?? []),
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
      remoteThreads: parseJson(row.remote_threads_json ?? '[]'),
      remoteThreadsSummary: parseJson(row.remote_threads_summary_json),
      diagnostics: parseJson(row.diagnostics_json ?? '[]'),
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
      companionFiles: parseJson(row.companion_files_json ?? '[]'),
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

  private rowToGraphLayerApplication(
    row: GraphLayerApplicationRow,
  ): GraphLayerApplicationSnapshot | null {
    const positions = parseJsonOrNull<GraphLayerApplicationSnapshot['positions']>(
      row.positions_json,
    );
    const lanes = parseJsonOrNull<GraphLayerApplicationSnapshot['lanes']>(row.lanes_json);
    const groups = parseJsonOrNull<GraphLayerApplicationSnapshot['groups']>(row.groups_json);
    const nodeClassifications = parseJsonOrNull<
      GraphLayerApplicationSnapshot['nodeClassifications']
    >(row.node_classifications_json);
    const edgeClassifications = parseJsonOrNull<
      GraphLayerApplicationSnapshot['edgeClassifications']
    >(row.edge_classifications_json);
    const diagnostics = parseJsonOrNull<GraphLayerApplicationSnapshot['diagnostics']>(
      row.diagnostics_json,
    );
    if (
      !positions ||
      !lanes ||
      !groups ||
      !nodeClassifications ||
      !edgeClassifications ||
      !diagnostics
    ) {
      return null;
    }
    return {
      graphLayerApplicationId: row.graph_layer_application_id,
      graphSnapshotId: row.graph_snapshot_id,
      layerProfileId: row.layer_profile_id,
      profileVersion: row.profile_version,
      positions,
      lanes,
      groups,
      nodeClassifications,
      edgeClassifications,
      diagnostics,
      appliedAt: row.applied_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToRevisionCommit(row: RevisionCommitRow): RevisionCommit {
    return {
      sha: row.sha,
      shortSha: row.short_sha,
      message: row.message,
      author: parseJson(row.author_json),
      authoredAt: row.authored_at,
      committedAt: row.committed_at,
      parents: parseJson(row.parents_json),
      refs: parseJson(row.refs_json),
      url: row.url,
    };
  }

  private rowToRevisionRefreshRun(row: RevisionRefreshRunRow): RevisionRefreshSnapshot {
    return {
      refreshId: row.refresh_id,
      reviewWorkspaceId: row.review_workspace_id,
      status: row.status,
      previousHeadSha: row.previous_head_sha,
      latestHeadSha: row.latest_head_sha,
      createdRevisionId: row.created_revision_id,
      message: row.message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
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
        remote_threads_json TEXT NOT NULL DEFAULT '[]',
        diagnostics_json TEXT NOT NULL DEFAULT '[]',
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
        companion_files_json TEXT NOT NULL DEFAULT '[]',
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

      CREATE TABLE IF NOT EXISTS graph_layer_applications (
        graph_layer_application_id TEXT PRIMARY KEY,
        graph_snapshot_id TEXT NOT NULL,
        layer_profile_id TEXT NOT NULL,
        profile_version INTEGER NOT NULL,
        positions_json TEXT NOT NULL,
        lanes_json TEXT NOT NULL,
        groups_json TEXT NOT NULL,
        node_classifications_json TEXT NOT NULL,
        edge_classifications_json TEXT NOT NULL,
        diagnostics_json TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_layer_applications_graph_profile_version
        ON graph_layer_applications(graph_snapshot_id, layer_profile_id, profile_version);

      CREATE INDEX IF NOT EXISTS idx_graph_layer_applications_profile
        ON graph_layer_applications(layer_profile_id, profile_version);

      CREATE TABLE IF NOT EXISTS repository_layer_profiles (
        layer_profile_id TEXT PRIMARY KEY,
        repository_profile_id TEXT NOT NULL,
        repository_identity_key TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        profile_version INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        layout_direction TEXT NOT NULL,
        dependency_direction TEXT NOT NULL,
        layout_strategy TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        ignored_patterns_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_applied_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_repository_layer_profiles_profile
        ON repository_layer_profiles(repository_profile_id);

      CREATE INDEX IF NOT EXISTS idx_repository_layer_profiles_identity
        ON repository_layer_profiles(repository_identity_key, updated_at);

      CREATE TABLE IF NOT EXISTS revision_commits (
        revision_commit_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        review_id TEXT NOT NULL,
        sha TEXT NOT NULL,
        short_sha TEXT NOT NULL,
        message TEXT NOT NULL,
        author_json TEXT NOT NULL,
        authored_at TEXT,
        committed_at TEXT,
        parents_json TEXT NOT NULL,
        refs_json TEXT NOT NULL,
        url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_commits_workspace_sha
        ON revision_commits(review_workspace_id, sha);

      CREATE TABLE IF NOT EXISTS revision_commit_links (
        revision_id TEXT NOT NULL,
        sha TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (revision_id, sha, role)
      );

      CREATE INDEX IF NOT EXISTS idx_revision_commit_links_revision
        ON revision_commit_links(revision_id);

      CREATE TABLE IF NOT EXISTS revision_refresh_runs (
        refresh_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        previous_head_sha TEXT,
        latest_head_sha TEXT,
        created_revision_id TEXT,
        message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_revision_refresh_runs_workspace
        ON revision_refresh_runs(review_workspace_id, started_at);

      CREATE TABLE IF NOT EXISTS published_comment_records (
        local_publish_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_id TEXT,
        provider_thread_id TEXT NOT NULL,
        provider_comment_ids_json TEXT NOT NULL,
        body TEXT NOT NULL,
        anchor_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_published_comment_records_source
        ON published_comment_records(review_workspace_id, revision_id, source_kind, source_id);
    `);
    try {
      this.db.exec(`ALTER TABLE review_source_snapshots ADD COLUMN remote_threads_json TEXT`);
    } catch {
      // column already exists
    }
    try {
      this.db.exec(
        `ALTER TABLE review_source_snapshots ADD COLUMN diagnostics_json TEXT NOT NULL DEFAULT '[]'`,
      );
    } catch {
      // column already exists
    }
    try {
      this.db.exec(`ALTER TABLE graph_snapshots ADD COLUMN companion_files_json TEXT DEFAULT '[]'`);
    } catch {
      // column already exists
    }
  }
}
