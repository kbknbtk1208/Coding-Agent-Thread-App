import { contextBridge, IpcRendererEvent, ipcRenderer } from 'electron';
import {
  AGENT_IPC_CHANNELS,
  type AgentEventPayload,
  type AgentSessionSnapshot,
  type ContinueConversationInput,
  type ForkSessionInput,
  type ListCodexModelsInput,
  type ListCodexModelsResult,
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
  type AwaitAgentReviewResultInput,
  type AwaitAgentReviewResultResult,
  type AwaitAgentReviewThreadReplyResultInput,
  type AwaitAgentReviewThreadReplyResultResult,
  type AwaitResolveJudgementInput,
  type AwaitResolveJudgementResult,
  type BeginAgentReviewThreadReplyInput,
  type BeginAgentReviewThreadReplyResult,
  type BrowseDirectoryInput,
  type BrowseDirectoryResult,
  type CreateReviewWorkspaceInput,
  type CreateReviewWorkspaceResult,
  type GetAgentReviewRunDetailInput,
  type GetAgentReviewRunDetailResult,
  type GraphAnalysisEvent,
  type InferRepositoryLayerProfileInput,
  type InferRepositoryLayerProfileResult,
  type LayerApplicationEvent,
  type LoadWorkspaceRevisionsInput,
  type LoadWorkspaceRevisionsResult,
  type LoadWorkspaceGraphInput,
  type LoadWorkspaceGraphResult,
  type LoadRepositoryLayerProfileInput,
  type LoadRepositoryLayerProfileResult,
  type RefreshWorkspaceRevisionsInput,
  type RefreshWorkspaceRevisionsResult,
  type RecomputeWorkspaceLayerLayoutInput,
  type RecomputeWorkspaceLayerLayoutResult,
  type ListRepositoryProfilesResult,
  type ListRepositoryProvidersResult,
  type ListAgentReviewRunsInput,
  type ListAgentReviewRunsResult,
  type ListAgentThreadConversationsInput,
  type ListAgentThreadConversationsResult,
  type ListReviewWorkspacesResult,
  type ListWorkspaceCreationJobsResult,
  type LoadNodeCompanionDetailInput,
  type LoadNodeCompanionDetailResult,
  type LoadNodeDetailInput,
  type LoadNodeDetailResult,
  type LoadAgentThreadConversationInput,
  type LoadAgentThreadConversationResult,
  type OpenWorkspaceInEditorInput,
  type OpenWorkspaceInEditorResult,
  POC3_GRAPH_REVIEW_IPC_CHANNELS,
  type RemoveReviewWorkspaceInput,
  type RemoveReviewWorkspaceResult,
  type RetryGraphAnalysisInput,
  type RetryGraphAnalysisResult,
  type RevisionRefreshEvent,
  type ResolveRepositoryProviderInput,
  type ResolveRepositoryProviderResult,
  type ResolveReviewWorkspaceTargetInput,
  type ResolveReviewWorkspaceTargetResult,
  type SaveRepositoryProfileInput,
  type SaveRepositoryProfileResult,
  type SaveRepositoryProviderInput,
  type SaveRepositoryProviderResult,
  type SaveRepositoryLayerProfileInput,
  type SaveRepositoryLayerProfileResult,
  type PreviewRepositoryLayerProfileInput,
  type PreviewRepositoryLayerProfileResult,
  type StartAgentReviewInput,
  type StartAgentReviewResult,
  type StartResolveJudgementInput,
  type StartResolveJudgementResult,
  type SelectWorkspaceRevisionInput,
  type SelectWorkspaceRevisionResult,
  type ListArchivedRemoteThreadsInput,
  type ListArchivedRemoteThreadsResult,
  type ListOutdatedAgentThreadsInput,
  type ListOutdatedAgentThreadsResult,
  type ListResolveJudgementResultsInput,
  type ListResolveJudgementResultsResult,
  type PublishInlineCommentInput,
  type PublishInlineCommentResult,
  type ReplyRemoteCommentInput,
  type ReplyRemoteCommentResult,
  type ResolveAgentThreadInput,
  type ResolveAgentThreadResult,
  type ResolveRemoteThreadInput,
  type ResolveRemoteThreadResult,
  type TestRepositoryProviderInput,
  type TestRepositoryProviderResult,
  type ValidateRepositoryProfileInput,
  type ValidateRepositoryProfileResult,
  type ValidateRepositoryLayerProfileInput,
  type ValidateRepositoryLayerProfileResult,
  type WorkspaceCreationEvent,
  type Poc3AgentReviewEvent,
  type ResolveJudgementEvent,
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
  listCodexModels(input?: ListCodexModelsInput): Promise<ListCodexModelsResult> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.listCodexModels, input);
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
  resolveReviewWorkspaceTarget(
    input: ResolveReviewWorkspaceTargetInput,
  ): Promise<ResolveReviewWorkspaceTargetResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveReviewWorkspaceTarget, input);
  },
  createReviewWorkspace(input: CreateReviewWorkspaceInput): Promise<CreateReviewWorkspaceResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.createReviewWorkspace, input);
  },
  listReviewWorkspaces(): Promise<ListReviewWorkspacesResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listReviewWorkspaces);
  },
  removeReviewWorkspace(input: RemoveReviewWorkspaceInput): Promise<RemoveReviewWorkspaceResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.removeReviewWorkspace, input);
  },
  openWorkspaceInEditor(input: OpenWorkspaceInEditorInput): Promise<OpenWorkspaceInEditorResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.openWorkspaceInEditor, input);
  },
  listWorkspaceCreationJobs(): Promise<ListWorkspaceCreationJobsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listWorkspaceCreationJobs);
  },
  loadWorkspaceGraph(input: LoadWorkspaceGraphInput): Promise<LoadWorkspaceGraphResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadWorkspaceGraph, input);
  },
  retryGraphAnalysis(input: RetryGraphAnalysisInput): Promise<RetryGraphAnalysisResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.retryGraphAnalysis, input);
  },
  loadRepositoryLayerProfile(
    input: LoadRepositoryLayerProfileInput,
  ): Promise<LoadRepositoryLayerProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadRepositoryLayerProfile, input);
  },
  inferRepositoryLayerProfile(
    input: InferRepositoryLayerProfileInput,
  ): Promise<InferRepositoryLayerProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.inferRepositoryLayerProfile, input);
  },
  validateRepositoryLayerProfile(
    input: ValidateRepositoryLayerProfileInput,
  ): Promise<ValidateRepositoryLayerProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.validateRepositoryLayerProfile, input);
  },
  saveRepositoryLayerProfile(
    input: SaveRepositoryLayerProfileInput,
  ): Promise<SaveRepositoryLayerProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.saveRepositoryLayerProfile, input);
  },
  previewRepositoryLayerProfile(
    input: PreviewRepositoryLayerProfileInput,
  ): Promise<PreviewRepositoryLayerProfileResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.previewRepositoryLayerProfile, input);
  },
  recomputeWorkspaceLayerLayout(
    input: RecomputeWorkspaceLayerLayoutInput,
  ): Promise<RecomputeWorkspaceLayerLayoutResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.recomputeWorkspaceLayerLayout, input);
  },
  loadWorkspaceRevisions(
    input: LoadWorkspaceRevisionsInput,
  ): Promise<LoadWorkspaceRevisionsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadWorkspaceRevisions, input);
  },
  refreshWorkspaceRevisions(
    input: RefreshWorkspaceRevisionsInput,
  ): Promise<RefreshWorkspaceRevisionsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.refreshWorkspaceRevisions, input);
  },
  selectWorkspaceRevision(
    input: SelectWorkspaceRevisionInput,
  ): Promise<SelectWorkspaceRevisionResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.selectWorkspaceRevision, input);
  },
  loadNodeDetail(input: LoadNodeDetailInput): Promise<LoadNodeDetailResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadNodeDetail, input);
  },
  loadNodeCompanionDetail(
    input: LoadNodeCompanionDetailInput,
  ): Promise<LoadNodeCompanionDetailResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadNodeCompanionDetail, input);
  },
  startAgentReview(input: StartAgentReviewInput): Promise<StartAgentReviewResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.startAgentReview, input);
  },
  awaitAgentReviewResult(
    input: AwaitAgentReviewResultInput,
  ): Promise<AwaitAgentReviewResultResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.awaitAgentReviewResult, input);
  },
  listAgentReviewRuns(input: ListAgentReviewRunsInput): Promise<ListAgentReviewRunsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listAgentReviewRuns, input);
  },
  listOutdatedAgentThreads(
    input: ListOutdatedAgentThreadsInput,
  ): Promise<ListOutdatedAgentThreadsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listOutdatedAgentThreads, input);
  },
  getAgentReviewRunDetail(
    input: GetAgentReviewRunDetailInput,
  ): Promise<GetAgentReviewRunDetailResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.getAgentReviewRunDetail, input);
  },
  respondAgentReviewPermission(input: RespondPermissionInput): Promise<void> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.respondAgentReviewPermission, input);
  },
  beginAgentReviewThreadReply(
    input: BeginAgentReviewThreadReplyInput,
  ): Promise<BeginAgentReviewThreadReplyResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.beginAgentReviewThreadReply, input);
  },
  awaitAgentReviewThreadReplyResult(
    input: AwaitAgentReviewThreadReplyResultInput,
  ): Promise<AwaitAgentReviewThreadReplyResultResult> {
    return ipcRenderer.invoke(
      POC3_GRAPH_REVIEW_IPC_CHANNELS.awaitAgentReviewThreadReplyResult,
      input,
    );
  },
  loadAgentThreadConversation(
    input: LoadAgentThreadConversationInput,
  ): Promise<LoadAgentThreadConversationResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.loadAgentThreadConversation, input);
  },
  listAgentThreadConversations(
    input: ListAgentThreadConversationsInput,
  ): Promise<ListAgentThreadConversationsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listAgentThreadConversations, input);
  },
  listArchivedRemoteThreads(
    input: ListArchivedRemoteThreadsInput,
  ): Promise<ListArchivedRemoteThreadsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listArchivedRemoteThreads, input);
  },
  publishInlineComment(input: PublishInlineCommentInput): Promise<PublishInlineCommentResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.publishInlineComment, input);
  },
  replyRemoteComment(input: ReplyRemoteCommentInput): Promise<ReplyRemoteCommentResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.replyRemoteComment, input);
  },
  resolveAgentThread(input: ResolveAgentThreadInput): Promise<ResolveAgentThreadResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveAgentThread, input);
  },
  resolveRemoteThread(input: ResolveRemoteThreadInput): Promise<ResolveRemoteThreadResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveRemoteThread, input);
  },
  startResolveJudgement(input: StartResolveJudgementInput): Promise<StartResolveJudgementResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.startResolveJudgement, input);
  },
  awaitResolveJudgementResult(
    input: AwaitResolveJudgementInput,
  ): Promise<AwaitResolveJudgementResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.awaitResolveJudgementResult, input);
  },
  listResolveJudgementResults(
    input: ListResolveJudgementResultsInput,
  ): Promise<ListResolveJudgementResultsResult> {
    return ipcRenderer.invoke(POC3_GRAPH_REVIEW_IPC_CHANNELS.listResolveJudgementResults, input);
  },
  onWorkspaceCreationEvent(callback: (event: WorkspaceCreationEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: WorkspaceCreationEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.workspaceCreationEvent, subscription);
    return () => {
      ipcRenderer.removeListener(
        POC3_GRAPH_REVIEW_IPC_CHANNELS.workspaceCreationEvent,
        subscription,
      );
    };
  },
  onGraphAnalysisEvent(callback: (event: GraphAnalysisEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: GraphAnalysisEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.graphAnalysisEvent, subscription);
    return () => {
      ipcRenderer.removeListener(POC3_GRAPH_REVIEW_IPC_CHANNELS.graphAnalysisEvent, subscription);
    };
  },
  onLayerApplicationEvent(callback: (event: LayerApplicationEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: LayerApplicationEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.layerApplicationEvent, subscription);
    return () => {
      ipcRenderer.removeListener(
        POC3_GRAPH_REVIEW_IPC_CHANNELS.layerApplicationEvent,
        subscription,
      );
    };
  },
  onRevisionRefreshEvent(callback: (event: RevisionRefreshEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: RevisionRefreshEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.revisionRefreshEvent, subscription);
    return () => {
      ipcRenderer.removeListener(POC3_GRAPH_REVIEW_IPC_CHANNELS.revisionRefreshEvent, subscription);
    };
  },
  onAgentReviewEvent(callback: (event: Poc3AgentReviewEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: Poc3AgentReviewEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.agentReviewEvent, subscription);
    return () => {
      ipcRenderer.removeListener(POC3_GRAPH_REVIEW_IPC_CHANNELS.agentReviewEvent, subscription);
    };
  },
  onResolveJudgementEvent(callback: (event: ResolveJudgementEvent) => void) {
    const subscription = (_event: IpcRendererEvent, payload: ResolveJudgementEvent) =>
      callback(payload);
    ipcRenderer.on(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveJudgementEvent, subscription);
    return () => {
      ipcRenderer.removeListener(
        POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveJudgementEvent,
        subscription,
      );
    };
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
