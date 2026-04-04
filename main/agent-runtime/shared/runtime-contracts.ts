import type {
  AgentCapability,
  AgentError,
  AgentKind,
  AgentStatus,
  ConversationResponseMode,
  PendingPermission,
  ProgressHint,
  RichTextResultSource,
  SessionModelSelection,
  StructuredOutputMode,
  StructuredResultEnvelope,
} from '../../../shared/domain/agent';
import type { ResumeContext } from '../../../shared/domain/resume-context';
import type { StructuredSchemaName } from '../../../shared/domain/structured-schemas';

export type RuntimeSessionEvent =
  | { type: 'status.changed'; status: AgentStatus }
  | {
      type: 'progress.updated';
      messageId: string;
      progressHint: ProgressHint;
    }
  | { type: 'message.delta'; messageId: string; text: string; updatedAt: string }
  | { type: 'message.completed'; messageId: string }
  | ({
      type: 'result.structured';
    } & Omit<StructuredResultEnvelope, 'kind'>)
  | {
      type: 'result.richText';
      format: 'markdown';
      content: string;
      source: RichTextResultSource;
      structuredParseError?: string;
      structuredParseFailureReason?: import('../../../shared/domain/structured-schemas').StructuredSchemaParseFailureReason;
      structuredSchemaName?: StructuredSchemaName;
    }
  | {
      type: 'permission.requested';
      permission: PendingPermission;
    }
  | {
      type: 'permission.resolved';
      requestId: string;
    }
  | {
      type: 'error';
      error: AgentError;
    };

export interface SendPromptInput {
  messageId: string;
  prompt: string;
  responseMode: ConversationResponseMode;
  structuredSchemaName?: StructuredSchemaName;
  structuredOutputMode?: StructuredOutputMode;
}

export interface SteerInput {
  steerText: string;
}

export interface RuntimeSessionHandle {
  agent: AgentKind;
  capabilities: AgentCapability[];
  modelSelection?: SessionModelSelection;
  providerSessionId: string;
  sendPrompt(input: SendPromptInput): Promise<void>;
  respondPermission?(requestId: string, actionId: string): Promise<void> | void;
  steer?(input: SteerInput): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateRuntimeSessionInput {
  appSessionId: string;
  cwd: string;
  emit: (event: RuntimeSessionEvent) => void;
}

export interface ResumeRuntimeSessionInput {
  appSessionId: string;
  providerSessionId: string;
  cwd: string;
  emit: (event: RuntimeSessionEvent) => void;
  resumeContext?: ResumeContext;
}

export interface ForkRuntimeSessionInput {
  appSessionId: string;
  providerSessionId: string;
  cwd: string;
  emit: (event: RuntimeSessionEvent) => void;
}

export interface AgentRuntime {
  agent: AgentKind;
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle>;
  resumeSession?(input: ResumeRuntimeSessionInput): Promise<RuntimeSessionHandle>;
  forkSession?(input: ForkRuntimeSessionInput): Promise<RuntimeSessionHandle>;
}
