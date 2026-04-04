import type {
  StructuredSchemaMap,
  StructuredSchemaName,
  StructuredSchemaParseFailureReason,
} from './structured-schemas/registry';

export type AgentKind = 'codex' | 'copilot';

export type AgentCapability =
  | 'nativeResumeSession'
  | 'nativeForkSession'
  | 'nativeSteerActiveTurn'
  | 'structuredOutput'
  | 'nativeReview';

export type AgentStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed';

export type ConversationResponseMode = 'richText' | 'structured';
export type StructuredOutputMode = 'normal' | 'forceFallback';

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

export interface AgentError {
  code: string;
  message: string;
  retryable: boolean;
  codexErrorInfo?: unknown;
  additionalDetails?: unknown;
}

export interface RichTextResultEnvelope {
  kind: 'richText';
  format: 'markdown';
  content: string;
  source: RichTextResultSource;
  structuredParseError?: string;
  structuredParseFailureReason?: StructuredSchemaParseFailureReason;
  structuredSchemaName?: StructuredSchemaName;
}

export interface StructuredResultEnvelope {
  kind: 'structured';
  schemaName: StructuredSchemaName;
  data: StructuredSchemaMap[StructuredSchemaName];
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

export type PermissionActionKind = 'approve' | 'reject' | 'cancel' | 'other';

export interface PermissionAction {
  actionId: string;
  kind: PermissionActionKind;
  label: string;
}

export interface PendingPermission {
  requestId: string;
  method: string;
  payload: unknown;
  actions: PermissionAction[];
  itemId?: string;
  threadId?: string;
  turnId?: string;
}

export interface ConversationTurn {
  turnId: string;
  messageId: string;
  prompt: string;
  response: string;
  intermediateSegments: ConversationIntermediateSegment[];
  responseMode: ConversationResponseMode;
  structuredSchemaName?: StructuredSchemaName;
  structuredOutputMode?: StructuredOutputMode;
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
  lastError?: AgentError;
  progressHint?: ProgressHint;
  modelSelection?: SessionModelSelection;
  providerSessionId?: string;
  parentAppSessionId?: string;
  pendingPermissions: PendingPermission[];
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
      schemaName: StructuredSchemaName;
      data: StructuredSchemaMap[StructuredSchemaName];
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
      structuredParseFailureReason?: StructuredSchemaParseFailureReason;
      structuredSchemaName?: StructuredSchemaName;
    }
  | {
      type: 'permission.requested';
      appSessionId: string;
      permission: PendingPermission;
    }
  | {
      type: 'permission.resolved';
      appSessionId: string;
      requestId: string;
    }
  | {
      type: 'error';
      appSessionId: string;
      error: AgentError;
    };
