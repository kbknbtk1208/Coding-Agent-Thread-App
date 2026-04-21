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
  type AwaitSelectionMentionResultInput,
  type AwaitSelectionMentionResultResult,
  type BeginDraftReviewInput,
  type BeginDraftReviewResult,
  type BeginDraftThreadReplyInput,
  type BeginDraftThreadReplyResult,
  type BeginSelectionMentionInput,
  type BeginSelectionMentionResult,
  type CreateReviewThreadInput,
  type CreateReviewThreadResult,
  type HydrateReviewFileInput,
  type HydrateReviewFileResult,
  type LoadReviewSourceInput,
  type LoadReviewSourceResult,
  type PreparePublishDraftsInput,
  type PreparePublishDraftsResult,
  type PromoteSelectionMentionToDraftInput,
  type PromoteSelectionMentionToDraftResult,
  type PublishDraftsInput,
  type PublishDraftsResult,
  REVIEW_IPC_CHANNELS,
  type ReplyReviewThreadInput,
  type ReplyReviewThreadResult,
  type UpdatePublishDraftsInput,
  type UpdatePublishDraftsResult,
} from '../shared/contracts/review-ipc';
import {
  type BrowseDirectoryInput,
  type BrowseDirectoryResult,
  type ListRepositoryProfilesResult,
  type ListRepositoryProvidersResult,
  POC3_GRAPH_REVIEW_IPC_CHANNELS,
  type ResolveRepositoryProviderInput,
  type ResolveRepositoryProviderResult,
  type SaveRepositoryProfileInput,
  type SaveRepositoryProfileResult,
  type SaveRepositoryProviderInput,
  type SaveRepositoryProviderResult,
  type TestRepositoryProviderInput,
  type TestRepositoryProviderResult,
  type ValidateRepositoryProfileInput,
  type ValidateRepositoryProfileResult,
} from '../shared/poc3-contracts/graph-review-ipc';

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
  beginSelectionMention(input: BeginSelectionMentionInput): Promise<BeginSelectionMentionResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.beginSelectionMention, input);
  },
  awaitSelectionMentionResult(
    input: AwaitSelectionMentionResultInput,
  ): Promise<AwaitSelectionMentionResultResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.awaitSelectionMentionResult, input);
  },
  promoteSelectionMentionToDraft(
    input: PromoteSelectionMentionToDraftInput,
  ): Promise<PromoteSelectionMentionToDraftResult> {
    return ipcRenderer.invoke(REVIEW_IPC_CHANNELS.promoteSelectionMentionToDraft, input);
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

const poc3GraphReviewApi = {
  listRepositoryProviders(): Promise<ListRepositoryProvidersResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listRepositoryProviders);
  },
  saveRepositoryProvider(
    input: SaveRepositoryProviderInput,
  ): Promise<SaveRepositoryProviderResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.saveRepositoryProvider, input);
  },
  testRepositoryProvider(
    input: TestRepositoryProviderInput,
  ): Promise<TestRepositoryProviderResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.testRepositoryProvider, input);
  },
  listRepositoryProfiles(): Promise<ListRepositoryProfilesResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listRepositoryProfiles);
  },
  resolveRepositoryProvider(
    input: ResolveRepositoryProviderInput,
  ): Promise<ResolveRepositoryProviderResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveRepositoryProvider, input);
  },
  validateRepositoryProfile(
    input: ValidateRepositoryProfileInput,
  ): Promise<ValidateRepositoryProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.validateRepositoryProfile, input);
  },
  saveRepositoryProfile(input: SaveRepositoryProfileInput): Promise<SaveRepositoryProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.saveRepositoryProfile, input);
  },
  browseDirectory(input: BrowseDirectoryInput): Promise<BrowseDirectoryResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.browseDirectory, input);
  },
};

contextBridge.exposeInMainWorld('ipc', handler);
contextBridge.exposeInMainWorld('agentApi', agentApi);
contextBridge.exposeInMainWorld('reviewApi', reviewApi);
contextBridge.exposeInMainWorld('poc3GraphReviewApi', poc3GraphReviewApi);

export type IpcHandler = typeof handler;
export type AgentApi = typeof agentApi;
export type ReviewApi = typeof reviewApi;
export type Poc3GraphReviewApi = typeof poc3GraphReviewApi;
