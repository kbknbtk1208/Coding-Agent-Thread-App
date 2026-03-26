import type { AgentEvent, AgentKind, AppSession } from '../domain/agent';

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
}

export interface SendFollowUpInput {
  appSessionId: string;
  prompt: string;
}

export type AgentSessionSnapshot = AppSession;

export type AgentEventPayload = AgentEvent;
