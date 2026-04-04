import type {
  AgentEvent,
  AgentKind,
  AppSession,
  ConversationResponseMode,
  StructuredOutputMode,
} from '../domain/agent';
import type { StructuredSchemaName } from '../domain/structured-schemas';

export const AGENT_IPC_CHANNELS = {
  continueConversation: 'agent:continue-conversation',
  event: 'agent:event',
  forkSession: 'agent:fork-session',
  getDefaultCwd: 'agent:get-default-cwd',
  listSessions: 'agent:list-sessions',
  respondPermission: 'agent:respond-permission',
  sendFollowUp: 'agent:send-follow-up',
  startSession: 'agent:start-session',
  steerActiveTurn: 'agent:steer-active-turn',
} as const;

export interface StartSessionInput {
  agent: AgentKind;
  cwd: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
  structuredSchemaName?: StructuredSchemaName;
  structuredOutputMode?: StructuredOutputMode;
}

export interface ContinueConversationInput {
  appSessionId: string;
}

export interface SendFollowUpInput {
  appSessionId: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
  structuredSchemaName?: StructuredSchemaName;
  structuredOutputMode?: StructuredOutputMode;
}

export interface ForkSessionInput {
  appSessionId: string;
}

export interface SteerActiveTurnInput {
  appSessionId: string;
  prompt: string;
}

export interface RespondPermissionInput {
  appSessionId: string;
  requestId: string;
  actionId: string;
}

export type AgentSessionSnapshot = AppSession;

export type AgentEventPayload = AgentEvent;
