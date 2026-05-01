import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewEvent,
  Poc3AgentReviewRun,
  Poc3AgentThreadBinding,
  Poc3AgentThreadConversation,
  Poc3AgentThreadMessage,
  Poc3AgentThreadReplyRecord,
} from '../poc3-domain/agent-review';
import type { AgentKind } from '../domain/agent';
import type { AgentSessionSnapshot, RespondPermissionInput } from '../contracts/agent-ipc';
import type {
  AnalysisRunSnapshot,
  GraphAnalysisEvent,
  GraphWorkspaceView,
} from '../poc3-domain/graph';
import type { NodeDetailSnapshot, NodeDetailViewMode } from '../poc3-domain/node-detail';
import type {
  RevisionRefreshSnapshot,
  WorkspaceRevisionView,
} from '../poc3-domain/revision-commit';
import type { RevisionContext } from '../poc3-domain/revision';
import type { Poc3OutdatedAgentThread } from '../poc3-domain/thread-retention';
import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositoryProfileValidationResult,
  RepositoryProviderConnectionResult,
  RepositoryProviderSecretInput,
  ResolveRepositoryProviderResult,
} from '../poc3-domain/repository';
import type {
  ResolveReviewWorkspaceTargetResult,
  ReviewWorkspaceListItem,
  ReviewWorkspaceCreationJobSnapshot,
  WorkspaceCreationEvent,
} from '../poc3-domain/review-workspace';
import type { ReviewRemoteThread } from '../poc3-domain/source-snapshot';

export type { GraphAnalysisEvent, GraphRenderSnapshot } from '../poc3-domain/graph';
export type {
  OutdatedThreadSummary,
  RevisionCommit,
  RevisionCommitAuthor,
  RevisionCommitRole,
  RevisionCommitView,
  RevisionRefreshSnapshot,
  RevisionRefreshStatus,
  WorkspaceRevisionView,
} from '../poc3-domain/revision-commit';
export type {
  Poc3OutdatedAgentThread,
  Poc3ThreadOutdatedReason,
  Poc3ThreadTracking,
  Poc3ThreadTrackingStatus,
} from '../poc3-domain/thread-retention';
export type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewEvent,
  Poc3AgentReviewLocation,
  Poc3AgentReviewRun,
  Poc3AgentReviewRunStatus,
  Poc3AgentReviewThread,
  Poc3AgentThreadBinding,
  Poc3AgentThreadBindingStrategy,
  Poc3AgentThreadConversation,
  Poc3AgentThreadMessage,
  Poc3AgentThreadMessageRole,
  Poc3AgentThreadMessageSource,
  Poc3AgentThreadReplyRecord,
  Poc3AgentThreadReplyStatus,
} from '../poc3-domain/agent-review';
export type {
  NodeCodeExcerpt,
  NodeDetailDiagnostic,
  NodeDetailViewMode,
  NodeDetailSnapshot,
  NodeDetailSummary,
  NodeDiffSummary,
  NodeDiffExcerpt,
  NodeFileContext,
  NodeFunctionCode,
  NodeRelationItem,
  NodeRelationSummary,
  NodeRemoteThreadSummary,
  NodeThreadSummary,
} from '../poc3-domain/node-detail';
export type {
  ReviewRemoteComment,
  ReviewRemoteCommentAuthor,
  ReviewRemoteThread,
  ReviewRemoteThreadAnchorStatus,
  ReviewRemoteThreadLocation,
} from '../poc3-domain/source-snapshot';
export type { ResolveRepositoryProviderResult } from '../poc3-domain/repository';
export type {
  ResolveReviewWorkspaceTargetResult,
  ReviewWorkspaceListItem,
  ReviewWorkspaceCreationJobSnapshot,
  WorkspaceCreationEvent,
  WorkspaceCreationPhase,
  ReviewWorkspaceCreationJobStatus,
  ReviewWorkspaceTarget,
} from '../poc3-domain/review-workspace';

export interface AgentReviewRunCommitSnapshot {
  revisionId: string;
  headSha: string;
  shortSha: string;
  message: string;
}

export interface AgentReviewRunListItem {
  run: Poc3AgentReviewRun;
  commit: AgentReviewRunCommitSnapshot | null;
}

export interface AgentReviewRunDetail {
  run: Poc3AgentReviewRun;
  envelope: Poc3AgentReviewEnvelope | null;
  commit: AgentReviewRunCommitSnapshot | null;
}

export interface GetAgentReviewRunDetailInput {
  reviewWorkspaceId: string;
  runId: string;
}

export type GetAgentReviewRunDetailResult =
  | {
      ok: true;
      detail: AgentReviewRunDetail;
    }
  | {
      ok: false;
      reason: 'runNotFound' | 'workspaceNotFound';
      message: string;
      detail: null;
    };

export const POC3_GRAPH_REVIEW_IPC_CHANNELS = {
  listRepositoryProviders: 'poc3:repository-provider:list',
  saveRepositoryProvider: 'poc3:repository-provider:save',
  testRepositoryProvider: 'poc3:repository-provider:test',
  listRepositoryProfiles: 'poc3:repository-profile:list',
  resolveRepositoryProvider: 'poc3:repository-profile:resolve-provider',
  validateRepositoryProfile: 'poc3:repository-profile:validate',
  saveRepositoryProfile: 'poc3:repository-profile:save',
  browseDirectory: 'poc3:system:browse-directory',
  resolveReviewWorkspaceTarget: 'poc3:workspace:resolve-review-url',
  createReviewWorkspace: 'poc3:workspace:create',
  listReviewWorkspaces: 'poc3:workspace:list',
  removeReviewWorkspace: 'poc3:workspace:remove',
  listWorkspaceCreationJobs: 'poc3:workspace:creation-job:list',
  workspaceCreationEvent: 'poc3:workspace:creation-job:event',
  loadWorkspaceGraph: 'poc3:graph:load',
  retryGraphAnalysis: 'poc3:graph:analysis:retry',
  graphAnalysisEvent: 'poc3:graph:analysis:event',
  loadWorkspaceRevisions: 'poc3:revision:list',
  refreshWorkspaceRevisions: 'poc3:revision:refresh',
  selectWorkspaceRevision: 'poc3:revision:select',
  revisionRefreshEvent: 'poc3:revision:refresh:event',
  loadNodeDetail: 'poc3:node:load-detail',
  startAgentReview: 'poc3:agent-review:start',
  awaitAgentReviewResult: 'poc3:agent-review:await-result',
  listAgentReviewRuns: 'poc3:agent-review:list-runs',
  listOutdatedAgentThreads: 'poc3:agent-review:outdated-threads:list',
  listArchivedRemoteThreads: 'poc3:remote-comment:archive:list',
  getAgentReviewRunDetail: 'poc3:agent-review:get-run-detail',
  respondAgentReviewPermission: 'poc3:agent-review:permission:respond',
  agentReviewEvent: 'poc3:agent-review:event',
  beginAgentReviewThreadReply: 'poc3:agent-review:thread-reply:begin',
  awaitAgentReviewThreadReplyResult: 'poc3:agent-review:thread-reply:await',
  loadAgentThreadConversation: 'poc3:agent-review:thread-conversation:load',
  listAgentThreadConversations: 'poc3:agent-review:thread-conversation:list',
} as const;

export interface ListRepositoryProvidersResult {
  providers: PublicRepositoryProvider[];
}

export interface SaveRepositoryProviderInput {
  provider: RepositoryProviderSecretInput;
}

export interface SaveRepositoryProviderResult {
  provider: PublicRepositoryProvider;
}

export interface TestRepositoryProviderInput {
  provider: RepositoryProviderSecretInput;
}

export interface TestRepositoryProviderResult {
  result: RepositoryProviderConnectionResult;
}

export interface ListRepositoryProfilesResult {
  profiles: RepositoryProfile[];
}

export interface ResolveRepositoryProviderInput {
  originUrl: string;
}

export interface ValidateRepositoryProfileInput {
  profile: RepositoryProfileInput;
}

export interface ValidateRepositoryProfileResult {
  result: RepositoryProfileValidationResult;
}

export interface SaveRepositoryProfileInput {
  profile: RepositoryProfileInput;
}

export interface SaveRepositoryProfileResult {
  profile: RepositoryProfile;
}

export interface BrowseDirectoryInput {
  title?: string;
  defaultPath?: string;
}

export interface BrowseDirectoryResult {
  canceled: boolean;
  path: string | null;
}

export interface ResolveReviewWorkspaceTargetInput {
  reviewUrl: string;
}

export interface CreateReviewWorkspaceInput {
  reviewUrl: string;
  repositoryProfileId: string;
}

export interface CreateReviewWorkspaceResult {
  job: ReviewWorkspaceCreationJobSnapshot;
}

export interface ListReviewWorkspacesResult {
  workspaces: ReviewWorkspaceListItem[];
}

export interface RemoveReviewWorkspaceInput {
  reviewWorkspaceId: string;
  force?: boolean;
  purgeDbOnly?: boolean;
}

export type RemoveReviewWorkspaceResult =
  | { ok: true; reviewWorkspaceId: string }
  | {
      ok: false;
      reviewWorkspaceId: string;
      reason: 'notFound' | 'forceRequired' | 'lockHeld' | 'gitFailed';
      message: string;
    };

export interface ListWorkspaceCreationJobsResult {
  jobs: ReviewWorkspaceCreationJobSnapshot[];
}

export interface LoadWorkspaceGraphInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
}

export type LoadWorkspaceGraphResult =
  | (GraphWorkspaceView & {
      ok: true;
    })
  | {
      ok: false;
      reason: 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady' | 'analysisFailed';
      message: string;
      analysis: AnalysisRunSnapshot | null;
      revision?: RevisionContext | null;
    };

export interface RetryGraphAnalysisInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
}

export type RetryGraphAnalysisResult =
  | {
      ok: true;
      analysis: AnalysisRunSnapshot;
    }
  | {
      ok: false;
      reason: 'workspaceNotFound' | 'revisionNotFound' | 'enqueueFailed';
      message: string;
      analysis: AnalysisRunSnapshot | null;
    };

export interface LoadWorkspaceRevisionsInput {
  reviewWorkspaceId: string;
}

export type LoadWorkspaceRevisionsResult =
  | { ok: true; view: WorkspaceRevisionView }
  | { ok: false; reason: 'workspaceNotFound'; message: string; view: null };

export interface RefreshWorkspaceRevisionsInput {
  reviewWorkspaceId: string;
}

export type RefreshWorkspaceRevisionsResult =
  | {
      ok: true;
      refresh: RevisionRefreshSnapshot;
      view: WorkspaceRevisionView;
      graphAnalysis: AnalysisRunSnapshot | null;
    }
  | {
      ok: false;
      reason:
        | 'workspaceNotFound'
        | 'providerUnavailable'
        | 'tokenNotFound'
        | 'sourceFetchFailed'
        | 'worktreeUpdateFailed'
        | 'analysisEnqueueFailed';
      message: string;
      refresh: RevisionRefreshSnapshot | null;
      view: WorkspaceRevisionView | null;
    };

export interface SelectWorkspaceRevisionInput {
  reviewWorkspaceId: string;
  revisionId: string;
}

export type SelectWorkspaceRevisionResult =
  | { ok: true; view: WorkspaceRevisionView; graph: LoadWorkspaceGraphResult }
  | {
      ok: false;
      reason: 'workspaceNotFound' | 'revisionNotFound' | 'analysisUnavailable';
      message: string;
    };

export interface ListOutdatedAgentThreadsInput {
  reviewWorkspaceId: string;
}

export interface ListOutdatedAgentThreadsResult {
  threads: Poc3OutdatedAgentThread[];
}

export interface Poc3ArchivedRemoteThread {
  reviewWorkspaceId: string;
  revisionId: string;
  headSha: string;
  thread: ReviewRemoteThread;
}

export interface ListArchivedRemoteThreadsInput {
  reviewWorkspaceId: string;
}

export interface ListArchivedRemoteThreadsResult {
  threads: Poc3ArchivedRemoteThread[];
}

export type RevisionRefreshEvent =
  | { type: 'revision.refresh.snapshot'; refresh: RevisionRefreshSnapshot }
  | { type: 'revision.refresh.log'; refreshId: string; line: string; updatedAt: string };

export interface LoadNodeDetailInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  nodeId: string;
  viewMode?: NodeDetailViewMode;
}

export type LoadNodeDetailFailureReason =
  | 'workspaceNotFound'
  | 'revisionNotFound'
  | 'graphNotReady'
  | 'nodeNotFound'
  | 'detailUnavailable';

export type LoadNodeDetailResult =
  | {
      ok: true;
      detail: NodeDetailSnapshot;
    }
  | {
      ok: false;
      reason: LoadNodeDetailFailureReason;
      message: string;
      detail: NodeDetailSnapshot | null;
    };

export interface StartAgentReviewInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  agent: AgentKind;
  instructions: string;
  lensId?: string;
  codexModel?: string;
  codexReasoningEffort?: string;
}

export type StartAgentReviewResult =
  | {
      ok: true;
      run: Poc3AgentReviewRun;
      session: AgentSessionSnapshot;
    }
  | {
      ok: false;
      reason: 'agentUnavailable' | 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady';
      message: string;
      run: null;
      session: null;
    };

export interface AwaitAgentReviewResultInput {
  runId: string;
}

export type AwaitAgentReviewResultResult =
  | {
      ok: true;
      envelope: Poc3AgentReviewEnvelope;
    }
  | {
      ok: false;
      reason:
        | 'agentUnavailable'
        | 'runNotFound'
        | 'workspaceNotFound'
        | 'revisionNotFound'
        | 'graphNotReady'
        | 'sourceSnapshotNotFound'
        | 'agentFailed';
      message: string;
      envelope: Poc3AgentReviewEnvelope | null;
    };

export interface ListAgentReviewRunsInput {
  reviewWorkspaceId: string;
}

export interface ListAgentReviewRunsResult {
  runs: AgentReviewRunListItem[];
}

export interface BeginAgentReviewThreadReplyInput {
  reviewWorkspaceId: string;
  revisionId: string;
  localThreadId: string;
  body: string;
}

export type BeginAgentReviewThreadReplyResult =
  | {
      ok: true;
      reply: Poc3AgentThreadReplyRecord;
      binding: Poc3AgentThreadBinding;
      session: AgentSessionSnapshot;
      userMessage: Poc3AgentThreadMessage;
      conversation: Poc3AgentThreadConversation;
    }
  | {
      ok: false;
      reason:
        | 'agentUnavailable'
        | 'workspaceNotFound'
        | 'revisionNotFound'
        | 'runNotFound'
        | 'threadNotFound'
        | 'fallbackRunNotReplyable'
        | 'replyAlreadyInFlight'
        | 'emptyBody';
      message: string;
    };

export interface AwaitAgentReviewThreadReplyResultInput {
  replyId: string;
}

export type AwaitAgentReviewThreadReplyResultResult =
  | { ok: true; conversation: Poc3AgentThreadConversation }
  | { ok: false; reason: 'agentUnavailable' | 'replyNotFound' | 'agentFailed'; message: string };

export interface LoadAgentThreadConversationInput {
  reviewWorkspaceId: string;
  localThreadId: string;
}

export type LoadAgentThreadConversationResult =
  | { ok: true; conversation: Poc3AgentThreadConversation }
  | { ok: false; reason: 'threadNotFound'; message: string };

export interface ListAgentThreadConversationsInput {
  reviewWorkspaceId: string;
  revisionId: string;
}

export interface ListAgentThreadConversationsResult {
  conversations: Poc3AgentThreadConversation[];
}

export interface Poc3GraphReviewApi {
  listRepositoryProviders(): Promise<ListRepositoryProvidersResult>;
  saveRepositoryProvider(input: SaveRepositoryProviderInput): Promise<SaveRepositoryProviderResult>;
  testRepositoryProvider(input: TestRepositoryProviderInput): Promise<TestRepositoryProviderResult>;
  listRepositoryProfiles(): Promise<ListRepositoryProfilesResult>;
  resolveRepositoryProvider(
    input: ResolveRepositoryProviderInput,
  ): Promise<ResolveRepositoryProviderResult>;
  validateRepositoryProfile(
    input: ValidateRepositoryProfileInput,
  ): Promise<ValidateRepositoryProfileResult>;
  saveRepositoryProfile(input: SaveRepositoryProfileInput): Promise<SaveRepositoryProfileResult>;
  browseDirectory(input: BrowseDirectoryInput): Promise<BrowseDirectoryResult>;
  resolveReviewWorkspaceTarget(
    input: ResolveReviewWorkspaceTargetInput,
  ): Promise<ResolveReviewWorkspaceTargetResult>;
  createReviewWorkspace(input: CreateReviewWorkspaceInput): Promise<CreateReviewWorkspaceResult>;
  listReviewWorkspaces(): Promise<ListReviewWorkspacesResult>;
  removeReviewWorkspace(input: RemoveReviewWorkspaceInput): Promise<RemoveReviewWorkspaceResult>;
  listWorkspaceCreationJobs(): Promise<ListWorkspaceCreationJobsResult>;
  loadWorkspaceGraph(input: LoadWorkspaceGraphInput): Promise<LoadWorkspaceGraphResult>;
  retryGraphAnalysis(input: RetryGraphAnalysisInput): Promise<RetryGraphAnalysisResult>;
  loadWorkspaceRevisions(input: LoadWorkspaceRevisionsInput): Promise<LoadWorkspaceRevisionsResult>;
  refreshWorkspaceRevisions(
    input: RefreshWorkspaceRevisionsInput,
  ): Promise<RefreshWorkspaceRevisionsResult>;
  selectWorkspaceRevision(
    input: SelectWorkspaceRevisionInput,
  ): Promise<SelectWorkspaceRevisionResult>;
  loadNodeDetail(input: LoadNodeDetailInput): Promise<LoadNodeDetailResult>;
  startAgentReview(input: StartAgentReviewInput): Promise<StartAgentReviewResult>;
  awaitAgentReviewResult(input: AwaitAgentReviewResultInput): Promise<AwaitAgentReviewResultResult>;
  listAgentReviewRuns(input: ListAgentReviewRunsInput): Promise<ListAgentReviewRunsResult>;
  listOutdatedAgentThreads(
    input: ListOutdatedAgentThreadsInput,
  ): Promise<ListOutdatedAgentThreadsResult>;
  listArchivedRemoteThreads(
    input: ListArchivedRemoteThreadsInput,
  ): Promise<ListArchivedRemoteThreadsResult>;
  getAgentReviewRunDetail(
    input: GetAgentReviewRunDetailInput,
  ): Promise<GetAgentReviewRunDetailResult>;
  respondAgentReviewPermission(input: RespondPermissionInput): Promise<void>;
  beginAgentReviewThreadReply(
    input: BeginAgentReviewThreadReplyInput,
  ): Promise<BeginAgentReviewThreadReplyResult>;
  awaitAgentReviewThreadReplyResult(
    input: AwaitAgentReviewThreadReplyResultInput,
  ): Promise<AwaitAgentReviewThreadReplyResultResult>;
  loadAgentThreadConversation(
    input: LoadAgentThreadConversationInput,
  ): Promise<LoadAgentThreadConversationResult>;
  listAgentThreadConversations(
    input: ListAgentThreadConversationsInput,
  ): Promise<ListAgentThreadConversationsResult>;
  onWorkspaceCreationEvent(callback: (event: WorkspaceCreationEvent) => void): () => void;
  onGraphAnalysisEvent(callback: (event: GraphAnalysisEvent) => void): () => void;
  onRevisionRefreshEvent(callback: (event: RevisionRefreshEvent) => void): () => void;
  onAgentReviewEvent(callback: (event: Poc3AgentReviewEvent) => void): () => void;
}
