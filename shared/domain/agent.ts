export type AgentKind = 'codex' | 'copilot';

export type AgentCapability =
  | 'resumeSession'
  | 'forkSession'
  | 'steerActiveTurn'
  | 'structuredOutput'
  | 'nativeReview';

export type AgentStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed';

export interface ResultEnvelope {
  kind: 'richText';
  format: 'markdown';
  content: string;
}

export interface StreamBuffer {
  messageId: string | null;
  content: string;
}

export interface ConversationTurn {
  turnId: string;
  messageId: string;
  prompt: string;
  response: string;
  status: AgentStatus;
  startedAt: string;
  completedAt?: string;
  result?: ResultEnvelope;
}

export interface AppSession {
  appSessionId: string;
  agent: AgentKind;
  cwd: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  createdAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
  streamBuffer: StreamBuffer;
  finalResult?: ResultEnvelope;
}

export type AgentEvent =
  | { type: 'session.started'; appSessionId: string; agent: AgentKind }
  | {
      type: 'session.capabilities';
      appSessionId: string;
      capabilities: AgentCapability[];
    }
  | { type: 'status.changed'; appSessionId: string; status: AgentStatus }
  | {
      type: 'message.delta';
      appSessionId: string;
      messageId: string;
      text: string;
    }
  | { type: 'message.completed'; appSessionId: string; messageId: string }
  | {
      type: 'result.richText';
      appSessionId: string;
      format: 'markdown';
      content: string;
    }
  | {
      type: 'permission.requested';
      appSessionId: string;
      requestId: string;
      payload: unknown;
    }
  | {
      type: 'error';
      appSessionId: string;
      error: { code: string; message: string; retryable: boolean };
    };
