import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AGENT_IPC_CHANNELS,
  type AgentEventPayload,
  type AgentSessionSnapshot,
  type ContinueConversationInput,
  type ForkSessionInput,
  type SendFollowUpInput,
  type StartSessionInput,
  type SteerActiveTurnInput,
} from '../shared/contracts/agent-ipc';
import {
  REVIEW_IPC_CHANNELS,
  type CreateReviewThreadInput,
  type CreateReviewThreadResult,
  type GetReviewDataInput,
  type GetReviewDataResult,
  type ReplyReviewThreadInput,
  type ReplyReviewThreadResult,
} from '../shared/contracts/review-ipc';

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

const agentApi = {
  getDefaultCwd(): Promise<string> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.getDefaultCwd);
  },
  listSessions(): Promise<AgentSessionSnapshot[]> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.listSessions);
  },
  continueConversation(input: ContinueConversationInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.continueConversation, input);
  },
  onAgentEvent(callback: (event: AgentEventPayload) => void) {
    const subscription = (_event: IpcRendererEvent, payload: AgentEventPayload) =>
      callback(payload);
    ipcRenderer.on(AGENT_IPC_CHANNELS.event, subscription);

    return () => {
      ipcRenderer.removeListener(AGENT_IPC_CHANNELS.event, subscription);
    };
  },
  sendFollowUp(input: SendFollowUpInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.sendFollowUp, input);
  },
  startSession(input: StartSessionInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.startSession, input);
  },
  forkSession(input: ForkSessionInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.forkSession, input);
  },
  steerActiveTurn(input: SteerActiveTurnInput): Promise<void> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.steerActiveTurn, input);
  },
};

const reviewApi = {
  getReviewData(input: GetReviewDataInput): Promise<GetReviewDataResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.getReviewData, input);
  },
  createThread(input: CreateReviewThreadInput): Promise<CreateReviewThreadResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.createThread, input);
  },
  replyThread(input: ReplyReviewThreadInput): Promise<ReplyReviewThreadResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.replyThread, input);
  },
};

contextBridge.exposeInMainWorld('ipc', handler);
contextBridge.exposeInMainWorld('agentApi', agentApi);
contextBridge.exposeInMainWorld('reviewApi', reviewApi);

export type IpcHandler = typeof handler;
export type AgentApi = typeof agentApi;
export type ReviewApi = typeof reviewApi;
