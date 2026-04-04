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
import {
  applyMessageDeltaToTurn,
  cloneIntermediateSegments,
} from '../../shared/domain/intermediate-segments';
import type { ImplementationChecklist } from '../../shared/domain/implementation-checklist';
import { STRUCTURED_FALLBACK_VERIFICATION_REASON } from '../../shared/domain/implementation-checklist';
import type { ReviewDraftStructuredResult } from '../../shared/domain/review-draft';
import type { StructuredSchemaName } from '../../shared/domain/structured-schemas';
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

  async awaitSettled(appSessionId: string): Promise<AgentSessionSnapshot> {
    const session = this.sessions.get(appSessionId);
    if (!session) {
      throw new Error('指定されたセッションが見つかりません。');
    }

    if (session.status === 'completed' || session.status === 'failed') {
      return this.cloneSession(session);
    }

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const current = this.sessions.get(appSessionId);
        if (!current) {
          clearInterval(timer);
          return;
        }
        if (current.status === 'completed' || current.status === 'failed') {
          clearInterval(timer);
          resolve(this.cloneSession(current));
        }
      }, 25);
    });
  }

  startSession(input: StartSessionInput): AgentSessionSnapshot {
    this.assertText(input.cwd, '作業ディレクトリを入力してください。');
    this.assertText(input.prompt, 'プロンプトを入力してください。');

    const now = this.now();
    const appSessionId = randomUUID();
    const turn = this.createTurn(
      input.prompt,
      input.responseMode ?? 'richText',
      now,
      input.structuredSchemaName,
      input.structuredOutputMode,
    );
    const session: AppSession = {
      agent: input.agent,
      appSessionId,
      capabilities: this.getCapabilities(input.agent),
      createdAt: now,
      cwd: input.cwd.trim(),
      pendingPermissions: [],
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
    const turn = this.createTurn(
      input.prompt,
      input.responseMode ?? 'richText',
      now,
      input.structuredSchemaName,
      input.structuredOutputMode,
    );
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

    const result = this.buildResultEnvelope(session, turn.prompt);
    const response =
      result.kind === 'structured' ? (result.fallbackRichText ?? '') : result.content;
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

      this.pushChunk(appSessionId, currentTurn.turnId, chunks, 0, result);
    }, RUNNING_DELAY_MS);
  }

  private pushChunk(
    appSessionId: string,
    turnId: string,
    chunks: string[],
    chunkIndex: number,
    result: ResultEnvelope,
  ) {
    const session = this.sessions.get(appSessionId);
    const turn = session?.turns.find((candidate) => candidate.turnId === turnId);
    if (!session || !turn) {
      return;
    }

    if (chunkIndex >= chunks.length) {
      const completedAt = this.now();

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
        ...(result.kind === 'richText'
          ? {
              content: result.content,
              format: result.format,
              source: result.source,
              structuredParseError: result.structuredParseError,
              structuredParseFailureReason: result.structuredParseFailureReason,
              structuredSchemaName: result.structuredSchemaName,
              type: 'result.richText' as const,
            }
          : result.schemaName === 'implementation-checklist'
            ? {
                data: result.data,
                fallbackRichText: result.fallbackRichText,
                schemaName: result.schemaName,
                source: result.source,
                type: 'result.structured' as const,
              }
            : {
                data: result.data,
                fallbackRichText: result.fallbackRichText,
                schemaName: result.schemaName,
                source: result.source,
                type: 'result.structured' as const,
              }),
      });
      this.emit({
        appSessionId,
        status: 'completed',
        type: 'status.changed',
      });
      return;
    }

    const chunk = chunks[chunkIndex];
    const nextTurn = applyMessageDeltaToTurn(turn, session.agent, chunk, this.now());
    nextTurn.status = 'running';
    session.turns = session.turns.map((candidate) =>
      candidate.turnId === turnId ? nextTurn : candidate,
    );
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
      updatedAt: this.now(),
    });

    setTimeout(() => {
      this.pushChunk(appSessionId, turnId, chunks, chunkIndex + 1, result);
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

  private buildResultEnvelope(session: AppSession, prompt: string): ResultEnvelope {
    const latestTurn = session.turns.at(-1);
    if (latestTurn?.responseMode === 'structured' && latestTurn.structuredSchemaName) {
      const schemaName = latestTurn.structuredSchemaName;
      if (session.turns.at(-1)?.structuredOutputMode === 'forceFallback') {
        return {
          content: this.buildResponse(session, prompt),
          format: 'markdown',
          kind: 'richText',
          source: 'structuredParseFallback',
          structuredParseError: STRUCTURED_FALLBACK_VERIFICATION_REASON,
          structuredSchemaName: schemaName,
        };
      }

      if (/fallback|parse failure|parse-fail/i.test(prompt)) {
        const response = this.buildResponse(session, prompt);
        return {
          content: response,
          format: 'markdown',
          kind: 'richText',
          source: 'structuredParseFallback',
          structuredParseError: 'mock で structured result の JSON 化に失敗しました。',
          structuredParseFailureReason: 'jsonParseFailed',
          structuredSchemaName: schemaName,
        };
      }

      if (schemaName === 'implementation-checklist') {
        const checklist = this.buildChecklist(prompt);
        return {
          data: checklist,
          fallbackRichText: JSON.stringify(checklist, null, 2),
          kind: 'structured',
          schemaName,
          source: session.agent === 'codex' ? 'codexOutputSchema' : 'promptedJson',
        };
      }

      const reviewDraft = this.buildReviewDraft(prompt);
      return {
        data: reviewDraft,
        fallbackRichText: JSON.stringify(reviewDraft, null, 2),
        kind: 'structured',
        schemaName,
        source: session.agent === 'codex' ? 'codexOutputSchema' : 'promptedJson',
      };
    }

    const response = this.buildResponse(session, prompt);
    return {
      content: response,
      format: 'markdown',
      kind: 'richText',
      source: 'richText',
    };
  }

  private buildChecklist(prompt: string): ImplementationChecklist {
    const summary = prompt.trim().slice(0, 24) || 'task';

    return {
      type: 'implementation-checklist',
      items: [
        {
          id: '1',
          title: 'Lint と typecheck を先に通す',
          reason: `${summary} の回帰を早く検出するため`,
          priority: 'high',
        },
        {
          id: '2',
          title: 'UI の表示崩れを確認する',
          reason: 'structured result と rich text fallback の両方を見分けるため',
          priority: 'medium',
        },
        {
          id: '3',
          title: 'Playwright で主要導線を確認する',
          reason: '実行後の動作確認を機械的に残すため',
          priority: 'low',
        },
      ],
    };
  }

  private buildReviewDraft(prompt: string): ReviewDraftStructuredResult {
    const summary = prompt.trim().slice(0, 24) || 'task';

    return {
      type: 'review-draft',
      summary: {
        headline: '主にテストと保守性の懸念があります',
        overview: `${summary} を見る限り、変更意図は読み取れますが回帰検知が弱いです。`,
        positives: ['責務分離は比較的明確です'],
        risks: ['テスト不足で回帰を見逃す恐れがあります'],
      },
      findings: [
        {
          findingId: 'finding-1',
          title: 'テストケースが不足している',
          body: '分岐追加に対して回帰テストが不足しています。',
          severity: 'high',
          category: 'tests',
          confidence: 'high',
          suggestion: '主要分岐を単体テストで補強してください。',
          location: {
            kind: 'overview',
          },
        },
      ],
    };
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
      pendingPermissions: session.pendingPermissions.map((permission) => ({
        ...permission,
        actions: permission.actions.map((action) => ({ ...action })),
      })),
      streamBuffer: { ...session.streamBuffer },
      turns: session.turns.map((turn) => ({
        ...turn,
        intermediateSegments: cloneIntermediateSegments(turn.intermediateSegments ?? []),
        result: turn.result ? this.cloneResultEnvelope(turn.result) : undefined,
      })),
    };
  }

  private cloneResultEnvelope(result: ResultEnvelope): ResultEnvelope {
    return JSON.parse(JSON.stringify(result)) as ResultEnvelope;
  }

  private getCapabilities(_agent: AgentKind): AgentCapability[] {
    return ['structuredOutput'];
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
