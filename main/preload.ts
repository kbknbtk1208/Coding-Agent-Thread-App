import { contextBridge, IpcRendererEvent, ipcRenderer } from 'electron';
import {
  AGENT_IPC_CHANNELS,
  type AgentEventPayload,
  type AgentSessionSnapshot,
  type ContinueConversationInput,
  type ForkSessionInput,
  type RespondPermissionInput,
  type SendFollowUpInput,
  type StartSessionInput,
  type SteerActiveTurnInput,
} from '../shared/contracts/agent-ipc';
import {
  type AwaitDraftReviewResultInput,
  type AwaitDraftReviewResultResult,
  type AwaitDraftThreadReplyResultInput,
  type AwaitDraftThreadReplyResultResult,
  type BeginDraftReviewInput,
  type BeginDraftReviewResult,
  type BeginDraftThreadReplyInput,
  type BeginDraftThreadReplyResult,
  type CreateReviewThreadInput,
  type CreateReviewThreadResult,
  type HydrateReviewFileInput,
  type HydrateReviewFileResult,
  type LoadReviewSourceInput,
  type LoadReviewSourceResult,
  type PreparePublishDraftsInput,
  type PreparePublishDraftsResult,
  type PublishDraftsInput,
  type PublishDraftsResult,
  REVIEW_IPC_CHANNELS,
  type ReplyReviewThreadInput,
  type ReplyReviewThreadResult,
  type UpdatePublishDraftsInput,
  type UpdatePublishDraftsResult,
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
  respondPermission(input: RespondPermissionInput): Promise<void> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.respondPermission, input);
  },
};

const reviewApi = {
  loadReviewSource(input: LoadReviewSourceInput): Promise<LoadReviewSourceResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.loadReviewSource, input);
  },
  hydrateReviewFile(input: HydrateReviewFileInput): Promise<HydrateReviewFileResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.hydrateReviewFile, input);
  },
  createThread(input: CreateReviewThreadInput): Promise<CreateReviewThreadResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.createThread, input);
  },
  replyThread(input: ReplyReviewThreadInput): Promise<ReplyReviewThreadResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.replyThread, input);
  },
  beginDraftReview(input: BeginDraftReviewInput): Promise<BeginDraftReviewResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.beginDraftReview, input);
  },
  awaitDraftReviewResult(
    input: AwaitDraftReviewResultInput,
  ): Promise<AwaitDraftReviewResultResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.awaitDraftReviewResult, input);
  },
  beginDraftThreadReply(input: BeginDraftThreadReplyInput): Promise<BeginDraftThreadReplyResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.beginDraftThreadReply, input);
  },
  awaitDraftThreadReplyResult(
    input: AwaitDraftThreadReplyResultInput,
  ): Promise<AwaitDraftThreadReplyResultResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.awaitDraftThreadReplyResult, input);
  },
  preparePublishDrafts(input: PreparePublishDraftsInput): Promise<PreparePublishDraftsResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.preparePublishDrafts, input);
  },
  updatePublishDrafts(input: UpdatePublishDraftsInput): Promise<UpdatePublishDraftsResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.updatePublishDrafts, input);
  },
  publishDrafts(input: PublishDraftsInput): Promise<PublishDraftsResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.publishDrafts, input);
  },
};

contextBridge.exposeInMainWorld('ipc', handler);
contextBridge.exposeInMainWorld('agentApi', agentApi);
contextBridge.exposeInMainWorld('reviewApi', reviewApi);

export type IpcHandler = typeof handler;
export type AgentApi = typeof agentApi;
export type ReviewApi = typeof reviewApi;
