import { randomUUID } from 'crypto';
import type {
  AgentEvent,
  AgentKind,
  AppSession,
  ConversationResponseMode,
  ConversationTurn,
  PendingPermission,
  ResultEnvelope,
  SessionModelSelection,
  StructuredResultEnvelope,
} from '../../shared/domain/agent';
import {
  summarizeStructuredResult,
  type StructuredSchemaMap,
  type StructuredSchemaName,
} from '../../shared/domain/structured-schemas';
import {
  applyMessageDeltaToTurn,
  applyProgressHintToTurn,
  cloneIntermediateSegments,
} from '../../shared/domain/intermediate-segments';
import type { ResumeContext, ResumeContextTurn } from '../../shared/domain/resume-context';
import type {
  AgentSessionSnapshot,
  ContinueConversationInput,
  ForkSessionInput,
  ListCodexModelsResult,
  RespondPermissionInput,
  SendFollowUpInput,
  StartSessionInput,
  SteerActiveTurnInput,
} from '../../shared/contracts/agent-ipc';
import { CodexRuntime } from '../agent-runtime/codex/codex-runtime';
import { CopilotRuntime } from '../agent-runtime/copilot/copilot-runtime';
import type {
  AgentRuntime,
  ForkRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
} from '../agent-runtime/shared/runtime-contracts';
import type { PersistedConversationTurn, PersistedSession, SessionStore } from './session-store';

type EmitAgentEvent = (event: AgentEvent) => void;

const BUSY_STATUSES = ['starting', 'running', 'waiting_permission'] as const;

function clonePendingPermission(permission: PendingPermission): PendingPermission {
  return {
    ...permission,
    actions: permission.actions.map((action) => ({ ...action })),
    payload:
      permission.payload && typeof permission.payload === 'object'
        ? Array.isArray(permission.payload)
          ? [...permission.payload]
          : { ...permission.payload }
        : permission.payload,
  };
}

function removePendingPermission(
  pendingPermissions: PendingPermission[],
  requestId: string,
): PendingPermission[] {
  return pendingPermissions.filter((permission) => permission.requestId !== requestId);
}

function isBusyStatus(status: AppSession['status']) {
  return BUSY_STATUSES.includes(status as (typeof BUSY_STATUSES)[number]);
}

function createStructuredResultEnvelope<TName extends StructuredSchemaName>(args: {
  schemaName: TName;
  data: StructuredSchemaMap[TName];
  source: StructuredResultEnvelope['source'];
  fallbackRichText?: string;
}): Extract<StructuredResultEnvelope, { schemaName: TName }> {
  return {
    kind: 'structured',
    schemaName: args.schemaName,
    data: args.data,
    source: args.source,
    fallbackRichText: args.fallbackRichText,
  } as Extract<StructuredResultEnvelope, { schemaName: TName }>;
}

export class AgentGateway {
  private readonly sessions = new Map<string, AppSession>();

  private readonly runtimeSessions = new Map<string, RuntimeSessionHandle>();
  private readonly settledWaiters = new Map<
    string,
    Array<(snapshot: AgentSessionSnapshot) => void>
  >();

  private readonly runtimes: Record<AgentKind, AgentRuntime> = {
    codex: new CodexRuntime(),
    copilot: new CopilotRuntime(),
  };

  constructor(
    private readonly emit: EmitAgentEvent,
    private readonly sessionStore?: SessionStore,
  ) {}

  listSessions(): AgentSessionSnapshot[] {
    const inMemoryIds = new Set(this.sessions.keys());
    const inMemory = Array.from(this.sessions.values()).map((session) =>
      this.cloneSession(session),
    );

    const persisted = this.sessionStore
      ? this.sessionStore
          .loadAll()
          .filter((p) => !inMemoryIds.has(p.appSessionId))
          .map((p) => this.rehydrateSnapshot(p))
      : [];

    return [...inMemory, ...persisted].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async listCodexModels(cwd = process.cwd()): Promise<ListCodexModelsResult> {
    const runtime = this.runtimes.codex as AgentRuntime & {
      listModels?: (cwd: string) => Promise<ListCodexModelsResult['models']>;
    };
    if (typeof runtime.listModels !== 'function') {
      return { models: [] };
    }
    return {
      models: await runtime.listModels(cwd),
    };
  }

  async awaitSettled(appSessionId: string): Promise<AgentSessionSnapshot> {
    this.assertText(appSessionId, '待機するセッションを選択してください。');

    const session = this.sessions.get(appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }

    if (session.status === 'failed') {
      return this.cloneSession(session);
    }

    if (session.status === 'completed' && session.finalResult) {
      return this.cloneSession(session);
    }

    return new Promise<AgentSessionSnapshot>((resolve) => {
      const waiters = this.settledWaiters.get(appSessionId) ?? [];
      waiters.push(resolve);
      this.settledWaiters.set(appSessionId, waiters);
    });
  }

  async startSession(input: StartSessionInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.cwd, '作業ディレクトリを入力してください。');
    this.assertText(input.prompt, 'プロンプトを入力してください。');
    this.assertStructuredInput(input.responseMode, input.structuredSchemaName);

    const now = this.now();
    const appSessionId = randomUUID();
    const responseMode = input.responseMode ?? 'richText';
    const turn = this.createTurn(
      input.prompt,
      responseMode,
      now,
      input.structuredSchemaName,
      input.structuredOutputMode,
    );
    const session: AppSession = {
      agent: input.agent,
      appSessionId,
      capabilities: [],
      createdAt: now,
      cwd: input.cwd.trim(),
      lastError: undefined,
      status: 'starting',
      pendingPermissions: [],
      progressHint: undefined,
      streamBuffer: { content: '', messageId: turn.messageId },
      turns: [turn],
      updatedAt: now,
      modelSelection: this.createModelSelection(input),
    };

    this.sessions.set(appSessionId, session);

    try {
      const runtimeSession = await this.runtimes[input.agent].createSession({
        appSessionId,
        cwd: session.cwd,
        emit: (event) => this.handleRuntimeEvent(appSessionId, event),
        codexModel: input.codexModel,
        codexReasoningEffort: input.codexReasoningEffort,
      });

      this.attachRuntimeSession(session, runtimeSession);

      this.persistSession(session);
      this.emitSessionBootstrapEvents(session, 'starting');

      void runtimeSession
        .sendPrompt({
          messageId: turn.messageId,
          prompt: turn.prompt,
          responseMode: turn.responseMode,
          structuredSchemaName: turn.structuredSchemaName,
          structuredOutputMode: turn.structuredOutputMode,
          codexModel: input.codexModel,
          codexReasoningEffort: input.codexReasoningEffort,
        })
        .catch((error) => {
          this.applyError(
            appSessionId,
            error instanceof Error ? error.message : 'セッションの開始に失敗しました。',
          );
        });
    } catch (error) {
      this.applyError(
        appSessionId,
        error instanceof Error ? error.message : 'セッションの開始に失敗しました。',
      );
    }

    return this.cloneSession(session);
  }

  async continueConversation(input: ContinueConversationInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.appSessionId, '再開するセッションを選択してください。');

    const existingSession = this.sessions.get(input.appSessionId);
    const existingRuntimeSession = this.runtimeSessions.get(input.appSessionId);
    if (existingSession && existingRuntimeSession) {
      return this.cloneSession(existingSession);
    }

    if (existingRuntimeSession) {
      await existingRuntimeSession.dispose();
      this.runtimeSessions.delete(input.appSessionId);
    }

    if (!this.sessionStore) {
      throw new Error('セッションストアが初期化されていません。');
    }

    const persisted = this.sessionStore.load(input.appSessionId);
    if (!persisted) {
      throw new Error('指定されたセッションが見つかりません。');
    }

    const session = this.rehydrateFullSession(persisted);

    try {
      const runtimeSession = await this.restoreRuntimeSession(session, persisted);
      this.attachRuntimeSession(session, runtimeSession);
      session.status = this.getRestoredSessionStatus(persisted);
      session.updatedAt = this.now();
      this.sessions.set(session.appSessionId, session);
      this.persistSession(session);
      this.emitSessionBootstrapEvents(session);

      return this.cloneSession(session);
    } catch (error) {
      this.sessions.delete(input.appSessionId);
      const runtimeSession = this.runtimeSessions.get(input.appSessionId);
      if (runtimeSession) {
        this.runtimeSessions.delete(input.appSessionId);
        await runtimeSession.dispose();
      }
      throw new Error(error instanceof Error ? error.message : 'セッションの再開に失敗しました。');
    }
  }

  async forkSession(input: ForkSessionInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.appSessionId, 'フォーク元のセッションを選択してください。');

    const parentSession = this.sessions.get(input.appSessionId);
    let parentPersisted: PersistedSession | null = null;

    if (!parentSession) {
      if (!this.sessionStore) {
        throw new Error('セッションストアが初期化されていません。');
      }
      parentPersisted = this.sessionStore.load(input.appSessionId);
      if (!parentPersisted) {
        throw new Error('指定されたセッションが見つかりません。');
      }
    }

    const parentStatus = parentSession?.status ?? this.getRestoredSessionStatus(parentPersisted!);
    if (isBusyStatus(parentStatus)) {
      throw new Error('実行中のセッションはフォークできません。');
    }
    if (parentStatus !== 'completed') {
      throw new Error('完了済みセッションのみフォークできます。');
    }

    const runtime = this.runtimes[parentSession?.agent ?? parentPersisted!.agent];
    if (!runtime.forkSession) {
      throw new Error('このプロバイダーはフォークをサポートしていません。');
    }

    const providerSessionId =
      parentSession?.providerSessionId ??
      parentPersisted?.providerSessionId ??
      this.runtimeSessions.get(input.appSessionId)?.providerSessionId;

    if (!providerSessionId) {
      throw new Error('フォーク元のプロバイダーセッションが見つかりません。');
    }

    const now = this.now();
    const newAppSessionId = randomUUID();
    const sourceTurns =
      parentSession?.turns ??
      (parentPersisted ? parentPersisted.turns.map((t) => this.rehydrateTurn(t)) : []);

    const newSession: AppSession = {
      agent: parentSession?.agent ?? parentPersisted!.agent,
      appSessionId: newAppSessionId,
      capabilities: [...(parentSession?.capabilities ?? parentPersisted!.capabilities)],
      createdAt: now,
      cwd: parentSession?.cwd ?? parentPersisted!.cwd,
      finalResult: undefined,
      lastError: undefined,
      modelSelection: parentSession?.modelSelection
        ? { ...parentSession.modelSelection }
        : parentPersisted?.modelSelection
          ? { ...parentPersisted.modelSelection }
          : undefined,
      parentAppSessionId: input.appSessionId,
      pendingPermissions: [],
      progressHint: undefined,
      providerSessionId: undefined,
      status: 'starting',
      streamBuffer: { content: '', messageId: null },
      turns: sourceTurns.map((turn) => ({
        ...turn,
        intermediateSegments: cloneIntermediateSegments(turn.intermediateSegments ?? []),
        progressHint: undefined,
        result: turn.result ? this.cloneResultEnvelope(turn.result) : undefined,
      })),
      updatedAt: now,
    };

    if (parentSession?.finalResult) {
      newSession.finalResult = this.cloneResultEnvelope(parentSession.finalResult);
    } else if (parentPersisted?.finalResult) {
      newSession.finalResult = this.cloneResultEnvelope(parentPersisted.finalResult);
    }

    this.sessions.set(newAppSessionId, newSession);

    let runtimeHandle: RuntimeSessionHandle | undefined;

    try {
      const forkInput: ForkRuntimeSessionInput = {
        appSessionId: newAppSessionId,
        providerSessionId,
        cwd: newSession.cwd,
        emit: (event) => this.handleRuntimeEvent(newAppSessionId, event),
      };

      runtimeHandle = await runtime.forkSession(forkInput);
      this.attachRuntimeSession(newSession, runtimeHandle);

      newSession.status = 'completed';
      newSession.updatedAt = this.now();
      this.persistSession(newSession);
      this.emitSessionBootstrapEvents(newSession, 'completed');

      return this.cloneSession(newSession);
    } catch (error) {
      this.sessions.delete(newAppSessionId);
      const handle = this.runtimeSessions.get(newAppSessionId) ?? runtimeHandle;
      if (handle) {
        this.runtimeSessions.delete(newAppSessionId);
        await handle.dispose();
      }
      throw new Error(
        error instanceof Error ? error.message : 'セッションのフォークに失敗しました。',
      );
    }
  }

  async sendFollowUp(input: SendFollowUpInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.prompt, 'follow-up プロンプトを入力してください。');
    this.assertStructuredInput(input.responseMode, input.structuredSchemaName);

    const session = this.sessions.get(input.appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }
    if (isBusyStatus(session.status)) {
      throw new Error('セッション実行中は follow-up を送信できません。');
    }

    const runtimeSession = this.runtimeSessions.get(input.appSessionId);
    if (!runtimeSession) {
      throw new Error('provider session が初期化されていません。');
    }

    const now = this.now();
    const responseMode = input.responseMode ?? 'richText';
    const turn = this.createTurn(
      input.prompt,
      responseMode,
      now,
      input.structuredSchemaName,
      input.structuredOutputMode,
    );
    session.status = 'starting';
    session.progressHint = undefined;
    session.streamBuffer = { content: '', messageId: turn.messageId };
    session.turns = [...session.turns, turn];
    session.finalResult = undefined;
    session.lastError = undefined;
    session.updatedAt = now;

    this.emit({
      appSessionId: session.appSessionId,
      status: 'starting',
      type: 'status.changed',
    });

    try {
      void runtimeSession
        .sendPrompt({
          messageId: turn.messageId,
          prompt: turn.prompt,
          responseMode: turn.responseMode,
          structuredSchemaName: turn.structuredSchemaName,
          structuredOutputMode: turn.structuredOutputMode,
          codexModel: input.codexModel ?? session.modelSelection?.requestedModel,
          codexReasoningEffort:
            input.codexReasoningEffort ?? session.modelSelection?.requestedReasoningEffort,
        })
        .catch((error) => {
          this.applyError(
            input.appSessionId,
            error instanceof Error ? error.message : 'follow-up の送信に失敗しました。',
          );
        });
    } catch (error) {
      this.applyError(
        input.appSessionId,
        error instanceof Error ? error.message : 'follow-up の送信に失敗しました。',
      );
    }

    return this.cloneSession(session);
  }

  async steerActiveTurn(input: SteerActiveTurnInput): Promise<void> {
    this.assertText(input.prompt, 'steer プロンプトを入力してください。');

    const session = this.sessions.get(input.appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }
    if (session.status !== 'running') {
      throw new Error('実行中のセッションのみ steer できます。');
    }

    const runtimeSession = this.runtimeSessions.get(input.appSessionId);
    if (!runtimeSession) {
      throw new Error('provider session が初期化されていません。');
    }
    if (!runtimeSession.steer) {
      throw new Error('このプロバイダーは steer をサポートしていません。');
    }

    await runtimeSession.steer({ steerText: input.prompt });
  }

  async respondPermission(input: RespondPermissionInput): Promise<void> {
    this.assertText(input.appSessionId, 'permission 応答対象のセッションを選択してください。');
    this.assertText(input.requestId, 'permission requestId が必要です。');
    this.assertText(input.actionId, 'permission actionId が必要です。');

    const session = this.sessions.get(input.appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }
    const pendingPermission = session.pendingPermissions.find(
      (permission) => permission.requestId === input.requestId,
    );
    if (!pendingPermission) {
      throw new Error('pending permission request が見つかりません。');
    }
    if (!pendingPermission.actions.some((action) => action.actionId === input.actionId)) {
      throw new Error('permission actionId が一致しません。');
    }

    const runtimeSession = this.runtimeSessions.get(input.appSessionId);
    if (!runtimeSession) {
      throw new Error('provider session が初期化されていません。');
    }
    if (!runtimeSession.respondPermission) {
      throw new Error('このプロバイダーは permission 応答をサポートしていません。');
    }

    await runtimeSession.respondPermission(input.requestId, input.actionId);

    const updatedAt = this.now();
    session.pendingPermissions = removePendingPermission(
      session.pendingPermissions,
      input.requestId,
    );
    session.progressHint = undefined;
    session.status = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
    session.updatedAt = updatedAt;

    const latestTurn = session.turns.at(-1);
    if (latestTurn) {
      latestTurn.progressHint = undefined;
      latestTurn.status = session.status;
    }

    this.persistSession(session);
    this.emit({
      appSessionId: input.appSessionId,
      requestId: input.requestId,
      type: 'permission.resolved',
    });
    this.emit({
      appSessionId: input.appSessionId,
      status: session.status,
      type: 'status.changed',
    });
  }

  async dispose() {
    const activeSessions = Array.from(this.sessions.values());
    for (const session of activeSessions) {
      this.persistSession(session);
    }

    const handles = Array.from(this.runtimeSessions.values());
    this.runtimeSessions.clear();

    for (const handle of handles) {
      await handle.dispose();
    }
  }

  private handleRuntimeEvent(appSessionId: string, event: RuntimeSessionEvent) {
    const session = this.sessions.get(appSessionId);
    if (!session) {
      return;
    }

    let emittedEvent: AgentEvent = {
      ...event,
      appSessionId,
    } as AgentEvent;

    switch (event.type) {
      case 'status.changed': {
        const updatedAt = this.now();
        const isTerminalStatus = event.status === 'completed' || event.status === 'failed';
        const latestTurn = session.turns.at(-1);
        const shouldFinalizeLatestTurn =
          isTerminalStatus && latestTurn ? isBusyStatus(latestTurn.status) : false;
        const shouldSyncLatestTurnStatus =
          !shouldFinalizeLatestTurn &&
          latestTurn?.status === 'waiting_permission' &&
          event.status !== 'waiting_permission';
        const nextStatus =
          session.pendingPermissions.length > 0 && event.status === 'running'
            ? 'waiting_permission'
            : event.status;

        session.status = nextStatus;
        session.updatedAt = updatedAt;
        if (isTerminalStatus) {
          session.pendingPermissions = [];
          session.progressHint = undefined;
          session.streamBuffer = { content: '', messageId: null };
        }
        if (shouldFinalizeLatestTurn && latestTurn) {
          latestTurn.completedAt = updatedAt;
          latestTurn.status = nextStatus;
          latestTurn.progressHint = undefined;
        } else if (shouldSyncLatestTurnStatus && latestTurn) {
          latestTurn.status = nextStatus;
          latestTurn.progressHint = undefined;
        }
        if (isTerminalStatus) {
          this.persistSession(session);
          this.resolveSettledWaitersIfReady(appSessionId, session);
        }
        emittedEvent = {
          appSessionId,
          status: nextStatus,
          type: 'status.changed',
        };
        break;
      }
      case 'progress.updated': {
        const latestTurn = session.turns.at(-1);
        session.status = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
        session.progressHint = { ...event.progressHint };
        if (latestTurn && latestTurn.messageId === event.messageId) {
          const nextTurn = applyProgressHintToTurn(
            latestTurn,
            event.progressHint,
            event.progressHint.updatedAt,
          );
          nextTurn.status = session.status;
          session.turns[session.turns.length - 1] = nextTurn;
        }
        session.updatedAt = this.now();
        break;
      }
      case 'message.delta': {
        const latestTurn = session.turns.at(-1);
        if (latestTurn && latestTurn.messageId === event.messageId) {
          const nextTurn = applyMessageDeltaToTurn(
            latestTurn,
            session.agent,
            event.text,
            event.updatedAt,
          );
          nextTurn.status =
            session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
          session.turns[session.turns.length - 1] = nextTurn;
        }
        session.status = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
        session.progressHint = undefined;
        session.streamBuffer = {
          content: session.streamBuffer.content + event.text,
          messageId: event.messageId,
        };
        session.updatedAt = this.now();
        break;
      }
      case 'message.completed': {
        const latestTurn = session.turns.at(-1);
        if (latestTurn && latestTurn.messageId === event.messageId) {
          latestTurn.completedAt = this.now();
          latestTurn.status = 'completed';
        }
        session.updatedAt = this.now();
        break;
      }
      case 'result.richText': {
        const result = {
          content: event.content,
          format: event.format,
          kind: 'richText' as const,
          source: event.source,
          structuredParseError: event.structuredParseError,
          structuredParseFailureReason: event.structuredParseFailureReason,
          structuredSchemaName: event.structuredSchemaName,
        };
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.result = result;
          latestTurn.progressHint = undefined;
        }
        session.finalResult = result;
        session.lastError = undefined;
        session.pendingPermissions = [];
        session.progressHint = undefined;
        session.updatedAt = this.now();
        this.persistSession(session);
        this.resolveSettledWaitersIfReady(appSessionId, session);
        break;
      }
      case 'result.structured': {
        const result = createStructuredResultEnvelope({
          schemaName: event.schemaName,
          data: event.data,
          source: event.source,
          fallbackRichText: event.fallbackRichText,
        });
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.result = result;
          latestTurn.progressHint = undefined;
        }
        session.finalResult = result;
        session.lastError = undefined;
        session.pendingPermissions = [];
        session.progressHint = undefined;
        session.updatedAt = this.now();
        this.persistSession(session);
        this.resolveSettledWaitersIfReady(appSessionId, session);
        break;
      }
      case 'permission.requested': {
        const pendingPermission = clonePendingPermission(event.permission);
        const latestTurn = session.turns.at(-1);
        if (
          pendingPermission.turnId &&
          !session.turns.some((turn) => turn.turnId === pendingPermission.turnId) &&
          latestTurn
        ) {
          pendingPermission.turnId = latestTurn.turnId;
        }
        const targetTurnIndex = pendingPermission.turnId
          ? session.turns.findIndex((turn) => turn.turnId === pendingPermission.turnId)
          : session.turns.length - 1;
        session.status = 'waiting_permission';
        session.pendingPermissions = [
          ...session.pendingPermissions.filter(
            (permission) => permission.requestId !== pendingPermission.requestId,
          ),
          pendingPermission,
        ];
        session.progressHint = undefined;
        session.updatedAt = this.now();
        if (targetTurnIndex >= 0) {
          const targetTurn = session.turns[targetTurnIndex];
          session.turns[targetTurnIndex] = {
            ...targetTurn,
            progressHint: undefined,
            status: 'waiting_permission',
          };
        }
        emittedEvent = {
          appSessionId,
          permission: clonePendingPermission(pendingPermission),
          type: 'permission.requested',
        };
        break;
      }
      case 'permission.resolved': {
        session.pendingPermissions = removePendingPermission(
          session.pendingPermissions,
          event.requestId,
        );
        session.progressHint = undefined;
        session.status = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
        session.updatedAt = this.now();
        const latestTurn = session.turns.at(-1);
        if (latestTurn && latestTurn.status === 'waiting_permission') {
          latestTurn.progressHint = undefined;
          latestTurn.status = session.status;
        }
        break;
      }
      case 'error': {
        session.status = 'failed';
        session.lastError = { ...event.error };
        session.pendingPermissions = [];
        session.progressHint = undefined;
        session.streamBuffer = { content: '', messageId: null };
        session.updatedAt = this.now();
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.completedAt = this.now();
          latestTurn.status = 'failed';
          latestTurn.progressHint = undefined;
        }
        this.resolveSettledWaitersIfReady(appSessionId, session);
        emittedEvent = {
          appSessionId,
          error: {
            ...event.error,
          },
          type: 'error',
        };
        break;
      }
      default:
        break;
    }

    this.emit(emittedEvent);
  }

  private applyError(appSessionId: string, message: string) {
    const session = this.sessions.get(appSessionId);
    if (!session) {
      return;
    }

    session.status = 'failed';
    session.lastError = {
      code: 'SESSION_START_FAILED',
      message,
      retryable: true,
    };
    session.pendingPermissions = [];
    session.progressHint = undefined;
    session.streamBuffer = { content: '', messageId: null };
    session.updatedAt = this.now();

    const latestTurn = session.turns.at(-1);
    if (latestTurn) {
      latestTurn.completedAt = this.now();
      latestTurn.status = 'failed';
      latestTurn.progressHint = undefined;
    }

    this.resolveSettledWaitersIfReady(appSessionId, session);

    this.emit({
      appSessionId,
      error: {
        code: 'SESSION_START_FAILED',
        message,
        retryable: true,
      },
      type: 'error',
    });
  }

  private createTurn(
    prompt: string,
    responseMode: ConversationResponseMode,
    startedAt: string,
    structuredSchemaName?: StructuredSchemaName,
    structuredOutputMode?: StartSessionInput['structuredOutputMode'],
  ): ConversationTurn {
    return {
      completedAt: undefined,
      messageId: randomUUID(),
      prompt: prompt.trim(),
      response: '',
      intermediateSegments: [],
      responseMode,
      structuredSchemaName: responseMode === 'structured' ? structuredSchemaName : undefined,
      structuredOutputMode:
        responseMode === 'structured' ? (structuredOutputMode ?? 'normal') : undefined,
      progressHint: undefined,
      result: undefined,
      startedAt,
      status: 'starting',
      turnId: randomUUID(),
    };
  }

  private createModelSelection(input: {
    agent: AgentKind;
    codexModel?: string;
    codexReasoningEffort?: string;
  }): SessionModelSelection | undefined {
    if (input.agent !== 'codex') {
      return undefined;
    }
    const requestedModel = input.codexModel?.trim() || undefined;
    const requestedReasoningEffort = input.codexReasoningEffort?.trim() || undefined;
    if (!requestedModel && !requestedReasoningEffort) {
      return undefined;
    }
    return {
      requestedModel,
      requestedReasoningEffort,
      isRequestedModelEnforced: true,
    };
  }

  private attachRuntimeSession(session: AppSession, runtimeSession: RuntimeSessionHandle) {
    this.runtimeSessions.set(session.appSessionId, runtimeSession);
    session.capabilities = [...runtimeSession.capabilities];
    session.modelSelection = runtimeSession.modelSelection
      ? { ...runtimeSession.modelSelection }
      : session.modelSelection
        ? { ...session.modelSelection }
        : undefined;
    session.providerSessionId = runtimeSession.providerSessionId;
    session.updatedAt = this.now();
  }

  private emitSessionBootstrapEvents(
    session: AppSession,
    status: AppSession['status'] = session.status,
  ) {
    this.emit({
      agent: session.agent,
      appSessionId: session.appSessionId,
      type: 'session.started',
    });
    this.emit({
      appSessionId: session.appSessionId,
      capabilities: [...session.capabilities],
      type: 'session.capabilities',
    });
    this.emit({
      appSessionId: session.appSessionId,
      status,
      type: 'status.changed',
    });
  }

  private restoreRuntimeSession(session: AppSession, persisted: PersistedSession) {
    const runtime = this.runtimes[persisted.agent];
    if (runtime.resumeSession) {
      return runtime.resumeSession({
        appSessionId: session.appSessionId,
        providerSessionId: persisted.providerSessionId,
        cwd: session.cwd,
        emit: (event) => this.handleRuntimeEvent(session.appSessionId, event),
        resumeContext: this.buildResumeContext(persisted),
      });
    }

    return runtime.createSession({
      appSessionId: session.appSessionId,
      cwd: session.cwd,
      emit: (event) => this.handleRuntimeEvent(session.appSessionId, event),
    });
  }

  private buildResumeContext(persisted: PersistedSession): ResumeContext {
    return {
      turns: persisted.turns.flatMap((turn) => {
        const result: ResumeContextTurn[] = [{ role: 'user', content: turn.prompt }];
        if (turn.response) {
          result.push({ role: 'assistant', content: turn.response });
        }
        return result;
      }),
    };
  }

  private getRestoredSessionStatus(persisted: PersistedSession): AppSession['status'] {
    return persisted.turns.at(-1)?.status ?? 'idle';
  }

  private cloneSession(session: AppSession): AgentSessionSnapshot {
    return {
      ...session,
      capabilities: [...session.capabilities],
      finalResult: session.finalResult ? this.cloneResultEnvelope(session.finalResult) : undefined,
      lastError: session.lastError ? { ...session.lastError } : undefined,
      modelSelection: session.modelSelection ? { ...session.modelSelection } : undefined,
      pendingPermissions: session.pendingPermissions.map((permission) =>
        clonePendingPermission(permission),
      ),
      progressHint: session.progressHint ? { ...session.progressHint } : undefined,
      streamBuffer: { ...session.streamBuffer },
      turns: session.turns.map((turn) => ({
        ...turn,
        intermediateSegments: cloneIntermediateSegments(turn.intermediateSegments ?? []),
        progressHint: turn.progressHint ? { ...turn.progressHint } : undefined,
        result: turn.result ? this.cloneResultEnvelope(turn.result) : undefined,
      })),
    };
  }

  private cloneResultEnvelope(result: ResultEnvelope): ResultEnvelope {
    return JSON.parse(JSON.stringify(result)) as ResultEnvelope;
  }

  private persistSession(session: AppSession): void {
    if (!this.sessionStore) {
      return;
    }

    const providerSessionId =
      session.providerSessionId ??
      this.runtimeSessions.get(session.appSessionId)?.providerSessionId;

    if (!providerSessionId) {
      return;
    }

    const persisted = this.buildPersistedSession(session, providerSessionId);
    this.sessionStore.save(persisted);
  }

  private buildPersistedSession(session: AppSession, providerSessionId: string): PersistedSession {
    return {
      appSessionId: session.appSessionId,
      agent: session.agent,
      providerSessionId,
      cwd: session.cwd,
      capabilities: [...session.capabilities],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns
        .filter((t) => t.status === 'completed' || t.status === 'failed')
        .map((t) => ({
          turnId: t.turnId,
          messageId: t.messageId,
          prompt: t.prompt,
          response: t.response,
          responseMode: t.responseMode,
          structuredSchemaName: t.structuredSchemaName,
          structuredOutputMode: t.structuredOutputMode,
          status: t.status as 'completed' | 'failed',
          startedAt: t.startedAt,
          completedAt: t.completedAt,
          result: t.result,
        })),
      finalResult: session.finalResult,
      lastError: session.lastError ? { ...session.lastError } : undefined,
      modelSelection: session.modelSelection,
      resumeSummary: this.buildResumeSummary(session),
      parentAppSessionId: session.parentAppSessionId,
    };
  }

  private buildResumeSummary(session: AppSession): string {
    const firstPrompt = session.turns[0]?.prompt ?? '';
    const promptSummary =
      firstPrompt.length > 100 ? `${firstPrompt.slice(0, 100)}...` : firstPrompt;

    const result = session.finalResult;
    if (!result) {
      return promptSummary;
    }

    if (result.kind === 'richText') {
      const content = result.content;
      const resultSummary = content.length > 200 ? `${content.slice(0, 200)}...` : content;
      return `${promptSummary}\n---\n${resultSummary}`;
    }

    return `${promptSummary}\n---\n${summarizeStructuredResult(result.schemaName, result.data)}`;
  }

  private rehydrateSnapshot(persisted: PersistedSession): AgentSessionSnapshot {
    return {
      appSessionId: persisted.appSessionId,
      agent: persisted.agent,
      cwd: persisted.cwd,
      status: this.getRestoredSessionStatus(persisted),
      capabilities: [...persisted.capabilities],
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      turns: persisted.turns.map((turn) => this.rehydrateTurn(turn)),
      streamBuffer: { content: '', messageId: null },
      finalResult: persisted.finalResult
        ? this.cloneResultEnvelope(persisted.finalResult)
        : undefined,
      lastError: persisted.lastError ? { ...persisted.lastError } : undefined,
      progressHint: undefined,
      modelSelection: persisted.modelSelection ? { ...persisted.modelSelection } : undefined,
      pendingPermissions: [],
      providerSessionId: persisted.providerSessionId,
      parentAppSessionId: persisted.parentAppSessionId,
    };
  }

  private rehydrateFullSession(persisted: PersistedSession): AppSession {
    return {
      appSessionId: persisted.appSessionId,
      agent: persisted.agent,
      cwd: persisted.cwd,
      status: 'starting',
      capabilities: [...persisted.capabilities],
      createdAt: persisted.createdAt,
      updatedAt: this.now(),
      turns: persisted.turns.map((turn) => this.rehydrateTurn(turn)),
      streamBuffer: { content: '', messageId: null },
      finalResult: persisted.finalResult
        ? this.cloneResultEnvelope(persisted.finalResult)
        : undefined,
      lastError: persisted.lastError ? { ...persisted.lastError } : undefined,
      progressHint: undefined,
      modelSelection: persisted.modelSelection ? { ...persisted.modelSelection } : undefined,
      pendingPermissions: [],
      providerSessionId: persisted.providerSessionId,
      parentAppSessionId: persisted.parentAppSessionId,
    };
  }

  private rehydrateTurn(turn: PersistedConversationTurn): ConversationTurn {
    return {
      turnId: turn.turnId,
      messageId: turn.messageId,
      prompt: turn.prompt,
      response: turn.response,
      intermediateSegments: [],
      responseMode: turn.responseMode,
      structuredSchemaName: turn.structuredSchemaName,
      structuredOutputMode: turn.structuredOutputMode,
      status: turn.status,
      startedAt: turn.startedAt,
      completedAt: turn.completedAt,
      progressHint: undefined,
      result: turn.result ? this.cloneResultEnvelope(turn.result) : undefined,
    };
  }

  private assertText(value: string, message: string) {
    if (!value.trim()) {
      throw new Error(message);
    }
  }

  private assertStructuredInput(
    responseMode?: ConversationResponseMode,
    structuredSchemaName?: StructuredSchemaName,
  ) {
    if ((responseMode ?? 'richText') === 'structured' && !structuredSchemaName) {
      throw new Error('structured response では structuredSchemaName が必要です。');
    }
  }

  private resolveSettledWaitersIfReady(appSessionId: string, session: AppSession) {
    if (session.status === 'completed' && !session.finalResult) {
      return;
    }

    if (session.status !== 'completed' && session.status !== 'failed') {
      return;
    }

    const waiters = this.settledWaiters.get(appSessionId);
    if (!waiters || waiters.length === 0) {
      return;
    }

    const snapshot = this.cloneSession(session);
    this.settledWaiters.delete(appSessionId);
    for (const resolve of waiters) {
      resolve(snapshot);
    }
  }

  private now() {
    return new Date().toISOString();
  }
}
