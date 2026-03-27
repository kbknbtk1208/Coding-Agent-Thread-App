import type { AgentEvent, AgentKind, AppSession, ConversationResponseMode } from '../domain/agent';

export const AGENT_IPC_CHANNELS = {
  event: 'agent:event',
  listSessions: 'agent:list-sessions',
  sendFollowUp: 'agent:send-follow-up',
  startSession: 'agent:start-session',
} as const;

export interface StartSessionInput {
  agent: AgentKind;
  cwd: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
}

export interface SendFollowUpInput {
  appSessionId: string;
  prompt: string;
  responseMode?: ConversationResponseMode;
}

export type AgentSessionSnapshot = AppSession;

export type AgentEventPayload = AgentEvent;
