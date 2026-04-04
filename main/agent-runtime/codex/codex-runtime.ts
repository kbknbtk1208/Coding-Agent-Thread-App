import type {
  AgentCapability,
  PendingPermission,
  PermissionAction,
  ProgressHint,
} from '../../../shared/domain/agent';
import { STRUCTURED_FALLBACK_VERIFICATION_REASON } from '../../../shared/domain/implementation-checklist';
import {
  getStructuredSchemaDescriptor,
  type StructuredSchemaMap,
  type StructuredSchemaName,
} from '../../../shared/domain/structured-schemas';
import { JsonRpcProcess } from '../shared/json-rpc-process';
import type {
  AgentRuntime,
  CreateRuntimeSessionInput,
  ForkRuntimeSessionInput,
  ResumeRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
  SendPromptInput,
  SteerInput,
} from '../shared/runtime-contracts';
import {
  buildCodexFailureError,
  extractCodexTurnFailureDetail,
  type CodexTurnFailureDetail,
} from './codex-turn-failure';

const CODEX_CAPABILITIES: AgentCapability[] = [
  'nativeResumeSession',
  'nativeForkSession',
  'nativeSteerActiveTurn',
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
  structuredSchemaName?: SendPromptInput['structuredSchemaName'];
  structuredOutputMode?: SendPromptInput['structuredOutputMode'];
  usesOutputSchema: boolean;
  providerTurnId?: string;
  finalText: string;
  nativeStructuredResult: StructuredSchemaMap[StructuredSchemaName] | null;
  isRunning: boolean;
  finalAnswerItemId: string | null;
  failureDetail: CodexTurnFailureDetail | null;
  failureEmitted: boolean;
}

interface PendingPermissionState {
  id: number;
  permission: PendingPermission;
  buildResponse: (actionId: string) => unknown;
}

type PermissionDescriptorResult =
  | { kind: 'known'; value: Omit<PendingPermissionState, 'id'> }
  | { kind: 'invalid'; message?: string }
  | { kind: 'unknown' };

export class CodexRuntime implements AgentRuntime {
  readonly agent = 'codex' as const;

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    return this.startSession(input, (client) =>
      client.request<CodexThreadStartResult>('thread/start', {
        approvalPolicy: 'on-request',
        cwd: input.cwd,
        sandbox: 'workspace-write',
      }),
    );
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    return this.startSession(input, (client) =>
      client.request<CodexThreadStartResult>('thread/resume', {
        approvalPolicy: 'on-request',
        cwd: input.cwd,
        sandbox: 'workspace-write',
        threadId: input.providerSessionId,
      }),
    );
  }

  async forkSession(input: ForkRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    return this.startSession(input, (client) =>
      client.request<CodexThreadStartResult>('thread/fork', {
        approvalPolicy: 'on-request',
        cwd: input.cwd,
        sandbox: 'workspace-write',
        threadId: input.providerSessionId,
      }),
    );
  }

  private async startSession(
    input: CreateRuntimeSessionInput | ResumeRuntimeSessionInput | ForkRuntimeSessionInput,
    openThread: (client: JsonRpcProcess) => Promise<CodexThreadStartResult>,
  ): Promise<RuntimeSessionHandle> {
    const { client, setNotificationHandler, setRequestHandler } =
      await this.createInitializedClient(input.cwd);

    try {
      const thread = await openThread(client);

      const session = new CodexRuntimeSession(
        client,
        thread.thread.id,
        input.cwd,
        input.emit,
        CODEX_CAPABILITIES,
      );
      setNotificationHandler((method, params) => session.handleNotification(method, params));
      setRequestHandler((id, method, params) => session.handleRequest(id, method, params));

      return session;
    } catch (error) {
      await client.dispose();
      throw error;
    }
  }

  private async createInitializedClient(cwd: string) {
    let notificationHandler = (_method: string, _params: unknown) => {};
    let requestHandler = (_id: number, _method: string, _params: unknown) => {};
    const client = new JsonRpcProcess(
      'codex.cmd',
      ['app-server'],
      cwd,
      (message) => notificationHandler(message.method, message.params),
      (message) => requestHandler(message.id, message.method, message.params),
    );

    try {
      await client.request('initialize', {
        capabilities: {
          experimentalApi: true,
        },
        clientInfo: {
          name: 'coding-agent-thread-app',
          title: 'Coding Agent Thread App',
          version: '1.0.0',
        },
      });
      client.notify('initialized', {});
    } catch (error) {
      await client.dispose();
      throw error;
    }

    return {
      client,
      setNotificationHandler(handler: typeof notificationHandler) {
        notificationHandler = handler;
      },
      setRequestHandler(handler: typeof requestHandler) {
        requestHandler = handler;
      },
    };
  }
}

class CodexRuntimeSession implements RuntimeSessionHandle {
  readonly agent = 'codex' as const;

  private activeTurn: CodexTurnContext | null = null;
  private readonly pendingPermissions = new Map<string, PendingPermissionState>();

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
      structuredSchemaName: input.structuredSchemaName,
      structuredOutputMode: input.structuredOutputMode,
      usesOutputSchema: shouldUseCodexOutputSchema(input),
      finalAnswerItemId: null,
      finalText: '',
      nativeStructuredResult: null,
      isRunning: false,
      failureDetail: null,
      failureEmitted: false,
    };

    if (input.responseMode === 'structured' && !input.structuredSchemaName) {
      throw new Error('structured response では structuredSchemaName が必要です。');
    }

    const response = await this.client.request<CodexTurnStartResult>(
      'turn/start',
      buildCodexTurnStartRequest({
        cwd: this.cwd,
        input,
        providerSessionId: this.providerSessionId,
      }),
    );

    if (this.activeTurn) {
      this.activeTurn.providerTurnId = response.turn.id;
    }
  }

  async dispose(): Promise<void> {
    for (const requestId of Array.from(this.pendingPermissions.keys())) {
      const pending = this.pendingPermissions.get(requestId);
      const cancelAction = pending?.permission.actions.find((action) => action.kind === 'cancel');
      if (cancelAction) {
        this.respondToPendingPermission(requestId, cancelAction.actionId);
      } else {
        this.clearPendingPermission(requestId);
      }
    }
    await this.client.dispose();
  }

  respondPermission(requestId: string, actionId: string): void {
    if (!this.pendingPermissions.has(requestId)) {
      throw new Error('指定された permission request が見つかりません。');
    }

    this.respondToPendingPermission(requestId, actionId);
  }

  async steer(input: SteerInput): Promise<void> {
    if (!this.activeTurn) {
      throw new Error('アクティブなターンがありません。');
    }
    if (!this.activeTurn.providerTurnId) {
      throw new Error('ターンがまだ初期化されていません。');
    }

    await this.client.request('turn/steer', {
      threadId: this.providerSessionId,
      input: [{ type: 'text', text: input.steerText }],
      expectedTurnId: this.activeTurn.providerTurnId,
    });
  }

  handleRequest(id: number, method: string, params: unknown) {
    const descriptor = this.createPermissionDescriptor(String(id), method, params);
    if (descriptor.kind === 'unknown') {
      this.client.respondError(id, {
        code: -32601,
        message: `Method not found: ${method}`,
      });
      return;
    }
    if (descriptor.kind === 'invalid') {
      this.client.respondError(id, {
        code: -32602,
        message: `Invalid params for ${method}.`,
      });
      return;
    }

    this.pendingPermissions.set(String(id), { ...descriptor.value, id });
    this.emit({
      permission: descriptor.value.permission,
      type: 'permission.requested',
    });
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

    if (method === 'serverRequest/resolved') {
      this.handleServerRequestResolved(params);
      return;
    }

    if (method === 'turn/completed') {
      this.handleTurnCompleted(params);
      return;
    }

    if (method === 'error') {
      this.handleError(params);
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
      updatedAt: new Date().toISOString(),
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

    const nativeStructuredResult = this.findStructuredCandidate(item);
    if (nativeStructuredResult) {
      this.activeTurn.nativeStructuredResult = nativeStructuredResult;
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
    if (!this.activeTurn.nativeStructuredResult) {
      this.activeTurn.nativeStructuredResult = this.findStructuredCandidate(turn);
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

    const failureDetail =
      this.activeTurn.failureDetail ?? extractCodexTurnFailureDetail(turn) ?? null;
    if (!this.activeTurn.failureEmitted) {
      this.activeTurn.failureEmitted = true;
      this.emit({
        error: buildCodexFailureError(failureDetail),
        type: 'error',
      });
    }
    this.activeTurn = null;
  }

  private handleError(params: unknown) {
    if (!this.activeTurn) {
      return;
    }

    const failureDetail = extractCodexTurnFailureDetail(params);
    if (!failureDetail) {
      return;
    }

    this.activeTurn.failureDetail = failureDetail;
    if (this.activeTurn.failureEmitted) {
      return;
    }

    this.activeTurn.failureEmitted = true;
    this.emit({
      error: buildCodexFailureError(failureDetail),
      type: 'error',
    });
  }

  private emitResult(turn: CodexTurnContext, finalText: string) {
    if (turn.responseMode === 'structured' && turn.structuredSchemaName) {
      const descriptor = getStructuredSchemaDescriptor(turn.structuredSchemaName);
      const resultSource = getCodexStructuredResultSource(turn.usesOutputSchema);
      if (turn.structuredOutputMode === 'forceFallback') {
        this.emit({
          content: finalText,
          format: 'markdown',
          source: 'structuredParseFallback',
          structuredParseError: STRUCTURED_FALLBACK_VERIFICATION_REASON,
          structuredSchemaName: turn.structuredSchemaName,
          type: 'result.richText',
        });
        return;
      }

      if (turn.nativeStructuredResult) {
        this.emit({
          data: turn.nativeStructuredResult,
          fallbackRichText: finalText || undefined,
          schemaName: turn.structuredSchemaName,
          source: resultSource,
          type: 'result.structured',
        });
        return;
      }

      const parsed = descriptor.parseText(finalText);
      if (parsed.ok) {
        this.emit({
          data: parsed.value,
          fallbackRichText: finalText || undefined,
          schemaName: turn.structuredSchemaName,
          source: resultSource,
          type: 'result.structured',
        });
        return;
      }

      this.emit({
        content: finalText,
        format: 'markdown',
        source: 'structuredParseFallback',
        structuredParseError: descriptor.describeParseFailure(parsed.reason, {
          usesOutputSchema: turn.usesOutputSchema,
        }),
        structuredParseFailureReason: parsed.reason,
        structuredSchemaName: turn.structuredSchemaName,
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
    return buildCodexPromptText(input);
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

  private handleServerRequestResolved(params: unknown) {
    if (!this.isRecord(params)) {
      return;
    }

    const requestIdValue = this.getRecordValue(params, 'requestId');
    const requestId =
      typeof requestIdValue === 'string' || typeof requestIdValue === 'number'
        ? String(requestIdValue)
        : undefined;
    if (!requestId || !this.pendingPermissions.has(requestId)) {
      return;
    }

    this.pendingPermissions.delete(requestId);
    this.emit({
      requestId,
      type: 'permission.resolved',
    });
  }

  private respondToPendingPermission(requestId: string, actionId: string) {
    const pendingPermission = this.pendingPermissions.get(requestId);
    if (!pendingPermission) {
      return;
    }

    if (!pendingPermission.permission.actions.some((action) => action.actionId === actionId)) {
      throw new Error('指定された permission actionId が見つかりません。');
    }

    this.pendingPermissions.delete(requestId);
    this.client.respond(pendingPermission.id, pendingPermission.buildResponse(actionId));
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

  private createPermissionDescriptor(
    requestId: string,
    method: string,
    params: unknown,
  ): PermissionDescriptorResult {
    switch (method) {
      case 'session/request_permission': {
        const sessionDescriptor = this.createSessionPermissionDescriptor(requestId, method, params);
        return sessionDescriptor
          ? { kind: 'known', value: sessionDescriptor }
          : { kind: 'invalid' };
      }
      case 'item/commandExecution/requestApproval':
        return this.createDecisionPermissionDescriptor(
          requestId,
          method,
          params,
          COMMAND_APPROVAL_FALLBACK_DECISIONS,
        );
      case 'item/fileChange/requestApproval':
        return this.createDecisionPermissionDescriptor(
          requestId,
          method,
          params,
          FILE_CHANGE_FALLBACK_DECISIONS,
        );
      case 'item/permissions/requestApproval': {
        const requestedPermissions = this.extractRequestedPermissions(params);
        if (!requestedPermissions) {
          return { kind: 'invalid' };
        }

        const permissionsDescriptor = this.createPermissionsDescriptor(
          requestId,
          method,
          params,
          requestedPermissions,
        );
        return permissionsDescriptor
          ? { kind: 'known', value: permissionsDescriptor }
          : { kind: 'invalid' };
      }
      case 'tool/requestUserInput':
      case 'item/tool/requestUserInput': {
        const toolDescriptor = this.createToolRequestUserInputDescriptor(requestId, method, params);
        return toolDescriptor ? { kind: 'known', value: toolDescriptor } : { kind: 'invalid' };
      }
      default:
        return { kind: 'unknown' };
    }
  }

  private createSessionPermissionDescriptor(
    requestId: string,
    method: string,
    params: unknown,
  ): Omit<PendingPermissionState, 'id'> | null {
    if (!this.isRecord(params)) {
      return null;
    }

    const responseByActionId = new Map<string, { outcome: { outcome: string } }>();
    const actions: PermissionAction[] = SESSION_PERMISSION_ACTIONS.map((action) => {
      const outcome =
        SESSION_PERMISSION_OUTCOMES[action.actionId as keyof typeof SESSION_PERMISSION_OUTCOMES];
      responseByActionId.set(action.actionId, {
        outcome: { outcome },
      });
      return action;
    });

    return {
      buildResponse: (actionId: string) => {
        const response = responseByActionId.get(actionId);
        if (!response) {
          throw new Error('未知の session permission actionId です。');
        }
        return response;
      },
      permission: {
        actions,
        method,
        payload: params,
        requestId,
      },
    };
  }

  private createDecisionPermissionDescriptor(
    requestId: string,
    method: string,
    params: unknown,
    fallbackDecisions: readonly unknown[],
  ): PermissionDescriptorResult {
    if (!this.isRecord(params)) {
      return { kind: 'invalid' };
    }

    const itemId = this.getStringValue(params, 'itemId');
    const threadId = this.getStringValue(params, 'threadId');
    const turnId = this.getStringValue(params, 'turnId');
    if (!itemId || !threadId || !turnId) {
      return { kind: 'invalid' };
    }

    const availableDecisions = this.extractAvailableDecisions(params);
    if (availableDecisions === 'invalid') {
      return { kind: 'invalid' };
    }

    const decisions = availableDecisions ?? [...fallbackDecisions];
    const { actions, responseByActionId } = this.buildDecisionActions(decisions);
    if (actions.length === 0) {
      return { kind: 'invalid' };
    }

    return {
      kind: 'known',
      value: {
        buildResponse: (actionId: string) => {
          const decision = responseByActionId.get(actionId);
          if (decision === undefined) {
            throw new Error('未知の approval actionId です。');
          }
          return { decision };
        },
        permission: {
          actions,
          itemId,
          method,
          payload: params,
          requestId,
          turnId,
        },
      },
    };
  }

  private createPermissionsDescriptor(
    requestId: string,
    method: string,
    params: unknown,
    requestedPermissions: Record<string, unknown>,
  ): Omit<PendingPermissionState, 'id'> | null {
    if (!this.isRecord(params)) {
      return null;
    }

    const itemId = this.getStringValue(params, 'itemId');
    const threadId = this.getStringValue(params, 'threadId');
    const turnId = this.getStringValue(params, 'turnId');
    if (!itemId || !threadId || !turnId) {
      return null;
    }

    return {
      buildResponse: (actionId: string) => {
        switch (actionId) {
          case 'allow':
            return { permissions: requestedPermissions, scope: 'turn' };
          case 'deny':
            return { permissions: {}, scope: 'turn' };
          default:
            throw new Error('未知の permissions approval actionId です。');
        }
      },
      permission: {
        actions: PERMISSIONS_APPROVAL_ACTIONS,
        itemId,
        method,
        payload: params,
        requestId,
        turnId,
      },
    };
  }

  private createToolRequestUserInputDescriptor(
    requestId: string,
    method: string,
    params: unknown,
  ): Omit<PendingPermissionState, 'id'> | null {
    if (!this.isRecord(params)) {
      return null;
    }

    const itemId = this.getStringValue(params, 'itemId');
    const threadId = this.getStringValue(params, 'threadId');
    const turnId = this.getStringValue(params, 'turnId');
    const questions = this.getArrayValue(params, 'questions');
    if (!questions || questions.length !== 1) {
      return null;
    }

    const question = questions[0];
    if (!this.isRecord(question)) {
      return null;
    }

    const questionId = this.getStringValue(question, 'id');
    const options = this.getArrayValue(question, 'options');
    if (!questionId || !options || options.length === 0) {
      return null;
    }

    const responseByActionId = new Map<string, string>();
    const actions: PermissionAction[] = [];
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!this.isRecord(option)) {
        return null;
      }

      const label = this.getStringValue(option, 'label');
      if (!label) {
        return null;
      }

      const actionId = `tool-option:${String(index + 1)}`;
      responseByActionId.set(actionId, label);
      actions.push({
        actionId,
        kind: this.classifyPermissionActionKind(label),
        label,
      });
    }

    return {
      buildResponse: (actionId: string) => {
        const selectedLabel = responseByActionId.get(actionId);
        if (!selectedLabel) {
          throw new Error('未知の tool/requestUserInput actionId です。');
        }

        return {
          answers: {
            [questionId]: {
              answers: [selectedLabel],
            },
          },
        };
      },
      permission: {
        actions,
        itemId,
        method,
        payload: params,
        requestId,
        threadId,
        turnId,
      },
    };
  }

  private buildDecisionActions(decisions: unknown[]) {
    const responseByActionId = new Map<string, unknown>();
    const actions: PermissionAction[] = [];
    for (let index = 0; index < decisions.length; index += 1) {
      const decision = decisions[index];
      if (!this.isValidDecisionValue(decision)) {
        return { actions: [], responseByActionId };
      }
      const actionId = `decision:${String(index + 1)}`;
      responseByActionId.set(actionId, decision);
      actions.push({
        actionId,
        kind: this.describeDecisionKind(decision),
        label: this.describeDecisionLabel(decision, index),
      });
    }

    return { actions, responseByActionId };
  }

  private describeDecisionKind(decision: unknown): PermissionAction['kind'] {
    if (decision === 'cancel') {
      return 'cancel';
    }
    if (decision === 'decline') {
      return 'reject';
    }
    if (decision === 'accept' || decision === 'acceptForSession') {
      return 'approve';
    }
    if (this.isRecord(decision) && this.getRecordValue(decision, 'acceptWithExecpolicyAmendment')) {
      return 'approve';
    }
    if (this.isRecord(decision) && this.getRecordValue(decision, 'applyNetworkPolicyAmendment')) {
      const payload = this.getRecordValue(decision, 'applyNetworkPolicyAmendment');
      const networkPolicyAmendment = this.isRecord(payload)
        ? this.getRecordValue(payload, 'network_policy_amendment')
        : null;
      const action = this.isRecord(networkPolicyAmendment)
        ? this.getStringValue(networkPolicyAmendment, 'action')
        : undefined;
      return action === 'deny' ? 'reject' : 'approve';
    }
    return 'other';
  }

  private describeDecisionLabel(decision: unknown, index: number) {
    if (decision === 'accept') {
      return 'Allow Once';
    }
    if (decision === 'acceptForSession') {
      return 'Allow for Session';
    }
    if (decision === 'decline') {
      return 'Decline';
    }
    if (decision === 'cancel') {
      return 'Cancel';
    }
    if (this.isRecord(decision)) {
      if (this.getRecordValue(decision, 'acceptWithExecpolicyAmendment')) {
        return 'Allow with suggested policy';
      }
      if (this.getRecordValue(decision, 'applyNetworkPolicyAmendment')) {
        const payload = this.getRecordValue(decision, 'applyNetworkPolicyAmendment');
        const networkPolicyAmendment = this.isRecord(payload)
          ? this.getRecordValue(payload, 'network_policy_amendment')
          : null;
        if (
          this.isRecord(networkPolicyAmendment) &&
          this.getStringValue(networkPolicyAmendment, 'action') === 'deny'
        ) {
          return 'Deny with suggested network policy';
        }
        return 'Allow with suggested network policy';
      }
    }

    return `Action ${String(index + 1)}`;
  }

  private classifyPermissionActionKind(label: string): PermissionAction['kind'] {
    if (/cancel/i.test(label)) {
      return 'cancel';
    }
    if (/(decline|deny|reject)/i.test(label)) {
      return 'reject';
    }
    if (/(accept|allow)/i.test(label)) {
      return 'approve';
    }
    return 'other';
  }

  private extractRequestedPermissions(params: unknown) {
    if (!this.isRecord(params)) {
      return null;
    }

    const permissions = this.getRecordValue(params, 'permissions');
    return this.isRecord(permissions) ? permissions : null;
  }

  private extractAvailableDecisions(record: Record<string, unknown>): unknown[] | null | 'invalid' {
    const availableDecisions = this.getRecordValue(record, 'availableDecisions');
    if (availableDecisions === undefined || availableDecisions === null) {
      return null;
    }
    if (!Array.isArray(availableDecisions)) {
      return 'invalid' as const;
    }

    return availableDecisions as unknown[];
  }

  private isValidDecisionValue(decision: unknown) {
    if (
      decision === 'accept' ||
      decision === 'acceptForSession' ||
      decision === 'decline' ||
      decision === 'cancel'
    ) {
      return true;
    }

    if (!this.isRecord(decision)) {
      return false;
    }

    const keys = Object.keys(decision);
    if (keys.length !== 1) {
      return false;
    }

    if (keys[0] === 'acceptWithExecpolicyAmendment') {
      const payload = this.getRecordValue(decision, 'acceptWithExecpolicyAmendment');
      return (
        this.isRecord(payload) &&
        Array.isArray(this.getRecordValue(payload, 'execpolicy_amendment'))
      );
    }

    if (keys[0] === 'applyNetworkPolicyAmendment') {
      const payload = this.getRecordValue(decision, 'applyNetworkPolicyAmendment');
      const networkPolicyAmendment = this.isRecord(payload)
        ? this.getRecordValue(payload, 'network_policy_amendment')
        : null;
      return (
        this.isRecord(networkPolicyAmendment) &&
        this.getStringValue(networkPolicyAmendment, 'host') !== undefined &&
        (this.getStringValue(networkPolicyAmendment, 'action') === 'allow' ||
          this.getStringValue(networkPolicyAmendment, 'action') === 'deny')
      );
    }

    return false;
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

  private getArrayValue(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return Array.isArray(value) ? value : null;
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

  private findStructuredCandidate(
    value: unknown,
    depth = 0,
    seen = new Set<unknown>(),
  ): StructuredSchemaMap[StructuredSchemaName] | null {
    if (depth > 6 || value === null || typeof value !== 'object' || seen.has(value)) {
      return null;
    }

    seen.add(value);
    const schemaName = this.activeTurn?.structuredSchemaName;
    if (!schemaName) {
      return null;
    }

    const direct = getStructuredSchemaDescriptor(schemaName).normalize(value);
    if (direct) {
      return direct;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.findStructuredCandidate(item, depth + 1, seen);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    for (const nestedValue of Object.values(value)) {
      const nested = this.findStructuredCandidate(nestedValue, depth + 1, seen);
      if (nested) {
        return nested;
      }
    }

    return null;
  }
}

export function shouldUseCodexOutputSchema(
  input: Pick<SendPromptInput, 'responseMode' | 'structuredSchemaName' | 'structuredOutputMode'>,
) {
  return (
    input.responseMode === 'structured' &&
    Boolean(input.structuredSchemaName) &&
    input.structuredOutputMode !== 'forceFallback' &&
    input.structuredSchemaName !== 'review-draft'
  );
}

export function getCodexStructuredResultSource(usesOutputSchema: boolean) {
  return usesOutputSchema ? 'codexOutputSchema' : 'promptedJson';
}

export function buildCodexPromptText(input: SendPromptInput) {
  if (input.responseMode !== 'structured' || !input.structuredSchemaName) {
    return input.prompt;
  }

  const descriptor = getStructuredSchemaDescriptor(input.structuredSchemaName);
  return input.structuredOutputMode === 'forceFallback'
    ? descriptor.buildForcedFallbackPrompt(input.prompt)
    : descriptor.buildPrompt(input.prompt);
}

export function buildCodexTurnStartRequest(args: {
  cwd: string;
  providerSessionId: string;
  input: SendPromptInput;
}) {
  const usesOutputSchema = shouldUseCodexOutputSchema(args.input);

  return {
    approvalPolicy: 'on-request',
    cwd: args.cwd,
    input: [
      {
        type: 'text' as const,
        text: buildCodexPromptText(args.input),
      },
    ],
    outputSchema:
      usesOutputSchema && args.input.structuredSchemaName
        ? getStructuredSchemaDescriptor(args.input.structuredSchemaName).jsonSchema
        : undefined,
    sandboxPolicy: {
      networkAccess: false,
      readOnlyAccess: { type: 'fullAccess' as const },
      type: 'workspaceWrite' as const,
      writableRoots: [args.cwd],
    },
    threadId: args.providerSessionId,
  };
}

const COMMAND_APPROVAL_FALLBACK_DECISIONS = [
  'accept',
  'acceptForSession',
  'decline',
  'cancel',
] as const;

const FILE_CHANGE_FALLBACK_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'] as const;

const SESSION_PERMISSION_ACTIONS: PermissionAction[] = [
  { actionId: 'allow-once', kind: 'approve', label: 'Allow Once' },
  { actionId: 'decline', kind: 'reject', label: 'Decline' },
  { actionId: 'cancel', kind: 'cancel', label: 'Cancel' },
];

const SESSION_PERMISSION_OUTCOMES = {
  'allow-once': 'allowed',
  cancel: 'cancelled',
  decline: 'denied',
} as const;

const PERMISSIONS_APPROVAL_ACTIONS: PermissionAction[] = [
  { actionId: 'allow', kind: 'approve', label: 'Allow' },
  { actionId: 'deny', kind: 'reject', label: 'Deny' },
];
