import path from 'path';
import Database from 'better-sqlite3';
import type {
  AgentCapability,
  AgentError,
  AgentKind,
  ConversationResponseMode,
  ResultEnvelope,
  SessionModelSelection,
  StructuredOutputMode,
} from '../../shared/domain/agent';
import {
  isStructuredSchemaName,
  normalizeStructuredSchemaData,
  type StructuredSchemaName,
} from '../../shared/domain/structured-schemas';

// ---------------------------------------------------------------------------
// Persisted types
// ---------------------------------------------------------------------------

export interface PersistedConversationTurn {
  turnId: string;
  messageId: string;
  prompt: string;
  response: string;
  responseMode: ConversationResponseMode;
  structuredSchemaName?: StructuredSchemaName;
  structuredOutputMode?: StructuredOutputMode;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: ResultEnvelope;
}

export interface PersistedSession {
  appSessionId: string;
  agent: AgentKind;
  providerSessionId: string;
  cwd: string;
  capabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
  turns: PersistedConversationTurn[];
  finalResult?: ResultEnvelope;
  lastError?: AgentError;
  modelSelection?: SessionModelSelection;
  resumeSummary: string;
  parentAppSessionId?: string;
}

// ---------------------------------------------------------------------------
// SessionStore interface
// ---------------------------------------------------------------------------

export interface SessionStore {
  save(session: PersistedSession): void;
  loadAll(): PersistedSession[];
  load(appSessionId: string): PersistedSession | null;
  delete(appSessionId: string): void;
}

// ---------------------------------------------------------------------------
// SQLite implementation
// ---------------------------------------------------------------------------

const MAX_RECENT_SESSIONS = 50;

interface SessionRow {
  app_session_id: string;
  agent: string;
  provider_session_id: string;
  cwd: string;
  capabilities: string;
  created_at: string;
  updated_at: string;
  turns: string;
  final_result: string | null;
  last_error: string | null;
  model_selection: string | null;
  resume_summary: string;
  parent_app_session_id: string | null;
}

export class SqliteSessionStore implements SessionStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'agent-sessions.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTable();
  }

  save(session: PersistedSession): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        app_session_id, agent, provider_session_id, cwd,
        capabilities, created_at, updated_at, turns,
        final_result, last_error, model_selection, resume_summary,
        parent_app_session_id
      ) VALUES (
        @app_session_id, @agent, @provider_session_id, @cwd,
        @capabilities, @created_at, @updated_at, @turns,
        @final_result, @last_error, @model_selection, @resume_summary,
        @parent_app_session_id
      )
    `);

    stmt.run({
      app_session_id: session.appSessionId,
      agent: session.agent,
      provider_session_id: session.providerSessionId,
      cwd: session.cwd,
      capabilities: JSON.stringify(session.capabilities),
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      turns: JSON.stringify(session.turns),
      final_result: session.finalResult ? JSON.stringify(session.finalResult) : null,
      last_error: session.lastError ? JSON.stringify(session.lastError) : null,
      model_selection: session.modelSelection ? JSON.stringify(session.modelSelection) : null,
      resume_summary: session.resumeSummary,
      parent_app_session_id: session.parentAppSessionId ?? null,
    });

    this.prune();
  }

  loadAll(): PersistedSession[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?');
    const rows = stmt.all(MAX_RECENT_SESSIONS) as SessionRow[];
    return rows.flatMap((row) => {
      const session = this.rowToSession(row);
      return session ? [session] : [];
    });
  }

  load(appSessionId: string): PersistedSession | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE app_session_id = ?');
    const row = stmt.get(appSessionId) as SessionRow | undefined;
    if (!row) {
      return null;
    }
    return this.rowToSession(row);
  }

  delete(appSessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE app_session_id = ?');
    stmt.run(appSessionId);
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        app_session_id      TEXT PRIMARY KEY,
        agent               TEXT NOT NULL,
        provider_session_id TEXT NOT NULL,
        cwd                 TEXT NOT NULL,
        capabilities        TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL,
        turns               TEXT NOT NULL,
        final_result        TEXT,
        last_error          TEXT,
        model_selection     TEXT,
        resume_summary      TEXT NOT NULL
      )
    `);
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN parent_app_session_id TEXT');
    } catch {
      /* Column already exists in existing DBs — ignore */
    }
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN last_error TEXT');
    } catch {
      /* Column already exists in existing DBs — ignore */
    }
  }

  private prune(): void {
    const countStmt = this.db.prepare('SELECT COUNT(*) AS cnt FROM sessions');
    const { cnt } = countStmt.get() as { cnt: number };
    if (cnt <= MAX_RECENT_SESSIONS) {
      return;
    }

    this.db.exec(`
      DELETE FROM sessions WHERE app_session_id NOT IN (
        SELECT app_session_id FROM sessions
        ORDER BY updated_at DESC
        LIMIT ${MAX_RECENT_SESSIONS}
      )
    `);
  }

  private rowToSession(row: SessionRow): PersistedSession | null {
    try {
      const capabilities = parseJsonArray(row.capabilities);
      if (!isAgentCapabilityArray(capabilities)) {
        return null;
      }

      const turns = parseJsonArray(row.turns);
      if (!isPersistedTurnArray(turns)) {
        return null;
      }

      const finalResult = row.final_result ? parseResultEnvelope(row.final_result) : undefined;
      const lastError = row.last_error ? parseAgentError(row.last_error) : undefined;

      const modelSelection = row.model_selection
        ? parseModelSelection(row.model_selection)
        : undefined;

      if (!isAgentKind(row.agent)) {
        return null;
      }

      return {
        appSessionId: row.app_session_id,
        agent: row.agent,
        providerSessionId: row.provider_session_id,
        cwd: row.cwd,
        capabilities,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        turns,
        finalResult: finalResult ?? undefined,
        lastError: lastError ?? undefined,
        modelSelection: modelSelection ?? undefined,
        resumeSummary: row.resume_summary,
        parentAppSessionId: row.parent_app_session_id ?? undefined,
      };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Type guards & helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const VALID_AGENT_KINDS = new Set<string>(['codex', 'copilot']);

function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === 'string' && VALID_AGENT_KINDS.has(value);
}

const VALID_CAPABILITIES = new Set<string>([
  'nativeResumeSession',
  'nativeForkSession',
  'nativeSteerActiveTurn',
  'structuredOutput',
  'nativeReview',
]);

function isAgentCapabilityArray(value: unknown): value is AgentCapability[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((item) => typeof item === 'string' && VALID_CAPABILITIES.has(item));
}

const VALID_RESPONSE_MODES = new Set<string>(['richText', 'structured']);
const VALID_TURN_STATUSES = new Set<string>(['completed', 'failed']);
const VALID_STRUCTURED_OUTPUT_MODES = new Set<string>(['normal', 'forceFallback']);

function isPersistedTurn(value: unknown): value is PersistedConversationTurn {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.turnId !== 'string' || typeof value.messageId !== 'string') {
    return false;
  }
  if (typeof value.prompt !== 'string' || typeof value.response !== 'string') {
    return false;
  }
  if (typeof value.responseMode !== 'string' || !VALID_RESPONSE_MODES.has(value.responseMode)) {
    return false;
  }
  if (typeof value.status !== 'string' || !VALID_TURN_STATUSES.has(value.status)) {
    return false;
  }
  if (typeof value.startedAt !== 'string') {
    return false;
  }
  if (value.completedAt !== undefined && typeof value.completedAt !== 'string') {
    return false;
  }
  if (
    value.structuredSchemaName !== undefined &&
    !isStructuredSchemaName(value.structuredSchemaName)
  ) {
    return false;
  }
  if (
    value.structuredOutputMode !== undefined &&
    (typeof value.structuredOutputMode !== 'string' ||
      !VALID_STRUCTURED_OUTPUT_MODES.has(value.structuredOutputMode))
  ) {
    return false;
  }

  return true;
}

function isPersistedTurnArray(value: unknown): value is PersistedConversationTurn[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isPersistedTurn);
}

function parseResultEnvelope(text: string): ResultEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.kind === 'richText') {
      if (typeof parsed.content !== 'string' || parsed.format !== 'markdown') {
        return null;
      }
      const source = parsed.source;
      if (source !== 'richText' && source !== 'structuredParseFallback') {
        return null;
      }
      return {
        kind: 'richText',
        format: 'markdown',
        content: parsed.content,
        source,
        structuredParseError:
          typeof parsed.structuredParseError === 'string' ? parsed.structuredParseError : undefined,
        structuredParseFailureReason: isStructuredParseFailureReason(
          parsed.structuredParseFailureReason,
        )
          ? parsed.structuredParseFailureReason
          : undefined,
        structuredSchemaName: isStructuredSchemaName(parsed.structuredSchemaName)
          ? parsed.structuredSchemaName
          : undefined,
      };
    }

    if (parsed.kind === 'structured') {
      if (!isStructuredSchemaName(parsed.schemaName)) {
        return null;
      }
      const source = parsed.source;
      if (source !== 'codexOutputSchema' && source !== 'promptedJson') {
        return null;
      }
      const data = normalizeStructuredSchemaData(parsed.schemaName, parsed.data);
      if (!data) {
        return null;
      }
      if (parsed.schemaName === 'implementation-checklist') {
        return {
          kind: 'structured',
          schemaName: parsed.schemaName,
          data,
          source,
          fallbackRichText:
            typeof parsed.fallbackRichText === 'string' ? parsed.fallbackRichText : undefined,
        };
      }

      return {
        kind: 'structured',
        schemaName: parsed.schemaName,
        data,
        source,
        fallbackRichText:
          typeof parsed.fallbackRichText === 'string' ? parsed.fallbackRichText : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parseAgentError(text: string): AgentError | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return null;
    }
    if (
      typeof parsed.code !== 'string' ||
      typeof parsed.message !== 'string' ||
      typeof parsed.retryable !== 'boolean'
    ) {
      return null;
    }

    return {
      code: parsed.code,
      message: parsed.message,
      retryable: parsed.retryable,
      codexErrorInfo: parsed.codexErrorInfo,
      additionalDetails: parsed.additionalDetails,
    };
  } catch {
    return null;
  }
}

function isStructuredParseFailureReason(
  value: unknown,
): value is 'emptyResponse' | 'jsonParseFailed' | 'schemaValidationFailed' {
  return (
    value === 'emptyResponse' || value === 'jsonParseFailed' || value === 'schemaValidationFailed'
  );
}

function parseModelSelection(text: string): SessionModelSelection | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.isRequestedModelEnforced !== 'boolean') {
      return null;
    }
    return {
      requestedModel: typeof parsed.requestedModel === 'string' ? parsed.requestedModel : undefined,
      requestedReasoningEffort:
        typeof parsed.requestedReasoningEffort === 'string'
          ? parsed.requestedReasoningEffort
          : undefined,
      isRequestedModelEnforced: parsed.isRequestedModelEnforced,
      warning: typeof parsed.warning === 'string' ? parsed.warning : undefined,
    };
  } catch {
    return null;
  }
}
