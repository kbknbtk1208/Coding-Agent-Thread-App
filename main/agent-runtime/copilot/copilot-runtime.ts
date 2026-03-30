import type {
  AgentCapability,
  PendingPermission,
  PermissionAction,
  SessionModelSelection,
} from '../../../shared/domain/agent';
import {
  STRUCTURED_FALLBACK_VERIFICATION_REASON,
  buildStructuredFallbackVerificationPrompt,
  buildImplementationChecklistPrompt,
  parseImplementationChecklistResponse,
} from '../../../shared/domain/implementation-checklist';
import type { ResumeContext } from '../../../shared/domain/resume-context';
import { JsonRpcProcess } from '../shared/json-rpc-process';
import type {
  AgentRuntime,
  CreateRuntimeSessionInput,
  ResumeRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
  SendPromptInput,
} from '../shared/runtime-contracts';

const COPILOT_CAPABILITIES: AgentCapability[] = ['structuredOutput'];
const COPILOT_BASE_ARGS = ['--acp', '--stdio'] as const;
const COPILOT_REQUESTED_MODEL = 'gpt-5-mini';
const COPILOT_MODEL_FALLBACK_WARNING =
  'gpt-5-mini 固定に失敗したため、Copilot の既定モデルで継続中。Premium 消費の可能性あり。';

interface CopilotInitializeResult {
  protocolVersion: number;
}

interface CopilotSessionResult {
  sessionId: string;
}

interface CopilotBootstrapResult {
  client: JsonRpcProcess;
  sessionId: string;
  modelSelection: SessionModelSelection;
}

interface CopilotTurnContext {
  messageId: string;
  responseMode: SendPromptInput['responseMode'];
  structuredOutputMode?: SendPromptInput['structuredOutputMode'];
  finalText: string;
  isRunning: boolean;
}

interface PendingPermissionState {
  id: number;
  permission: PendingPermission;
  responseByActionId: Map<string, unknown>;
}

export class CopilotRuntime implements AgentRuntime {
  readonly agent = 'copilot' as const;

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    return this.bootstrapSession(input, null);
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    return this.bootstrapSession(input, input.resumeContext ?? null);
  }

  private async bootstrapSession(
    input: CreateRuntimeSessionInput,
    resumeContext: ResumeContext | null,
  ): Promise<RuntimeSessionHandle> {
    let notificationHandler = (_method: string, _params: unknown) => {};
    let requestHandler = (_id: number, _method: string, _params: unknown) => {};

    const createClient = (args: string[]) =>
      new JsonRpcProcess(
        'copilot.cmd',
        args,
        input.cwd,
        (message) => notificationHandler(message.method, message.params),
        (message) => requestHandler(message.id, message.method, message.params),
        true,
      );

    const started = await this.startBootstrappedSession(createClient, input.cwd);

    const session = new CopilotRuntimeSession(
      started.client,
      started.sessionId,
      input.emit,
      COPILOT_CAPABILITIES,
      started.modelSelection,
      resumeContext,
    );
    notificationHandler = (method, params) => session.handleNotification(method, params);
    requestHandler = (id, method, params) => session.handleRequest(id, method, params);

    return session;
  }

  private async startBootstrappedSession(
    createClient: (args: string[]) => JsonRpcProcess,
    cwd: string,
  ): Promise<CopilotBootstrapResult> {
    try {
      return await this.startSessionWithArgs(
        createClient,
        cwd,
        [...COPILOT_BASE_ARGS, '--model', COPILOT_REQUESTED_MODEL],
        {
          requestedModel: COPILOT_REQUESTED_MODEL,
          isRequestedModelEnforced: true,
        },
      );
    } catch (pinError) {
      try {
        return await this.startSessionWithArgs(createClient, cwd, [...COPILOT_BASE_ARGS], {
          requestedModel: COPILOT_REQUESTED_MODEL,
          isRequestedModelEnforced: false,
          warning: COPILOT_MODEL_FALLBACK_WARNING,
        });
      } catch (fallbackError) {
        throw new Error(
          [
            `Copilot session start failed with requested model ${COPILOT_REQUESTED_MODEL}.`,
            `Pin error: ${this.getErrorMessage(pinError)}`,
            `Fallback error: ${this.getErrorMessage(fallbackError)}`,
          ].join(' '),
        );
      }
    }
  }

  private async startSessionWithArgs(
    createClient: (args: string[]) => JsonRpcProcess,
    cwd: string,
    args: string[],
    modelSelection: SessionModelSelection,
  ): Promise<CopilotBootstrapResult> {
    let client: JsonRpcProcess | undefined;

    try {
      client = createClient(args);
      await client.request<CopilotInitializeResult>('initialize', {
        clientCapabilities: {},
        protocolVersion: 1,
      });

      const created = await client.request<CopilotSessionResult>('session/new', {
        cwd,
        mcpServers: [],
      });

      return {
        client,
        modelSelection,
        sessionId: created.sessionId,
      };
    } catch (error) {
      if (client) {
        await client.dispose();
      }
      throw error;
    }
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

class CopilotRuntimeSession implements RuntimeSessionHandle {
  readonly agent = 'copilot' as const;

  private activeTurn: CopilotTurnContext | null = null;
  private readonly pendingPermissions = new Map<string, PendingPermissionState>();
  private resumeContext: ResumeContext | null;

  constructor(
    private readonly client: JsonRpcProcess,
    readonly providerSessionId: string,
    private readonly emit: (event: RuntimeSessionEvent) => void,
    readonly capabilities: AgentCapability[],
    readonly modelSelection: SessionModelSelection,
    resumeContext: ResumeContext | null = null,
  ) {
    this.resumeContext = resumeContext;
  }

  async sendPrompt(input: SendPromptInput): Promise<void> {
    this.activeTurn = {
      finalText: '',
      isRunning: false,
      messageId: input.messageId,
      responseMode: input.responseMode,
      structuredOutputMode: input.structuredOutputMode,
    };

    const basePromptText =
      input.responseMode === 'implementationChecklist' ? this.buildPromptText(input) : input.prompt;

    const promptText = this.consumeResumeContext(basePromptText);

    const response = await this.client.request<{ stopReason: string }>('session/prompt', {
      prompt: [
        {
          type: 'text',
          text: promptText,
        },
      ],
      sessionId: this.providerSessionId,
    });

    const finalText = this.activeTurn?.finalText ?? '';
    this.emit({
      messageId: input.messageId,
      type: 'message.completed',
    });
    this.emitResult(input.responseMode, input.structuredOutputMode, finalText);
    if (response.stopReason === 'end_turn') {
      this.emit({
        status: 'completed',
        type: 'status.changed',
      });
    } else {
      this.emit({
        error: {
          code: 'COPILOT_TURN_FAILED',
          message: `Copilot turn finished with stopReason=${response.stopReason}.`,
          retryable: false,
        },
        type: 'error',
      });
    }
    this.activeTurn = null;
  }

  async dispose(): Promise<void> {
    for (const requestId of Array.from(this.pendingPermissions.keys())) {
      this.clearPendingPermission(requestId);
    }
    await this.client.dispose();
  }

  respondPermission(requestId: string, actionId: string): void {
    if (!this.pendingPermissions.has(requestId)) {
      throw new Error('指定された permission request が見つかりません。');
    }

    this.respondToPendingPermission(requestId, actionId);
  }

  handleNotification(method: string, params: unknown) {
    if (method !== 'session/update' || !this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const update = this.getRecordValue(params, 'update');
    if (!this.isRecord(update)) {
      return;
    }

    this.markRunning();

    if (this.getStringValue(update, 'sessionUpdate') !== 'agent_message_chunk') {
      return;
    }

    const content = this.getRecordValue(update, 'content');
    if (!this.isRecord(content) || this.getStringValue(content, 'type') !== 'text') {
      return;
    }

    const text = this.getStringValue(content, 'text');
    if (!text) {
      return;
    }

    this.activeTurn.finalText += text;
    this.emit({
      messageId: this.activeTurn.messageId,
      text,
      type: 'message.delta',
      updatedAt: new Date().toISOString(),
    });
  }

  handleRequest(id: number, method: string, params: unknown) {
    if (method !== 'session/request_permission') {
      this.client.respondError(id, {
        code: -32601,
        message: `Method not found: ${method}`,
      });
      return;
    }

    if (!this.isRecord(params)) {
      this.client.respondError(id, {
        code: -32602,
        message: `Invalid params for ${method}.`,
      });
      return;
    }

    const requestId = String(id);
    const { permission, responseByActionId } = this.createPermission(requestId, method, params);
    this.pendingPermissions.set(requestId, {
      id,
      permission,
      responseByActionId,
    });
    this.emit({
      permission,
      type: 'permission.requested',
    });
  }

  private emitResult(
    responseMode: SendPromptInput['responseMode'],
    structuredOutputMode: SendPromptInput['structuredOutputMode'],
    finalText: string,
  ) {
    if (responseMode === 'implementationChecklist') {
      if (structuredOutputMode === 'forceFallback') {
        this.emit({
          content: finalText,
          format: 'markdown',
          source: 'structuredParseFallback',
          structuredParseError: STRUCTURED_FALLBACK_VERIFICATION_REASON,
          structuredSchemaName: 'implementation-checklist',
          type: 'result.richText',
        });
        return;
      }

      const parsed = parseImplementationChecklistResponse(finalText);
      if (parsed.ok) {
        this.emit({
          fallbackRichText: finalText,
          data: parsed.value,
          schemaName: 'implementation-checklist',
          source: 'promptedJson',
          type: 'result.structured',
        });
        return;
      }

      this.emit({
        content: finalText,
        format: 'markdown',
        source: 'structuredParseFallback',
        structuredParseError: this.describeChecklistParseFailure(parsed.reason),
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

  private buildPromptText(input: SendPromptInput) {
    if (input.responseMode !== 'implementationChecklist') {
      return input.prompt;
    }

    return input.structuredOutputMode === 'forceFallback'
      ? buildStructuredFallbackVerificationPrompt(input.prompt)
      : buildImplementationChecklistPrompt(input.prompt);
  }

  private consumeResumeContext(promptText: string): string {
    if (!this.resumeContext) {
      return promptText;
    }
    const context = this.resumeContext;
    this.resumeContext = null;
    return this.buildRehydratedPrompt(context, promptText);
  }

  private buildRehydratedPrompt(context: ResumeContext, userPrompt: string): string {
    const historyBlock = context.turns
      .map((t) => (t.role === 'user' ? `[User]: ${t.content}` : `[Assistant]: ${t.content}`))
      .join('\n\n');

    return [
      '以下はこのセッションの以前の会話履歴です。この文脈を踏まえて応答してください。',
      '---',
      historyBlock,
      '---',
      '',
      userPrompt,
    ].join('\n');
  }

  private describeChecklistParseFailure(reason: string) {
    switch (reason) {
      case 'emptyResponse':
        return 'structured checklist の応答が空でした。';
      case 'schemaValidationFailed':
        return 'JSON は取得できましたが checklist schema に合致しませんでした。';
      case 'jsonParseFailed':
      default:
        return 'structured checklist を JSON として解釈できませんでした。';
    }
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

  private respondToPendingPermission(requestId: string, actionId: string) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      return;
    }

    const response = pending.responseByActionId.get(actionId);
    if (response === undefined) {
      throw new Error('指定された permission actionId が見つかりません。');
    }

    this.pendingPermissions.delete(requestId);
    this.client.respond(pending.id, response);
    this.emit({
      requestId,
      type: 'permission.resolved',
    });
  }

  private clearPendingPermission(requestId: string) {
    if (!this.pendingPermissions.has(requestId)) {
      return;
    }

    this.pendingPermissions.delete(requestId);
    this.emit({
      requestId,
      type: 'permission.resolved',
    });
  }

  private createPermission(
    requestId: string,
    method: string,
    params: unknown,
  ): { permission: PendingPermission; responseByActionId: Map<string, unknown> } {
    const actions = this.buildActions();
    const responseByActionId = new Map<string, unknown>([
      ['allow', { outcome: { outcome: 'allowed' } }],
      ['deny', { outcome: { outcome: 'denied' } }],
    ]);

    return {
      permission: {
        actions,
        method,
        payload: params,
        requestId,
      },
      responseByActionId,
    };
  }

  private buildActions(): PermissionAction[] {
    return [
      { actionId: 'allow', kind: 'approve', label: 'Allow' },
      { actionId: 'deny', kind: 'reject', label: 'Deny' },
    ];
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
}
