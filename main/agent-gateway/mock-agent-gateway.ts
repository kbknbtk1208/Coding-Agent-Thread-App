import { randomUUID } from 'crypto';
import type {
  AgentCapability,
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

type EmitAgentEvent = (event: AgentEvent) => void;

const RUNNING_DELAY_MS = 250;
const STREAM_INTERVAL_MS = 120;
const CHUNK_SIZE = 26;

const BUSY_STATUSES = ['starting', 'running', 'waiting_permission'] as const;

export class MockAgentGateway {
  private readonly sessions = new Map<string, AppSession>();

  constructor(private readonly emit: EmitAgentEvent) {}

  listSessions(): AgentSessionSnapshot[] {
    return Array.from(this.sessions.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => this.cloneSession(session));
  }

  startSession(input: StartSessionInput): AgentSessionSnapshot {
    this.assertText(input.cwd, '作業ディレクトリを入力してください。');
    this.assertText(input.prompt, 'プロンプトを入力してください。');

    const now = this.now();
    const appSessionId = randomUUID();
    const turn = this.createTurn(input.prompt, input.responseMode ?? 'richText', now);
    const session: AppSession = {
      agent: input.agent,
      appSessionId,
      capabilities: this.getCapabilities(input.agent),
      createdAt: now,
      cwd: input.cwd.trim(),
      status: 'starting',
      streamBuffer: { content: '', messageId: turn.messageId },
      turns: [turn],
      updatedAt: now,
    };

    this.sessions.set(appSessionId, session);
    this.scheduleNewSessionEvents(session);
    this.runTurn(session.appSessionId, turn.turnId);

    return this.cloneSession(session);
  }

  sendFollowUp(input: SendFollowUpInput): AgentSessionSnapshot {
    this.assertText(input.prompt, 'follow-up プロンプトを入力してください。');

    const session = this.sessions.get(input.appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }
    if (BUSY_STATUSES.includes(session.status as (typeof BUSY_STATUSES)[number])) {
      throw new Error('セッション実行中は follow-up を送信できません。');
    }

    const now = this.now();
    const turn = this.createTurn(input.prompt, input.responseMode ?? 'richText', now);
    session.status = 'starting';
    session.finalResult = undefined;
    session.streamBuffer = { content: '', messageId: turn.messageId };
    session.turns = [...session.turns, turn];
    session.updatedAt = now;

    this.emit({
      appSessionId: session.appSessionId,
      status: 'starting',
      type: 'status.changed',
    });
    this.runTurn(session.appSessionId, turn.turnId);

    return this.cloneSession(session);
  }

  private scheduleNewSessionEvents(session: AppSession) {
    setTimeout(() => {
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
    }, 0);
  }

  private runTurn(appSessionId: string, turnId: string) {
    const session = this.sessions.get(appSessionId);
    if (!session) {
      return;
    }
    const turn = session.turns.find((candidate) => candidate.turnId === turnId);
    if (!turn) {
      return;
    }

    const response = this.buildResponse(session, turn.prompt);
    const chunks = this.chunkText(response);

    setTimeout(() => {
      const currentSession = this.sessions.get(appSessionId);
      const currentTurn = currentSession?.turns.find((candidate) => candidate.turnId === turnId);
      if (!currentSession || !currentTurn) {
        return;
      }

      currentSession.status = 'running';
      currentSession.updatedAt = this.now();
      this.emit({
        appSessionId,
        status: 'running',
        type: 'status.changed',
      });

      this.pushChunk(appSessionId, currentTurn.turnId, chunks, 0, response);
    }, RUNNING_DELAY_MS);
  }

  private pushChunk(
    appSessionId: string,
    turnId: string,
    chunks: string[],
    chunkIndex: number,
    response: string,
  ) {
    const session = this.sessions.get(appSessionId);
    const turn = session?.turns.find((candidate) => candidate.turnId === turnId);
    if (!session || !turn) {
      return;
    }

    if (chunkIndex >= chunks.length) {
      const completedAt = this.now();
      const result = {
        content: response,
        format: 'markdown' as const,
        kind: 'richText' as const,
      };

      turn.completedAt = completedAt;
      turn.result = result;
      turn.status = 'completed';
      session.finalResult = result;
      session.status = 'completed';
      session.streamBuffer = { content: '', messageId: null };
      session.updatedAt = completedAt;

      this.emit({
        appSessionId,
        messageId: turn.messageId,
        type: 'message.completed',
      });
      this.emit({
        appSessionId,
        content: response,
        format: 'markdown',
        type: 'result.richText',
      });
      this.emit({
        appSessionId,
        status: 'completed',
        type: 'status.changed',
      });
      return;
    }

    const chunk = chunks[chunkIndex];
    turn.response += chunk;
    turn.status = 'running';
    session.streamBuffer = {
      content: session.streamBuffer.content + chunk,
      messageId: turn.messageId,
    };
    session.updatedAt = this.now();

    this.emit({
      appSessionId,
      messageId: turn.messageId,
      text: chunk,
      type: 'message.delta',
    });

    setTimeout(() => {
      this.pushChunk(appSessionId, turnId, chunks, chunkIndex + 1, response);
    }, STREAM_INTERVAL_MS);
  }

  private buildResponse(session: AppSession, prompt: string): string {
    const providerLabel = session.agent === 'codex' ? 'Codex' : 'GitHub Copilot';
    const turnCount = session.turns.length;

    return [
      `### ${providerLabel} セッション応答`,
      '',
      `- セッションID: \`${session.appSessionId}\``,
      `- ワークスペース: \`${session.cwd}\``,
      `- ターン数: ${turnCount}`,
      '',
      '要点:',
      `1. 受信した依頼: ${prompt.trim()}`,
      '2. UI は `completed` のまま次の follow-up を受け付けます。',
      '3. `awaiting_input` を別状態にせず、1 セッション 1 active turn のまま単純化します。',
      '4. Gateway は provider 差分を隠蔽し、Renderer には正規化イベントだけを渡します。',
    ].join('\n');
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];

    for (let index = 0; index < text.length; index += CHUNK_SIZE) {
      chunks.push(text.slice(index, index + CHUNK_SIZE));
    }

    return chunks;
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

  private getCapabilities(agent: AgentKind): AgentCapability[] {
    if (agent === 'codex') {
      return ['resumeSession', 'forkSession', 'steerActiveTurn', 'structuredOutput'];
    }

    return ['resumeSession', 'structuredOutput'];
  }

  private assertText(value: string, message: string) {
    if (!value.trim()) {
      throw new Error(message);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }
}
