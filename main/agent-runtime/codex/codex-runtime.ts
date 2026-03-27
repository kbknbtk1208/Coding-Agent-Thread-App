import type { AgentCapability } from '../../../shared/domain/agent';
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
  providerTurnId?: string;
  finalText: string;
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
      finalAnswerItemId: null,
      finalText: '',
      isRunning: false,
    };

    const response = await this.client.request<CodexTurnStartResult>('turn/start', {
      approvalPolicy: 'never',
      cwd: this.cwd,
      input: [{ type: 'text', text: input.prompt }],
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

    if (method === 'item/agentMessage/delta') {
      this.handleMessageDelta(params);
      return;
    }

    if (method === 'item/completed') {
      this.handleItemCompleted(params);
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
    }
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

  private handleTurnCompleted(params: unknown) {
    if (!this.activeTurn || !this.isRecord(params)) {
      return;
    }

    const turn = this.getRecordValue(params, 'turn');
    if (!this.isRecord(turn)) {
      return;
    }

    const status = this.getStringValue(turn, 'status');
    const finalText = this.activeTurn.finalText;

    if (status === 'completed') {
      this.emit({
        messageId: this.activeTurn.messageId,
        type: 'message.completed',
      });
      this.emit({
        content: finalText,
        format: 'markdown',
        type: 'result.richText',
      });
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
}
