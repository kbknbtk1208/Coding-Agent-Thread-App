import type { AgentCapability, ProgressHint } from '../../../shared/domain/agent';
import {
  IMPLEMENTATION_CHECKLIST_JSON_SCHEMA,
  buildImplementationChecklistPrompt,
  normalizeImplementationChecklist,
  parseImplementationChecklistResponse,
} from '../../../shared/domain/implementation-checklist';
import { JsonRpcProcess } from '../shared/json-rpc-process';
import type {
  AgentRuntime,
  CreateRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
  SendPromptInput,
} from '../shared/runtime-contracts';

const CODEX_CAPABILITIES: AgentCapability[] = [
  'resumeSession',
  'forkSession',
  'steerActiveTurn',
  'structuredOutput',
];

interface CodexThreadStartResult {
  thread: {
    id: string;
  };
}

interface CodexTurnStartResult {
  turn: {
    id: string;
  };
}

interface CodexTurnContext {
  messageId: string;
  responseMode: SendPromptInput['responseMode'];
  providerTurnId?: string;
  finalText: string;
  nativeStructuredChecklist: ReturnType<typeof normalizeImplementationChecklist> | null;
  isRunning: boolean;
  finalAnswerItemId: string | null;
}

export class CodexRuntime implements AgentRuntime {
  readonly agent = 'codex' as const;

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    let notificationHandler = (_method: string, _params: unknown) => {};
    const client = new JsonRpcProcess('codex.cmd', ['app-server'], input.cwd, (message) =>
      notificationHandler(message.method, message.params),
    );

    await client.request('initialize', {
      clientInfo: {
        name: 'coding-agent-thread-app',
        title: 'Coding Agent Thread App',
        version: '1.0.0',
      },
    });
    client.notify('initialized', {});

    const threadStart = await client.request<CodexThreadStartResult>('thread/start', {
      approvalPolicy: 'never',
      cwd: input.cwd,
      sandbox: 'read-only',
    });

    const session = new CodexRuntimeSession(
      client,
      threadStart.thread.id,
      input.cwd,
      input.emit,
      CODEX_CAPABILITIES,
    );
    notificationHandler = (method, params) => session.handleNotification(method, params);

    return session;
  }
}

class CodexRuntimeSession implements RuntimeSessionHandle {
  readonly agent = 'codex' as const;

  private activeTurn: CodexTurnContext | null = null;

  constructor(
    private readonly client: JsonRpcProcess,
    readonly providerSessionId: string,
    private readonly cwd: string,
    private readonly emit: (event: RuntimeSessionEvent) => void,
    readonly capabilities: AgentCapability[],
  ) {}

  async sendPrompt(input: SendPromptInput): Promise<void> {
    this.activeTurn = {
      messageId: input.messageId,
      responseMode: input.responseMode,
      finalAnswerItemId: null,
      finalText: '',
      nativeStructuredChecklist: null,
      isRunning: false,
    };

    const response = await this.client.request<CodexTurnStartResult>('turn/start', {
      approvalPolicy: 'never',
      cwd: this.cwd,
      input: [
        {
          type: 'text',
          text:
            input.responseMode === 'implementationChecklist'
              ? buildImplementationChecklistPrompt(input.prompt)
              : input.prompt,
        },
      ],
      outputSchema:
        input.responseMode === 'implementationChecklist'
          ? IMPLEMENTATION_CHECKLIST_JSON_SCHEMA
          : undefined,
      sandboxPolicy: {
        access: { type: 'fullAccess' },
        type: 'readOnly',
      },
      threadId: this.providerSessionId,
    });

    if (this.activeTurn) {
      this.activeTurn.providerTurnId = response.turn.id;
    }
  }

  async dispose(): Promise<void> {
    await this.client.dispose();
  }

  handleNotification(method: string, params: unknown) {
    if (method === 'turn/started') {
      this.markRunning();
      return;
    }

    if (method === 'item/started') {
      this.handleItemStarted(params);
      return;
    }

    if (method === 'turn/plan/updated') {
      this.handlePlanUpdated();
      return;
    }

    if (method === 'item/agentMessage/delta') {
      this.handleMessageDelta(params);
      return;
    }

    if (method === 'item/completed') {
      this.handleItemCompleted(params);
      return;
    }

    if (method === 'rawResponseItem/completed') {
      this.handleRawResponseItemCompleted(params);
      return;
    }

    if (method === 'turn/completed') {
      this.handleTurnCompleted(params);
    }
  }

  private handleItemStarted(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const item = this.getRecordValue(params, 'item');
    if (!this.isRecord(item)) {
      return;
    }

    if (
      this.getStringValue(item, 'type') === 'agentMessage' &&
      this.getStringValue(item, 'phase') === 'final_answer'
    ) {
      this.activeTurn.finalAnswerItemId = this.getStringValue(item, 'id') ?? null;
      return;
    }

    const progressHint = this.describeProgressHint(item);
    if (!progressHint) {
      return;
    }

    this.markRunning();
    this.emit({
      messageId: this.activeTurn.messageId,
      progressHint,
      type: 'progress.updated',
    });
  }

  private handlePlanUpdated() {
    if (!this.activeTurn) {
      return;
    }

    this.markRunning();
    this.emit({
      messageId: this.activeTurn.messageId,
      progressHint: {
        kind: 'plan',
        text: '計画を更新しています...',
        updatedAt: new Date().toISOString(),
      },
      type: 'progress.updated',
    });
  }

  private handleMessageDelta(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const itemId = this.getStringValue(params, 'itemId');
    const delta = this.getStringValue(params, 'delta');
    if (!delta) {
      return;
    }

    if (this.activeTurn.finalAnswerItemId && itemId !== this.activeTurn.finalAnswerItemId) {
      return;
    }

    this.markRunning();
    this.activeTurn.finalText += delta;
    this.emit({
      messageId: this.activeTurn.messageId,
      text: delta,
      type: 'message.delta',
    });
  }

  private handleItemCompleted(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const item = this.getRecordValue(params, 'item');
    if (!this.isRecord(item)) {
      return;
    }

    if (
      this.getStringValue(item, 'type') === 'agentMessage' &&
      this.getStringValue(item, 'id') === this.activeTurn.finalAnswerItemId
    ) {
      this.activeTurn.finalText = this.getStringValue(item, 'text') ?? this.activeTurn.finalText;
    }
  }

  private handleRawResponseItemCompleted(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const item = this.getRecordValue(params, 'item');
    if (!this.isRecord(item) || this.getStringValue(item, 'type') !== 'message') {
      return;
    }

    if (this.getStringValue(item, 'phase') !== 'final_answer') {
      return;
    }

    const nativeStructuredChecklist = this.findChecklistCandidate(item);
    if (nativeStructuredChecklist) {
      this.activeTurn.nativeStructuredChecklist = nativeStructuredChecklist;
    }

    const text = this.extractResponseItemText(item);
    if (!text) {
      return;
    }

    this.activeTurn.finalText = text;
    this.markRunning();
  }

  private handleTurnCompleted(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const turn = this.getRecordValue(params, 'turn');
    if (!this.isRecord(turn)) {
      return;
    }

    const status = this.getStringValue(turn, 'status');
    const finalText = this.activeTurn.finalText.trim();
    if (!this.activeTurn.nativeStructuredChecklist) {
      this.activeTurn.nativeStructuredChecklist = this.findChecklistCandidate(turn);
    }

    if (status === 'completed') {
      this.emit({
        messageId: this.activeTurn.messageId,
        type: 'message.completed',
      });
      this.emitResult(this.activeTurn, finalText);
      this.emit({
        status: 'completed',
        type: 'status.changed',
      });
      this.activeTurn = null;
      return;
    }

    this.emit({
      error: {
        code: 'CODEX_TURN_FAILED',
        message: 'Codex turn failed.',
        retryable: false,
      },
      type: 'error',
    });
    this.activeTurn = null;
  }

  private emitResult(turn: CodexTurnContext, finalText: string) {
    if (turn.responseMode === 'implementationChecklist') {
      if (turn.nativeStructuredChecklist) {
        this.emit({
          data: turn.nativeStructuredChecklist,
          fallbackRichText: finalText || undefined,
          schemaName: 'implementation-checklist',
          source: 'codexOutputSchema',
          type: 'result.structured',
        });
        return;
      }

      const parsed = parseImplementationChecklistResponse(finalText);
      if (parsed.ok) {
        this.emit({
          data: parsed.value,
          fallbackRichText: finalText || undefined,
          schemaName: 'implementation-checklist',
          source: 'codexOutputSchema',
          type: 'result.structured',
        });
        return;
      }

      this.emit({
        content: finalText,
        format: 'markdown',
        source: 'structuredParseFallback',
        structuredParseError: this.describeChecklistParseFailure(parsed.reason, true),
        structuredSchemaName: 'implementation-checklist',
        type: 'result.richText',
      });
      return;
    }

    this.emit({
      content: finalText,
      format: 'markdown',
      source: 'richText',
      type: 'result.richText',
    });
  }

  private describeProgressHint(item: Record<string, unknown>): ProgressHint | null {
    const itemId = this.getStringValue(item, 'id') ?? undefined;
    const type = this.getStringValue(item, 'type');
    const updatedAt = new Date().toISOString();

    switch (type) {
      case 'commandExecution':
        return {
          itemId,
          kind: 'command',
          text: this.describeCommandExecution(item),
          updatedAt,
        };
      case 'dynamicToolCall':
      case 'mcpToolCall':
        return {
          itemId,
          kind: 'tool',
          text: this.describeToolCall(item),
          updatedAt,
        };
      case 'fileChange':
        return {
          itemId,
          kind: 'file',
          text: 'ファイル変更を準備しています...',
          updatedAt,
        };
      case 'webSearch':
        return {
          itemId,
          kind: 'search',
          text: this.describeWebSearch(item),
          updatedAt,
        };
      case 'reasoning':
        return {
          itemId,
          kind: 'reasoning',
          text: '考えています...',
          updatedAt,
        };
      case 'plan':
        return {
          itemId,
          kind: 'plan',
          text: '計画を立てています...',
          updatedAt,
        };
      case 'enteredReviewMode':
        return {
          itemId,
          kind: 'review',
          text: 'レビューを開始しています...',
          updatedAt,
        };
      case 'exitedReviewMode':
        return {
          itemId,
          kind: 'review',
          text: 'レビューを終了しています...',
          updatedAt,
        };
      case 'contextCompaction':
        return {
          itemId,
          kind: 'other',
          text: '会話を圧縮しています...',
          updatedAt,
        };
      case 'agentMessage':
        return this.getStringValue(item, 'phase') === 'commentary'
          ? {
              itemId,
              kind: 'other',
              text: '応答をまとめています...',
              updatedAt,
            }
          : null;
      default:
        return null;
    }
  }

  private describeCommandExecution(item: Record<string, unknown>) {
    const command = this.getStringValue(item, 'command');
    if (!command) {
      return 'コマンドを実行しています...';
    }

    return `コマンドを実行しています: ${this.summarizeText(command)}`;
  }

  private describeToolCall(item: Record<string, unknown>) {
    const server = this.getStringValue(item, 'server');
    const tool = this.getStringValue(item, 'tool');
    if (server && tool) {
      return `ツールを呼び出しています: ${server}/${tool}`;
    }
    if (tool) {
      return `ツールを呼び出しています: ${tool}`;
    }

    return 'ツールを呼び出しています...';
  }

  private describeWebSearch(item: Record<string, unknown>) {
    const query = this.getStringValue(item, 'query');
    if (!query) {
      return '検索しています...';
    }

    return `検索しています: ${this.summarizeText(query)}`;
  }

  private summarizeText(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 72) {
      return normalized;
    }

    return `${normalized.slice(0, 69)}...`;
  }

  private markRunning() {
    if (!this.activeTurn || this.activeTurn.isRunning) {
      return;
    }

    this.activeTurn.isRunning = true;
    this.emit({
      status: 'running',
      type: 'status.changed',
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getRecordValue(record: Record<string, unknown>, key: string) {
    return record[key];
  }

  private getStringValue(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private extractResponseItemText(item: Record<string, unknown>) {
    const directText = this.getStringValue(item, 'text');
    if (directText?.trim()) {
      return directText;
    }

    const content = this.getRecordArrayValue(item, 'content');
    if (!content) {
      return null;
    }

    const text = content
      .filter(
        (part) =>
          this.getStringValue(part, 'type') === 'output_text' && this.getStringValue(part, 'text'),
      )
      .map((part) => this.getStringValue(part, 'text') ?? '')
      .join('')
      .trim();

    return text || null;
  }

  private getRecordArrayValue(record: Record<string, unknown>, key: string) {
    const value = record[key];
    if (!Array.isArray(value)) {
      return null;
    }

    return value.filter(this.isRecord);
  }

  private findChecklistCandidate(
    value: unknown,
    depth = 0,
    seen = new Set<unknown>(),
  ): ReturnType<typeof normalizeImplementationChecklist> | null {
    if (depth > 6 || value === null || typeof value !== 'object' || seen.has(value)) {
      return null;
    }

    seen.add(value);
    const direct = normalizeImplementationChecklist(value);
    if (direct) {
      return direct;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested: ReturnType<typeof normalizeImplementationChecklist> | null =
          this.findChecklistCandidate(item, depth + 1, seen);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    for (const nestedValue of Object.values(value)) {
      const nested: ReturnType<typeof normalizeImplementationChecklist> | null =
        this.findChecklistCandidate(nestedValue, depth + 1, seen);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  private describeChecklistParseFailure(reason: string, usesOutputSchema: boolean) {
    switch (reason) {
      case 'emptyResponse':
        return usesOutputSchema
          ? 'Codex の outputSchema 応答が空でした。'
          : 'structured checklist の応答が空でした。';
      case 'schemaValidationFailed':
        return usesOutputSchema
          ? 'Codex の outputSchema 応答は取得できましたが checklist schema に合致しませんでした。'
          : 'JSON は取得できましたが checklist schema に合致しませんでした。';
      case 'jsonParseFailed':
      default:
        return usesOutputSchema
          ? 'Codex の outputSchema 応答を JSON として解釈できませんでした。'
          : 'structured checklist を JSON として解釈できませんでした。';
    }
  }
}
