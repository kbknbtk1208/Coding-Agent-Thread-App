import path from 'path';
import Database from 'better-sqlite3';
import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
} from '../../../shared/poc3-domain/agent-review';

interface AgentReviewRunRow {
  run_id: string;
  review_workspace_id: string;
  revision_id: string;
  scope_key: string;
  review_agent: Poc3AgentReviewRun['reviewAgent'];
  lens_id: string;
  instructions: string;
  root_app_session_id: string;
  status: Poc3AgentReviewRun['status'];
  result_source: Poc3AgentReviewRun['resultSource'];
  created_at: string;
  completed_at: string | null;
}

interface AgentReviewEnvelopeRow {
  run_id: string;
  envelope_json: string;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class Poc3AgentReviewStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  saveRun(run: Poc3AgentReviewRun): Poc3AgentReviewRun {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO agent_review_runs (
            run_id, review_workspace_id, revision_id, scope_key, review_agent, lens_id,
            instructions, root_app_session_id, status, result_source, created_at, completed_at
          ) VALUES (
            @run_id, @review_workspace_id, @revision_id, @scope_key, @review_agent, @lens_id,
            @instructions, @root_app_session_id, @status, @result_source, @created_at, @completed_at
          )
        `,
      )
      .run({
        run_id: run.runId,
        review_workspace_id: run.reviewWorkspaceId,
        revision_id: run.revisionId,
        scope_key: run.scopeKey,
        review_agent: run.reviewAgent,
        lens_id: run.lensId,
        instructions: run.instructions,
        root_app_session_id: run.rootAppSessionId,
        status: run.status,
        result_source: run.resultSource,
        created_at: run.createdAt,
        completed_at: run.completedAt,
      });
    return run;
  }

  getRun(runId: string): Poc3AgentReviewRun | null {
    const row = this.db.prepare('SELECT * FROM agent_review_runs WHERE run_id = ?').get(runId) as
      | AgentReviewRunRow
      | undefined;
    return row ? this.rowToRun(row) : null;
  }

  getRunByAppSessionId(appSessionId: string): Poc3AgentReviewRun | null {
    const row = this.db
      .prepare('SELECT * FROM agent_review_runs WHERE root_app_session_id = ?')
      .get(appSessionId) as AgentReviewRunRow | undefined;
    return row ? this.rowToRun(row) : null;
  }

  listRuns(reviewWorkspaceId: string): Poc3AgentReviewRun[] {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM agent_review_runs
          WHERE review_workspace_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(reviewWorkspaceId) as AgentReviewRunRow[];
    return rows.map((row) => this.rowToRun(row));
  }

  saveEnvelope(envelope: Poc3AgentReviewEnvelope): Poc3AgentReviewEnvelope {
    const transaction = this.db.transaction((input: Poc3AgentReviewEnvelope) => {
      this.saveRun(input.run);
      this.db
        .prepare(
          `
            INSERT OR REPLACE INTO agent_review_envelopes (
              run_id, envelope_json, created_at, updated_at
            ) VALUES (
              @run_id, @envelope_json, @created_at, @updated_at
            )
          `,
        )
        .run({
          run_id: input.run.runId,
          envelope_json: JSON.stringify(input),
          created_at: input.run.createdAt,
          updated_at: input.run.completedAt ?? input.run.createdAt,
        });
    });
    transaction(envelope);
    return envelope;
  }

  getEnvelope(runId: string): Poc3AgentReviewEnvelope | null {
    const row = this.db
      .prepare('SELECT * FROM agent_review_envelopes WHERE run_id = ?')
      .get(runId) as AgentReviewEnvelopeRow | undefined;
    return row ? parseJson<Poc3AgentReviewEnvelope>(row.envelope_json) : null;
  }

  listThreadsForNode(input: {
    reviewWorkspaceId: string;
    revisionId: string;
    nodeId: string;
  }): Poc3AgentReviewThread[] {
    return this.listRuns(input.reviewWorkspaceId).flatMap((run) => {
      const envelope = this.getEnvelope(run.runId);
      if (envelope?.kind !== 'structured') {
        return [];
      }
      return envelope.threads.filter(
        (thread) => thread.revisionId === input.revisionId && thread.nodeId === input.nodeId,
      );
    });
  }

  listThreadsForWorkspace(input: {
    reviewWorkspaceId: string;
    revisionId: string;
  }): Poc3AgentReviewThread[] {
    return this.listRuns(input.reviewWorkspaceId).flatMap((run) => {
      const envelope = this.getEnvelope(run.runId);
      if (envelope?.kind !== 'structured') {
        return [];
      }
      return envelope.threads.filter((thread) => thread.revisionId === input.revisionId);
    });
  }

  deleteWorkspaceRuns(reviewWorkspaceId: string): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
            DELETE FROM agent_review_envelopes
            WHERE run_id IN (
              SELECT run_id FROM agent_review_runs WHERE review_workspace_id = ?
            )
          `,
        )
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM agent_review_runs WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
    });
    transaction();
  }

  close(): void {
    this.db.close();
  }

  private rowToRun(row: AgentReviewRunRow): Poc3AgentReviewRun {
    return {
      runId: row.run_id,
      reviewWorkspaceId: row.review_workspace_id,
      revisionId: row.revision_id,
      scopeKey: row.scope_key,
      reviewAgent: row.review_agent,
      lensId: row.lens_id,
      instructions: row.instructions,
      rootAppSessionId: row.root_app_session_id,
      status: row.status,
      resultSource: row.result_source,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_review_runs (
        run_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        review_agent TEXT NOT NULL,
        lens_id TEXT NOT NULL,
        instructions TEXT NOT NULL,
        root_app_session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_agent_review_runs_workspace
        ON agent_review_runs(review_workspace_id, created_at);

      CREATE TABLE IF NOT EXISTS agent_review_envelopes (
        run_id TEXT PRIMARY KEY,
        envelope_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}
