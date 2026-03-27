import type { AgentCapability } from '../../../shared/domain/agent';
import { JsonRpcProcess } from '../shared/json-rpc-process';
import type {
  AgentRuntime,
  CreateRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionHandle,
  SendPromptInput,
} from '../shared/runtime-contracts';

const COPILOT_CAPABILITIES: AgentCapability[] = ['resumeSession', 'structuredOutput'];

interface CopilotInitializeResult {
  protocolVersion: number;
}

interface CopilotSessionResult {
  sessionId: string;
}

interface CopilotTurnContext {
  messageId: string;
  finalText: string;
  isRunning: boolean;
}

export class CopilotRuntime implements AgentRuntime {
  readonly agent = 'copilot' as const;

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> {
    let notificationHandler = (_method: string, _params: unknown) => {};
    let requestHandler = (_id: number, _method: string, _params: unknown) => {};
    const client = new JsonRpcProcess(
      'copilot.cmd',
      ['--acp', '--stdio'],
      input.cwd,
      (message) => notificationHandler(message.method, message.params),
      (message) => requestHandler(message.id, message.method, message.params),
      true,
    );

    await client.request<CopilotInitializeResult>('initialize', {
      clientCapabilities: {},
      protocolVersion: 1,
    });

    const created = await client.request<CopilotSessionResult>('session/new', {
      cwd: input.cwd,
      mcpServers: [],
    });

    const session = new CopilotRuntimeSession(
      client,
      created.sessionId,
      input.emit,
      COPILOT_CAPABILITIES,
    );
    notificationHandler = (method, params) => session.handleNotification(method, params);
    requestHandler = (id, method, params) => session.handleRequest(id, method, params);

    return session;
  }
}

class CopilotRuntimeSession implements RuntimeSessionHandle {
  readonly agent = 'copilot' as const;

  private activeTurn: CopilotTurnContext | null = null;

  constructor(
    private readonly client: JsonRpcProcess,
    readonly providerSessionId: string,
    private readonly emit: (event: RuntimeSessionEvent) => void,
    readonly capabilities: AgentCapability[],
  ) {}

  async sendPrompt(input: SendPromptInput): Promise<void> {
    this.activeTurn = {
      finalText: '',
      isRunning: false,
      messageId: input.messageId,
    };

    const response = await this.client.request<{ stopReason: string }>('session/prompt', {
      prompt: [{ type: 'text', text: input.prompt }],
      sessionId: this.providerSessionId,
    });

    const finalText = this.activeTurn?.finalText ?? '';
    this.emit({
      messageId: input.messageId,
      type: 'message.completed',
    });
    this.emit({
      content: finalText,
      format: 'markdown',
      type: 'result.richText',
    });
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
    await this.client.dispose();
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
    });
  }

  handleRequest(id: number, method: string, params: unknown) {
    if (method !== 'session/request_permission') {
      return;
    }

    this.emit({
      payload: params,
      requestId: String(id),
      type: 'permission.requested',
    });
    this.client.respond(id, {
      outcome: { outcome: 'cancelled' },
    });
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
