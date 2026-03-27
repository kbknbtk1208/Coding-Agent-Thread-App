import type {
  AgentCapability,
  AgentKind,
  AgentStatus,
  ConversationResponseMode,
  RichTextResultSource,
  StructuredResultSource,
  SessionModelSelection,
  ProgressHint,
} from '../../../shared/domain/agent';
import {
  IMPLEMENTATION_CHECKLIST_SCHEMA_NAME,
  type ImplementationChecklist,
} from '../../../shared/domain/implementation-checklist';

export type RuntimeSessionEvent =
  | { type: 'status.changed'; status: AgentStatus }
  | {
      type: 'progress.updated';
      messageId: string;
      progressHint: ProgressHint;
    }
  | { type: 'message.delta'; messageId: string; text: string; updatedAt: string }
  | { type: 'message.completed'; messageId: string }
  | {
      type: 'result.structured';
      schemaName: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
      data: ImplementationChecklist;
      source: StructuredResultSource;
      fallbackRichText?: string;
    }
  | {
      type: 'result.richText';
      format: 'markdown';
      content: string;
      source: RichTextResultSource;
      structuredParseError?: string;
      structuredSchemaName?: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
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
  responseMode: ConversationResponseMode;
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
