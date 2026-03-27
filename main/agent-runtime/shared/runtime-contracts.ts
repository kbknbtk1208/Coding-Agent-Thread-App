import type {
  AgentCapability,
  AgentKind,
  AgentStatus,
  SessionModelSelection,
} from '../../../shared/domain/agent';

export type RuntimeSessionEvent =
  | { type: 'status.changed'; status: AgentStatus }
  | { type: 'message.delta'; messageId: string; text: string }
  | { type: 'message.completed'; messageId: string }
  | {
      type: 'result.richText';
      format: 'markdown';
      content: string;
    }
  | {
      type: 'permission.requested';
      requestId: string;
      payload: unknown;
    }
  | {
      type: 'error';
      error: { code: string; message: string; retryable: boolean };
    };

export interface SendPromptInput {
  messageId: string;
  prompt: string;
}

export interface RuntimeSessionHandle {
  agent: AgentKind;
  capabilities: AgentCapability[];
  modelSelection?: SessionModelSelection;
  providerSessionId: string;
  sendPrompt(input: SendPromptInput): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateRuntimeSessionInput {
  appSessionId: string;
  cwd: string;
  emit: (event: RuntimeSessionEvent) => void;
}

export interface AgentRuntime {
  agent: AgentKind;
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle>;
}
