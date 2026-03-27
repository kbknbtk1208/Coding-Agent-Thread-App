import {
  IMPLEMENTATION_CHECKLIST_SCHEMA_NAME,
  type ImplementationChecklist,
} from './implementation-checklist';

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

export type ConversationResponseMode = 'richText' | 'implementationChecklist';

export type AgentProgressKind =
  | 'search'
  | 'command'
  | 'file'
  | 'tool'
  | 'reasoning'
  | 'plan'
  | 'review'
  | 'other';

export interface ProgressHint {
  kind: AgentProgressKind;
  text: string;
  itemId?: string;
  updatedAt: string;
}

export type ConversationIntermediateSegmentKind = 'progress' | 'message';

export interface ConversationIntermediateSegment {
  kind: ConversationIntermediateSegmentKind;
  progressKind?: AgentProgressKind;
  segmentId: string;
  text: string;
  updatedAt: string;
}

export type StructuredResultSource = 'codexOutputSchema' | 'promptedJson';

export type RichTextResultSource = 'richText' | 'structuredParseFallback';

export interface RichTextResultEnvelope {
  kind: 'richText';
  format: 'markdown';
  content: string;
  source: RichTextResultSource;
  structuredParseError?: string;
  structuredSchemaName?: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
}

export interface StructuredResultEnvelope {
  kind: 'structured';
  schemaName: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
  data: ImplementationChecklist;
  source: StructuredResultSource;
  fallbackRichText?: string;
}

export type ResultEnvelope = RichTextResultEnvelope | StructuredResultEnvelope;

export interface StreamBuffer {
  messageId: string | null;
  content: string;
}

export interface SessionModelSelection {
  requestedModel?: string;
  isRequestedModelEnforced: boolean;
  warning?: string;
}

export interface ConversationTurn {
  turnId: string;
  messageId: string;
  prompt: string;
  response: string;
  intermediateSegments: ConversationIntermediateSegment[];
  responseMode: ConversationResponseMode;
  status: AgentStatus;
  startedAt: string;
  completedAt?: string;
  progressHint?: ProgressHint;
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
  progressHint?: ProgressHint;
  modelSelection?: SessionModelSelection;
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
      type: 'progress.updated';
      appSessionId: string;
      messageId: string;
      progressHint: ProgressHint;
    }
  | {
      type: 'message.delta';
      appSessionId: string;
      messageId: string;
      text: string;
      updatedAt: string;
    }
  | { type: 'message.completed'; appSessionId: string; messageId: string }
  | {
      type: 'result.structured';
      appSessionId: string;
      schemaName: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
      data: ImplementationChecklist;
      source: StructuredResultSource;
      fallbackRichText?: string;
    }
  | {
      type: 'result.richText';
      appSessionId: string;
      format: 'markdown';
      content: string;
      source: RichTextResultSource;
      structuredParseError?: string;
      structuredSchemaName?: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
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
