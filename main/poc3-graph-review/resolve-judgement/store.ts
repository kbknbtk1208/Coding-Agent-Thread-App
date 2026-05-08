import path from 'path';
import Database from 'better-sqlite3';
import type {
  ResolveJudgementCommentKey,
  ResolveJudgementResult,
  ResolveJudgementRun,
} from '../../../shared/poc3-domain/resolve-judgement';

interface ResolveJudgementRunRow {
  run_id: string;
  review_workspace_id: string;
  revision_id: string;
  scope_key: string;
  agent: ResolveJudgementRun['agent'];
  status: ResolveJudgementRun['status'];
  target_count: number;
  root_app_session_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ResolveJudgementResultRow {
  review_workspace_id: string;
  revision_id: string;
  comment_type: ResolveJudgementCommentKey['commentType'];
  comment_id: string;
  run_id: string;
  decision: ResolveJudgementResult['decision'];
  reason_markdown: string;
  evidence_json: string;
  checked_at: string;
}

export class ResolveJudgementStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  saveRun(run: ResolveJudgementRun): ResolveJudgementRun {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO resolve_judgement_runs (
            run_id, review_workspace_id, revision_id, scope_key, agent, status,
            target_count, root_app_session_id, error_message, created_at, completed_at
          ) VALUES (
            @run_id, @review_workspace_id, @revision_id, @scope_key, @agent, @status,
            @target_count, @root_app_session_id, @error_message, @created_at, @completed_at
          )
        `,
      )
      .run({
        run_id: run.runId,
        review_workspace_id: run.reviewWorkspaceId,
        revision_id: run.revisionId,
        scope_key: run.scopeKey,
        agent: run.agent,
        status: run.status,
        target_count: run.targetCount,
        root_app_session_id: run.rootAppSessionId,
        error_message: run.errorMessage,
        created_at: run.createdAt,
        completed_at: run.completedAt,
      });
    return run;
  }

  getRun(runId: string): ResolveJudgementRun | null {
    const row = this.db
      .prepare('SELECT * FROM resolve_judgement_runs WHERE run_id = ?')
      .get(runId) as ResolveJudgementRunRow | undefined;
    return row ? this.rowToRun(row) : null;
  }

  findRunningRun(input: {
    reviewWorkspaceId: string;
    revisionId: string;
  }): ResolveJudgementRun | null {
    const row = this.db
      .prepare(
        `
          SELECT * FROM resolve_judgement_runs
          WHERE review_workspace_id = ? AND revision_id = ?
            AND status IN ('starting', 'running')
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(input.reviewWorkspaceId, input.revisionId) as ResolveJudgementRunRow | undefined;
    return row ? this.rowToRun(row) : null;
  }

  saveResults(results: ResolveJudgementResult[]): void {
    const statement = this.db.prepare(
      `
        INSERT OR REPLACE INTO resolve_judgement_results (
          review_workspace_id, revision_id, comment_type, comment_id, run_id,
          decision, reason_markdown, evidence_json, checked_at
        ) VALUES (
          @review_workspace_id, @revision_id, @comment_type, @comment_id, @run_id,
          @decision, @reason_markdown, @evidence_json, @checked_at
        )
      `,
    );
    const transaction = this.db.transaction((items: ResolveJudgementResult[]) => {
      for (const item of items) {
        statement.run({
          review_workspace_id: item.key.reviewWorkspaceId,
          revision_id: item.key.revisionId,
          comment_type: item.key.commentType,
          comment_id: item.key.commentId,
          run_id: item.runId,
          decision: item.decision,
          reason_markdown: item.reasonMarkdown,
          evidence_json: JSON.stringify(item.evidence),
          checked_at: item.checkedAt,
        });
      }
    });
    transaction(results);
  }

  listResults(input: { reviewWorkspaceId: string; revisionId: string }): ResolveJudgementResult[] {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM resolve_judgement_results
          WHERE review_workspace_id = ? AND revision_id = ?
        `,
      )
      .all(input.reviewWorkspaceId, input.revisionId) as ResolveJudgementResultRow[];
    return rows.map((row) => this.rowToResult(row));
  }

  deleteWorkspace(reviewWorkspaceId: string): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM resolve_judgement_runs WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM resolve_judgement_results WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
    });
    transaction();
  }

  close(): void {
    this.db.close();
  }

  private rowToRun(row: ResolveJudgementRunRow): ResolveJudgementRun {
    return {
      runId: row.run_id,
      reviewWorkspaceId: row.review_workspace_id,
      revisionId: row.revision_id,
      scopeKey: row.scope_key,
      agent: row.agent,
      status: row.status,
      targetCount: row.target_count,
      rootAppSessionId: row.root_app_session_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  private rowToResult(row: ResolveJudgementResultRow): ResolveJudgementResult {
    let evidence: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.evidence_json);
      if (Array.isArray(parsed)) {
        evidence = parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      evidence = [];
    }
    return {
      key: {
        reviewWorkspaceId: row.review_workspace_id,
        revisionId: row.revision_id,
        commentType: row.comment_type,
        commentId: row.comment_id,
      },
      runId: row.run_id,
      decision: row.decision,
      reasonMarkdown: row.reason_markdown,
      evidence,
      checkedAt: row.checked_at,
    };
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resolve_judgement_runs (
        run_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        agent TEXT NOT NULL,
        status TEXT NOT NULL,
        target_count INTEGER NOT NULL,
        root_app_session_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_resolve_judgement_runs_workspace_revision
        ON resolve_judgement_runs(review_workspace_id, revision_id, created_at);

      CREATE TABLE IF NOT EXISTS resolve_judgement_results (
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        comment_type TEXT NOT NULL,
        comment_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_markdown TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY (review_workspace_id, revision_id, comment_type, comment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_resolve_judgement_results_run
        ON resolve_judgement_results(run_id);
    `);
  }
}
