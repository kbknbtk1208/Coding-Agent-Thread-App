import { randomUUID } from 'crypto';
import type {
  AgentEvent,
  AgentKind,
  AppSession,
  ConversationResponseMode,
  ConversationTurn,
  ResultEnvelope,
} from '../../shared/domain/agent';
import {
  applyMessageDeltaToTurn,
  applyProgressHintToTurn,
  cloneIntermediateSegments,
} from '../../shared/domain/intermediate-segments';
import type {
  AgentSessionSnapshot,
  SendFollowUpInput,
  StartSessionInput,
} from '../../shared/contracts/agent-ipc';
import { CodexRuntime } from '../agent-runtime/codex/codex-runtime';
import { CopilotRuntime } from '../agent-runtime/copilot/copilot-runtime';
import type {
  AgentRuntime,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
} from '../agent-runtime/shared/runtime-contracts';
import type { PersistedSession, SessionStore } from './session-store';

type EmitAgentEvent = (event: AgentEvent) => void;

const BUSY_STATUSES = ['starting', 'running', 'waiting_permission'] as const;

export class AgentGateway {
  private readonly sessions = new Map<string, AppSession>();

  private readonly runtimeSessions = new Map<string, RuntimeSessionHandle>();

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

  async startSession(input: StartSessionInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.cwd, '作業ディレクトリを入力してください。');
    this.assertText(input.prompt, 'プロンプトを入力してください。');

    const now = this.now();
    const appSessionId = randomUUID();
    const responseMode = input.responseMode ?? 'richText';
    const turn = this.createTurn(input.prompt, responseMode, now, input.structuredOutputMode);
    const session: AppSession = {
      agent: input.agent,
      appSessionId,
      capabilities: [],
      createdAt: now,
      cwd: input.cwd.trim(),
      status: 'starting',
      progressHint: undefined,
      streamBuffer: { content: '', messageId: turn.messageId },
      turns: [turn],
      updatedAt: now,
    };

    this.sessions.set(appSessionId, session);

    try {
      const runtimeSession = await this.runtimes[input.agent].createSession({
        appSessionId,
        cwd: session.cwd,
        emit: (event) => this.handleRuntimeEvent(appSessionId, event),
      });

      this.runtimeSessions.set(appSessionId, runtimeSession);
      session.capabilities = [...runtimeSession.capabilities];
      session.modelSelection = runtimeSession.modelSelection
        ? { ...runtimeSession.modelSelection }
        : undefined;
      session.providerSessionId = runtimeSession.providerSessionId;
      session.updatedAt = this.now();

      this.persistSession(session);

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
        status: 'starting',
        type: 'status.changed',
      });

      void runtimeSession
        .sendPrompt({
          messageId: turn.messageId,
          prompt: turn.prompt,
          responseMode: turn.responseMode,
          structuredOutputMode: turn.structuredOutputMode,
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

  async sendFollowUp(input: SendFollowUpInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.prompt, 'follow-up プロンプトを入力してください。');

    const session = this.sessions.get(input.appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }
    if (BUSY_STATUSES.includes(session.status as (typeof BUSY_STATUSES)[number])) {
      throw new Error('セッション実行中は follow-up を送信できません。');
    }

    const runtimeSession = this.runtimeSessions.get(input.appSessionId);
    if (!runtimeSession) {
      throw new Error('provider session が初期化されていません。');
    }

    const now = this.now();
    const responseMode = input.responseMode ?? 'richText';
    const turn = this.createTurn(input.prompt, responseMode, now, input.structuredOutputMode);
    session.status = 'starting';
    session.progressHint = undefined;
    session.streamBuffer = { content: '', messageId: turn.messageId };
    session.turns = [...session.turns, turn];
    session.finalResult = undefined;
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
          structuredOutputMode: turn.structuredOutputMode,
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

    switch (event.type) {
      case 'status.changed': {
        const terminalAt =
          event.status === 'completed' || event.status === 'failed' ? this.now() : undefined;
        session.status = event.status;
        session.updatedAt = this.now();
        if (terminalAt) {
          session.progressHint = undefined;
          session.streamBuffer = { content: '', messageId: null };
        }
        if (terminalAt && session.turns.length > 0) {
          const latestTurn = session.turns.at(-1);
          if (latestTurn) {
            latestTurn.completedAt = terminalAt;
            latestTurn.status = event.status;
            latestTurn.progressHint = undefined;
          }
        }
        if (terminalAt) {
          this.persistSession(session);
        }
        break;
      }
      case 'progress.updated': {
        const latestTurn = session.turns.at(-1);
        session.status = 'running';
        session.progressHint = { ...event.progressHint };
        if (latestTurn && latestTurn.messageId === event.messageId) {
          const nextTurn = applyProgressHintToTurn(
            latestTurn,
            event.progressHint,
            event.progressHint.updatedAt,
          );
          nextTurn.status = 'running';
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
          nextTurn.status = 'running';
          session.turns[session.turns.length - 1] = nextTurn;
        }
        session.status = 'running';
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
          structuredSchemaName: event.structuredSchemaName,
        };
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.result = result;
          latestTurn.progressHint = undefined;
        }
        session.finalResult = result;
        session.progressHint = undefined;
        session.updatedAt = this.now();
        this.persistSession(session);
        break;
      }
      case 'result.structured': {
        const result = {
          data: event.data,
          fallbackRichText: event.fallbackRichText,
          kind: 'structured' as const,
          schemaName: event.schemaName,
          source: event.source,
        };
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.result = result;
          latestTurn.progressHint = undefined;
        }
        session.finalResult = result;
        session.progressHint = undefined;
        session.updatedAt = this.now();
        this.persistSession(session);
        break;
      }
      case 'permission.requested': {
        session.status = 'waiting_permission';
        session.progressHint = undefined;
        session.updatedAt = this.now();
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.progressHint = undefined;
          latestTurn.status = 'waiting_permission';
        }
        break;
      }
      case 'error': {
        session.status = 'failed';
        session.progressHint = undefined;
        session.streamBuffer = { content: '', messageId: null };
        session.updatedAt = this.now();
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.completedAt = this.now();
          latestTurn.status = 'failed';
          latestTurn.progressHint = undefined;
        }
        break;
      }
      default:
        break;
    }

    this.emit({
      ...event,
      appSessionId,
    });
  }

  private applyError(appSessionId: string, message: string) {
    const session = this.sessions.get(appSessionId);
    if (!session) {
      return;
    }

    session.status = 'failed';
    session.progressHint = undefined;
    session.streamBuffer = { content: '', messageId: null };
    session.updatedAt = this.now();

    const latestTurn = session.turns.at(-1);
    if (latestTurn) {
      latestTurn.completedAt = this.now();
      latestTurn.status = 'failed';
      latestTurn.progressHint = undefined;
    }

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
    structuredOutputMode?: StartSessionInput['structuredOutputMode'],
  ): ConversationTurn {
    return {
      completedAt: undefined,
      messageId: randomUUID(),
      prompt: prompt.trim(),
      response: '',
      intermediateSegments: [],
      responseMode,
      structuredOutputMode:
        responseMode === 'implementationChecklist' ? (structuredOutputMode ?? 'normal') : undefined,
      progressHint: undefined,
      result: undefined,
      startedAt,
      status: 'starting',
      turnId: randomUUID(),
    };
  }

  private cloneSession(session: AppSession): AgentSessionSnapshot {
    return {
      ...session,
      capabilities: [...session.capabilities],
      finalResult: session.finalResult ? this.cloneResultEnvelope(session.finalResult) : undefined,
      modelSelection: session.modelSelection ? { ...session.modelSelection } : undefined,
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
    if (result.kind === 'richText') {
      return { ...result };
    }

    return {
      ...result,
      data: {
        ...result.data,
        items: result.data.items.map((item) => ({ ...item })),
      },
    };
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
          structuredOutputMode: t.structuredOutputMode,
          status: t.status as 'completed' | 'failed',
          startedAt: t.startedAt,
          completedAt: t.completedAt,
          result: t.result,
        })),
      finalResult: session.finalResult,
      modelSelection: session.modelSelection,
      resumeSummary: this.buildResumeSummary(session),
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

    const itemCount = result.data.items.length;
    return `${promptSummary}\n---\nChecklist: ${String(itemCount)} items`;
  }

  private rehydrateSnapshot(persisted: PersistedSession): AgentSessionSnapshot {
    return {
      appSessionId: persisted.appSessionId,
      agent: persisted.agent,
      cwd: persisted.cwd,
      status: 'completed',
      capabilities: [...persisted.capabilities],
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      turns: persisted.turns.map((t) => ({
        turnId: t.turnId,
        messageId: t.messageId,
        prompt: t.prompt,
        response: t.response,
        intermediateSegments: [],
        responseMode: t.responseMode,
        structuredOutputMode: t.structuredOutputMode,
        status: t.status,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        progressHint: undefined,
        result: t.result,
      })),
      streamBuffer: { content: '', messageId: null },
      finalResult: persisted.finalResult,
      progressHint: undefined,
      modelSelection: persisted.modelSelection,
      providerSessionId: persisted.providerSessionId,
    };
  }

  private assertText(value: string, message: string) {
    if (!value.trim()) {
      throw new Error(message);
    }
  }

  private now() {
    return new Date().toISOString();
  }
}
