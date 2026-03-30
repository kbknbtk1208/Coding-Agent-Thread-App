import type {
  AgentEvent,
  AgentKind,
  AppSession,
  ConversationResponseMode,
  StructuredOutputMode,
} from '../domain/agent';

export const AGENT_IPC_CHANNELS = {
  continueConversation: 'agent:continue-conversation',
  event: 'agent:event',
  forkSession: 'agent:fork-session',
  getDefaultCwd: 'agent:get-default-cwd',
  listSessions: 'agent:list-sessions',
  sendFollowUp: 'agent:send-follow-up',
  startSession: 'agent:start-session',
} as const;

export interface StartSessionInput {
  agent: AgentKind;
  cwd: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
  structuredOutputMode?: StructuredOutputMode;
}

export interface ContinueConversationInput {
  appSessionId: string;
}

export interface SendFollowUpInput {
  appSessionId: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
  structuredOutputMode?: StructuredOutputMode;
}

export interface ForkSessionInput {
  appSessionId: string;
}

export type AgentSessionSnapshot = AppSession;

export type AgentEventPayload = AgentEvent;
