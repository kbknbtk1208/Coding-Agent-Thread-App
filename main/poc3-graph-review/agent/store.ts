import path from 'path';
import Database from 'better-sqlite3';
import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
  Poc3AgentThreadBinding,
  Poc3AgentThreadBindingStrategy,
  Poc3AgentThreadConversation,
  Poc3AgentThreadMessage,
  Poc3AgentThreadMessageRole,
  Poc3AgentThreadMessageSource,
  Poc3AgentThreadReplyRecord,
} from '../../../shared/poc3-domain/agent-review';
import type { Poc3ThreadTracking } from '../../../shared/poc3-domain/thread-retention';

interface AgentReviewRunRow {
  run_id: string;
  review_workspace_id: string;
  revision_id: string;
  scope_key: string;
  review_agent: Poc3AgentReviewRun['reviewAgent'];
  lens_id: string;
  instructions: string;
  codex_model: string | null;
  codex_reasoning_effort: string | null;
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

interface AgentThreadTrackingRow {
  local_thread_id: string;
  review_workspace_id: string;
  source_revision_id: string;
  checked_revision_id: string;
  status: Poc3ThreadTracking['status'];
  reason: Poc3ThreadTracking['reason'];
  original_node_id: string | null;
  tracked_node_id: string | null;
  original_location_json: string;
  checked_at: string;
}

interface AgentThreadMessageRow {
  local_message_id: string;
  local_thread_id: string;
  review_workspace_id: string;
  revision_id: string;
  run_id: string;
  role: Poc3AgentThreadMessageRole;
  source: Poc3AgentThreadMessageSource;
  body: string;
  created_at: string;
}

interface AgentThreadBindingRow {
  local_thread_id: string;
  review_workspace_id: string;
  revision_id: string;
  run_id: string;
  root_app_session_id: string;
  discussion_app_session_id: string;
  strategy: Poc3AgentThreadBindingStrategy;
  created_at: string;
  last_used_at: string;
}

interface AgentThreadReplyRow {
  reply_id: string;
  local_thread_id: string;
  review_workspace_id: string;
  revision_id: string;
  app_session_id: string;
  user_message_id: string;
  created_at: string;
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
            instructions, codex_model, codex_reasoning_effort, root_app_session_id, status,
            result_source, created_at, completed_at
          ) VALUES (
            @run_id, @review_workspace_id, @revision_id, @scope_key, @review_agent, @lens_id,
            @instructions, @codex_model, @codex_reasoning_effort, @root_app_session_id, @status,
            @result_source, @created_at, @completed_at
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
        codex_model: run.codexModel ?? null,
        codex_reasoning_effort: run.codexReasoningEffort ?? null,
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

  listAllThreadsForWorkspace(reviewWorkspaceId: string): Poc3AgentReviewThread[] {
    return this.listRuns(reviewWorkspaceId).flatMap((run) => {
      const envelope = this.getEnvelope(run.runId);
      return envelope?.kind === 'structured' ? envelope.threads : [];
    });
  }

  saveThreadTracking(records: Poc3ThreadTracking[]): void {
    const statement = this.db.prepare(
      `
        INSERT OR REPLACE INTO agent_thread_tracking (
          local_thread_id, review_workspace_id, source_revision_id, checked_revision_id,
          status, reason, original_node_id, tracked_node_id, original_location_json, checked_at
        ) VALUES (
          @local_thread_id, @review_workspace_id, @source_revision_id, @checked_revision_id,
          @status, @reason, @original_node_id, @tracked_node_id, @original_location_json, @checked_at
        )
      `,
    );
    const transaction = this.db.transaction((items: Poc3ThreadTracking[]) => {
      for (const item of items) {
        statement.run({
          local_thread_id: item.localThreadId,
          review_workspace_id: item.reviewWorkspaceId,
          source_revision_id: item.sourceRevisionId,
          checked_revision_id: item.checkedRevisionId,
          status: item.status,
          reason: item.reason,
          original_node_id: item.originalNodeId,
          tracked_node_id: item.trackedNodeId,
          original_location_json: JSON.stringify(item.originalLocation),
          checked_at: item.checkedAt,
        });
      }
    });
    transaction(records);
  }

  listOutdatedThreadTracking(
    reviewWorkspaceId: string,
    checkedRevisionId?: string | null,
  ): Poc3ThreadTracking[] {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM agent_thread_tracking
          WHERE review_workspace_id = ? AND status IN ('outdated', 'unavailable')
            AND (? IS NULL OR checked_revision_id = ?)
          ORDER BY checked_at DESC
        `,
      )
      .all(
        reviewWorkspaceId,
        checkedRevisionId ?? null,
        checkedRevisionId ?? null,
      ) as AgentThreadTrackingRow[];
    return rows.map((row) => this.rowToThreadTracking(row));
  }

  countOutdatedThreadTracking(
    reviewWorkspaceId: string,
    checkedRevisionId?: string | null,
  ): {
    count: number;
    latestCheckedRevisionId: string | null;
  } {
    const countRow = this.db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM agent_thread_tracking
          WHERE review_workspace_id = ? AND status IN ('outdated', 'unavailable')
            AND (? IS NULL OR checked_revision_id = ?)
        `,
      )
      .get(reviewWorkspaceId, checkedRevisionId ?? null, checkedRevisionId ?? null) as
      | { count: number }
      | undefined;
    const latestRow = this.db
      .prepare(
        `
          SELECT checked_revision_id AS latestCheckedRevisionId
          FROM agent_thread_tracking
          WHERE review_workspace_id = ? AND status IN ('outdated', 'unavailable')
            AND (? IS NULL OR checked_revision_id = ?)
          ORDER BY checked_at DESC
          LIMIT 1
        `,
      )
      .get(reviewWorkspaceId, checkedRevisionId ?? null, checkedRevisionId ?? null) as
      | { latestCheckedRevisionId: string | null }
      | undefined;
    return {
      count: countRow?.count ?? 0,
      latestCheckedRevisionId: latestRow?.latestCheckedRevisionId ?? null,
    };
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
      this.db
        .prepare('DELETE FROM agent_thread_tracking WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM agent_thread_messages WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM agent_thread_bindings WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
      this.db
        .prepare('DELETE FROM agent_thread_replies WHERE review_workspace_id = ?')
        .run(reviewWorkspaceId);
    });
    transaction();
  }

  saveThreadBinding(binding: Poc3AgentThreadBinding): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO agent_thread_bindings (
            local_thread_id, review_workspace_id, revision_id, run_id,
            root_app_session_id, discussion_app_session_id, strategy,
            created_at, last_used_at
          ) VALUES (
            @local_thread_id, @review_workspace_id, @revision_id, @run_id,
            @root_app_session_id, @discussion_app_session_id, @strategy,
            @created_at, @last_used_at
          )
        `,
      )
      .run({
        local_thread_id: binding.localThreadId,
        review_workspace_id: binding.reviewWorkspaceId,
        revision_id: binding.revisionId,
        run_id: binding.runId,
        root_app_session_id: binding.rootAppSessionId,
        discussion_app_session_id: binding.discussionAppSessionId,
        strategy: binding.strategy,
        created_at: binding.createdAt,
        last_used_at: binding.lastUsedAt,
      });
  }

  getThreadBinding(localThreadId: string): Poc3AgentThreadBinding | null {
    const row = this.db
      .prepare('SELECT * FROM agent_thread_bindings WHERE local_thread_id = ?')
      .get(localThreadId) as AgentThreadBindingRow | undefined;
    return row ? this.rowToBinding(row) : null;
  }

  getBindingByDiscussionSession(appSessionId: string): Poc3AgentThreadBinding | null {
    const row = this.db
      .prepare('SELECT * FROM agent_thread_bindings WHERE discussion_app_session_id = ?')
      .get(appSessionId) as AgentThreadBindingRow | undefined;
    return row ? this.rowToBinding(row) : null;
  }

  listThreadBindingsForWorkspace(
    reviewWorkspaceId: string,
    revisionId: string,
  ): Poc3AgentThreadBinding[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM agent_thread_bindings WHERE review_workspace_id = ? AND revision_id = ?',
      )
      .all(reviewWorkspaceId, revisionId) as AgentThreadBindingRow[];
    return rows.map((row) => this.rowToBinding(row));
  }

  appendThreadMessage(
    message: Poc3AgentThreadMessage,
    context: {
      reviewWorkspaceId: string;
      revisionId: string;
      runId: string;
    },
  ): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO agent_thread_messages (
            local_message_id, local_thread_id, review_workspace_id, revision_id, run_id,
            role, source, body, created_at
          ) VALUES (
            @local_message_id, @local_thread_id, @review_workspace_id, @revision_id, @run_id,
            @role, @source, @body, @created_at
          )
        `,
      )
      .run({
        local_message_id: message.localMessageId,
        local_thread_id: message.localThreadId,
        review_workspace_id: context.reviewWorkspaceId,
        revision_id: context.revisionId,
        run_id: context.runId,
        role: message.role,
        source: message.source,
        body: message.body,
        created_at: message.createdAt,
      });
  }

  listThreadMessages(localThreadId: string): Poc3AgentThreadMessage[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM agent_thread_messages WHERE local_thread_id = ? ORDER BY created_at, local_message_id',
      )
      .all(localThreadId) as AgentThreadMessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  saveReplyRecord(record: Poc3AgentThreadReplyRecord): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO agent_thread_replies (
            reply_id, local_thread_id, review_workspace_id, revision_id,
            app_session_id, user_message_id, created_at
          ) VALUES (
            @reply_id, @local_thread_id, @review_workspace_id, @revision_id,
            @app_session_id, @user_message_id, @created_at
          )
        `,
      )
      .run({
        reply_id: record.replyId,
        local_thread_id: record.localThreadId,
        review_workspace_id: record.reviewWorkspaceId,
        revision_id: record.revisionId,
        app_session_id: record.appSessionId,
        user_message_id: record.userMessageId,
        created_at: record.createdAt,
      });
  }

  getReplyRecord(replyId: string): Poc3AgentThreadReplyRecord | null {
    const row = this.db
      .prepare('SELECT * FROM agent_thread_replies WHERE reply_id = ?')
      .get(replyId) as AgentThreadReplyRow | undefined;
    return row ? this.rowToReply(row) : null;
  }

  getLatestReplyForThread(localThreadId: string): Poc3AgentThreadReplyRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM agent_thread_replies WHERE local_thread_id = ? ORDER BY created_at DESC, reply_id DESC LIMIT 1',
      )
      .get(localThreadId) as AgentThreadReplyRow | undefined;
    return row ? this.rowToReply(row) : null;
  }

  getThreadDraft(localThreadId: string): Poc3AgentReviewThread | null {
    const envelopeRows = this.db
      .prepare('SELECT envelope_json FROM agent_review_envelopes')
      .all() as { envelope_json: string }[];
    for (const row of envelopeRows) {
      const envelope = parseJson<Poc3AgentReviewEnvelope>(row.envelope_json);
      if (envelope.kind !== 'structured') continue;
      const found = envelope.threads.find((thread) => thread.localThreadId === localThreadId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  buildConversation(localThreadId: string): Poc3AgentThreadConversation | null {
    const draft = this.getThreadDraft(localThreadId);
    if (!draft) {
      return null;
    }
    const binding = this.getThreadBinding(localThreadId);
    const initialMessage: Poc3AgentThreadMessage = {
      localMessageId: `${draft.localThreadId}:initial`,
      localThreadId: draft.localThreadId,
      role: 'assistant',
      source: 'initial-finding',
      body: draft.draftBody,
      createdAt: draft.createdAt,
    };
    const persisted = this.listThreadMessages(localThreadId);
    return {
      localThreadId: draft.localThreadId,
      reviewWorkspaceId: draft.reviewWorkspaceId,
      revisionId: draft.revisionId,
      runId: draft.runId,
      binding,
      replyStatus: 'idle',
      lastError: null,
      activeReplySessionId: null,
      messages: [initialMessage, ...persisted],
    };
  }

  buildConversationsForWorkspace(
    reviewWorkspaceId: string,
    revisionId: string,
  ): Poc3AgentThreadConversation[] {
    const runs = this.listRuns(reviewWorkspaceId);
    const conversations: Poc3AgentThreadConversation[] = [];
    for (const run of runs) {
      const envelope = this.getEnvelope(run.runId);
      if (envelope?.kind !== 'structured') continue;
      for (const thread of envelope.threads) {
        if (thread.revisionId !== revisionId) continue;
        const conv = this.buildConversation(thread.localThreadId);
        if (conv) {
          conversations.push(conv);
        }
      }
    }
    return conversations;
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
      codexModel: row.codex_model ?? undefined,
      codexReasoningEffort: row.codex_reasoning_effort ?? undefined,
      rootAppSessionId: row.root_app_session_id,
      status: row.status,
      resultSource: row.result_source,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  private rowToThreadTracking(row: AgentThreadTrackingRow): Poc3ThreadTracking {
    return {
      localThreadId: row.local_thread_id,
      reviewWorkspaceId: row.review_workspace_id,
      sourceRevisionId: row.source_revision_id,
      checkedRevisionId: row.checked_revision_id,
      status: row.status,
      reason: row.reason,
      originalNodeId: row.original_node_id,
      trackedNodeId: row.tracked_node_id,
      originalLocation: parseJson(row.original_location_json),
      checkedAt: row.checked_at,
    };
  }

  private rowToBinding(row: AgentThreadBindingRow): Poc3AgentThreadBinding {
    return {
      localThreadId: row.local_thread_id,
      reviewWorkspaceId: row.review_workspace_id,
      revisionId: row.revision_id,
      runId: row.run_id,
      rootAppSessionId: row.root_app_session_id,
      discussionAppSessionId: row.discussion_app_session_id,
      strategy: row.strategy,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  private rowToMessage(row: AgentThreadMessageRow): Poc3AgentThreadMessage {
    return {
      localMessageId: row.local_message_id,
      localThreadId: row.local_thread_id,
      role: row.role,
      source: row.source,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  private rowToReply(row: AgentThreadReplyRow): Poc3AgentThreadReplyRecord {
    return {
      replyId: row.reply_id,
      localThreadId: row.local_thread_id,
      reviewWorkspaceId: row.review_workspace_id,
      revisionId: row.revision_id,
      appSessionId: row.app_session_id,
      userMessageId: row.user_message_id,
      createdAt: row.created_at,
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
        codex_model TEXT,
        codex_reasoning_effort TEXT,
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

      CREATE TABLE IF NOT EXISTS agent_thread_tracking (
        local_thread_id TEXT NOT NULL,
        review_workspace_id TEXT NOT NULL,
        source_revision_id TEXT NOT NULL,
        checked_revision_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        original_node_id TEXT,
        tracked_node_id TEXT,
        original_location_json TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY (local_thread_id, checked_revision_id)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_thread_tracking_workspace_status
        ON agent_thread_tracking(review_workspace_id, status, checked_at);

      CREATE TABLE IF NOT EXISTS agent_thread_messages (
        local_message_id TEXT PRIMARY KEY,
        local_thread_id TEXT NOT NULL,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        role TEXT NOT NULL,
        source TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_thread_messages_thread
        ON agent_thread_messages(local_thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_thread_messages_workspace
        ON agent_thread_messages(review_workspace_id, revision_id);

      CREATE TABLE IF NOT EXISTS agent_thread_bindings (
        local_thread_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        root_app_session_id TEXT NOT NULL,
        discussion_app_session_id TEXT NOT NULL,
        strategy TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_thread_bindings_workspace
        ON agent_thread_bindings(review_workspace_id, revision_id);
      CREATE INDEX IF NOT EXISTS idx_agent_thread_bindings_session
        ON agent_thread_bindings(discussion_app_session_id);

      CREATE TABLE IF NOT EXISTS agent_thread_replies (
        reply_id TEXT PRIMARY KEY,
        local_thread_id TEXT NOT NULL,
        review_workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        app_session_id TEXT NOT NULL,
        user_message_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_thread_replies_thread
        ON agent_thread_replies(local_thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_thread_replies_session
        ON agent_thread_replies(app_session_id);
    `);
    try {
      this.db.exec('ALTER TABLE agent_review_runs ADD COLUMN codex_model TEXT');
    } catch {
      /* Column already exists in existing DBs — ignore */
    }
    try {
      this.db.exec('ALTER TABLE agent_review_runs ADD COLUMN codex_reasoning_effort TEXT');
    } catch {
      /* Column already exists in existing DBs — ignore */
    }
  }
}
