import path from 'path';
import Database from 'better-sqlite3';
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

export class ReviewWorkspaceStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  save(workspace: ReviewWorkspace): ReviewWorkspace {
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
    return workspace;
  }

  list(): ReviewWorkspace[] {
    const rows = this.db
      .prepare('SELECT * FROM review_workspaces ORDER BY created_at DESC')
      .all() as ReviewWorkspaceRow[];
    return rows.map((row) => this.rowToWorkspace(row));
  }

  close(): void {
    this.db.close();
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
    `);
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
}
