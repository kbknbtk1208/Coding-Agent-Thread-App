import { randomUUID } from 'crypto';
import type {
  AgentEvent,
  AgentKind,
  AppSession,
  ConversationResponseMode,
  ConversationTurn,
  ResultEnvelope,
} from '../../shared/domain/agent';
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

type EmitAgentEvent = (event: AgentEvent) => void;

const BUSY_STATUSES = ['starting', 'running', 'waiting_permission'] as const;

export class AgentGateway {
  private readonly sessions = new Map<string, AppSession>();

  private readonly runtimeSessions = new Map<string, RuntimeSessionHandle>();

  private readonly runtimes: Record<AgentKind, AgentRuntime> = {
    codex: new CodexRuntime(),
    copilot: new CopilotRuntime(),
  };

  constructor(private readonly emit: EmitAgentEvent) {}

  listSessions(): AgentSessionSnapshot[] {
    return Array.from(this.sessions.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => this.cloneSession(session));
  }

  async startSession(input: StartSessionInput): Promise<AgentSessionSnapshot> {
    this.assertText(input.cwd, '作業ディレクトリを入力してください。');
    this.assertText(input.prompt, 'プロンプトを入力してください。');

    const now = this.now();
    const appSessionId = randomUUID();
    const responseMode = input.responseMode ?? 'richText';
    const turn = this.createTurn(input.prompt, responseMode, now);
    const session: AppSession = {
      agent: input.agent,
      appSessionId,
      capabilities: [],
      createdAt: now,
      cwd: input.cwd.trim(),
      status: 'starting',
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
      session.updatedAt = this.now();

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
    const turn = this.createTurn(input.prompt, responseMode, now);
    session.status = 'starting';
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
        const completedAt = event.status === 'completed' ? this.now() : undefined;
        session.status = event.status;
        session.updatedAt = this.now();
        if (event.status === 'completed' || event.status === 'failed') {
          session.streamBuffer = { content: '', messageId: null };
        }
        if (completedAt && session.turns.length > 0) {
          const latestTurn = session.turns.at(-1);
          if (latestTurn) {
            latestTurn.completedAt = completedAt;
            latestTurn.status = event.status;
          }
        }
        break;
      }
      case 'message.delta': {
        const latestTurn = session.turns.at(-1);
        if (latestTurn && latestTurn.messageId === event.messageId) {
          latestTurn.response += event.text;
          latestTurn.status = 'running';
        }
        session.status = 'running';
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
          latestTurn.response = event.content;
          latestTurn.result = result;
        }
        session.finalResult = result;
        session.updatedAt = this.now();
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
        }
        session.finalResult = result;
        session.updatedAt = this.now();
        break;
      }
      case 'permission.requested': {
        session.status = 'waiting_permission';
        session.updatedAt = this.now();
        break;
      }
      case 'error': {
        session.status = 'failed';
        session.streamBuffer = { content: '', messageId: null };
        session.updatedAt = this.now();
        const latestTurn = session.turns.at(-1);
        if (latestTurn) {
          latestTurn.completedAt = this.now();
          latestTurn.status = 'failed';
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
    session.streamBuffer = { content: '', messageId: null };
    session.updatedAt = this.now();

    const latestTurn = session.turns.at(-1);
    if (latestTurn) {
      latestTurn.completedAt = this.now();
      latestTurn.status = 'failed';
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
  ): ConversationTurn {
    return {
      completedAt: undefined,
      messageId: randomUUID(),
      prompt: prompt.trim(),
      response: '',
      responseMode,
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
      streamBuffer: { ...session.streamBuffer },
      turns: session.turns.map((turn) => ({
        ...turn,
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

  private assertText(value: string, message: string) {
    if (!value.trim()) {
      throw new Error(message);
    }
  }

  private now() {
    return new Date().toISOString();
  }
}
