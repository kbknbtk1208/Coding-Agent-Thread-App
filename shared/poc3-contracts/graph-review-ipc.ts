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
  GraphLimitSummary,
  GraphRenderSnapshot,
  GraphWorkspaceView,
} from '../poc3-domain/graph';
import type {
  GraphLayerApplicationSnapshot,
  GraphLayerDiagnostic,
  GraphLayerUnclassifiedSummary,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
} from '../poc3-domain/layer-profile';
import type {
  NodeCompanionDetailSnapshot,
  NodeDetailSnapshot,
  NodeDetailViewMode,
} from '../poc3-domain/node-detail';
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
  WorkspaceEditorKind,
  WorkspaceEditorLaunchMode,
  WorkspaceCreationEvent,
} from '../poc3-domain/review-workspace';
import type { ReviewRemoteThread, ReviewSourceSnapshot } from '../poc3-domain/source-snapshot';
import type {
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../poc3-domain/comment-publish';
import type { PublishedAgentThreadLink } from '../poc3-domain/published-agent-thread';
import type {
  ResolveJudgementEvent,
  ResolveJudgementCommentKey,
  ResolveJudgementResult,
  ResolveJudgementRun,
} from '../poc3-domain/resolve-judgement';
import type {
  ResolveAgentThreadInput,
  ResolveAgentThreadResult,
  ResolveRemoteThreadInput,
  ResolveRemoteThreadResult,
} from '../poc3-domain/thread-resolve';

export type {
  CodeGraphEdgeKind,
  CodeGraphEdgeTransport,
  GraphAnalysisEvent,
  GraphRenderSnapshot,
} from '../poc3-domain/graph';
export type {
  ApiEdgeCandidate,
  ApiEndpointNode,
  GraphEdgeLayerClassification,
  GraphEdgeLayerDirection,
  GraphLayerApplicationSnapshot,
  GraphLayerBounds,
  GraphLayerDiagnostic,
  GraphLayerDiagnosticSeverity,
  GraphLayerGroupRender,
  GraphLayerIgnoredSummary,
  GraphLayerLaneRender,
  GraphLayerRenderSnapshot,
  GraphLayerUnclassifiedDirectory,
  GraphLayerUnclassifiedSummary,
  GraphNodeLayerClassification,
  LayerClassificationStatus,
  RepositoryLayerDependencyDirection,
  RepositoryLayerIgnorePattern,
  RepositoryLayerIgnorePatternDraft,
  RepositoryLayerLayoutDirection,
  RepositoryLayerLayoutStrategy,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
  RepositoryLayerRule,
  RepositoryLayerRuleDraft,
} from '../poc3-domain/layer-profile';
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
  NodeCompanionDetailSnapshot,
  NodeCompanionState,
  NodeCompanionSummary,
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
  TestCaseKind,
  TestCaseModifier,
  TestCaseTreeNode,
} from '../poc3-domain/node-detail';
export type {
  ReviewRemoteComment,
  ReviewRemoteCommentAuthor,
  ReviewRemoteThread,
  ReviewRemoteThreadAnchorStatus,
  ReviewRemoteThreadLocation,
  ReviewSourceSnapshot,
} from '../poc3-domain/source-snapshot';
export type {
  Poc3CommentPublishSourceKind,
  Poc3CommentReplySourceKind,
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../poc3-domain/comment-publish';
export type {
  ResolveJudgementCommentKey,
  ResolveJudgementCommentType,
  ResolveJudgementDecision,
  ResolveJudgementEvent,
  ResolveJudgementResult,
  ResolveJudgementRun,
  ResolveJudgementRunStatus,
} from '../poc3-domain/resolve-judgement';
export type {
  RemoteThreadResolveItemResult,
  ResolveAgentThreadInput,
  ResolveAgentThreadResult,
  ResolveRemoteThreadInput,
  ResolveRemoteThreadResult,
  ThreadResolveFailureReason,
} from '../poc3-domain/thread-resolve';
export type { ResolveRepositoryProviderResult } from '../poc3-domain/repository';
export type {
  ResolveReviewWorkspaceTargetResult,
  ReviewWorkspaceListItem,
  ReviewWorkspaceCreationJobSnapshot,
  WorkspaceCreationEvent,
  WorkspaceCreationPhase,
  ReviewWorkspaceCreationJobStatus,
  ReviewWorkspaceTarget,
  WorkspaceEditorKind,
  WorkspaceEditorLaunchMode,
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
  openWorkspaceInEditor: 'poc3:workspace:open-in-editor',
  listWorkspaceCreationJobs: 'poc3:workspace:creation-job:list',
  workspaceCreationEvent: 'poc3:workspace:creation-job:event',
  loadWorkspaceGraph: 'poc3:graph:load',
  loadWorkspaceGraphView: 'poc3:graph:load-view',
  loadWorkspaceGraphSummary: 'poc3:graph:load-summary',
  loadWorkspaceGraphFull: 'poc3:graph:load-full',
  listGraphCommentSummaries: 'poc3:graph:comment-summaries:list',
  retryGraphAnalysis: 'poc3:graph:analysis:retry',
  graphAnalysisEvent: 'poc3:graph:analysis:event',
  loadRepositoryLayerProfile: 'poc3:layer-profile:load',
  inferRepositoryLayerProfile: 'poc3:layer-profile:infer',
  validateRepositoryLayerProfile: 'poc3:layer-profile:validate',
  saveRepositoryLayerProfile: 'poc3:layer-profile:save',
  previewRepositoryLayerProfile: 'poc3:layer-profile:preview',
  recomputeWorkspaceLayerLayout: 'poc3:layer-profile:recompute-layout',
  layerApplicationEvent: 'poc3:layer-profile:application:event',
  loadWorkspaceRevisions: 'poc3:revision:list',
  refreshWorkspaceRevisions: 'poc3:revision:refresh',
  selectWorkspaceRevision: 'poc3:revision:select',
  revisionRefreshEvent: 'poc3:revision:refresh:event',
  loadNodeDetail: 'poc3:node:load-detail',
  loadNodeCompanionDetail: 'poc3:node:load-companion-detail',
  startAgentReview: 'poc3:agent-review:start',
  awaitAgentReviewResult: 'poc3:agent-review:await-result',
  listAgentReviewRuns: 'poc3:agent-review:list-runs',
  listOutdatedAgentThreads: 'poc3:agent-review:outdated-threads:list',
  listArchivedRemoteThreads: 'poc3:remote-comment:archive:list',
  publishInlineComment: 'poc3:remote-comment:publish-inline',
  replyRemoteComment: 'poc3:remote-comment:reply',
  resolveAgentThread: 'poc3:agent-review:thread:resolve',
  resolveRemoteThread: 'poc3:remote-comment:thread:resolve',
  getAgentReviewRunDetail: 'poc3:agent-review:get-run-detail',
  respondAgentReviewPermission: 'poc3:agent-review:permission:respond',
  agentReviewEvent: 'poc3:agent-review:event',
  beginAgentReviewThreadReply: 'poc3:agent-review:thread-reply:begin',
  awaitAgentReviewThreadReplyResult: 'poc3:agent-review:thread-reply:await',
  loadAgentThreadConversation: 'poc3:agent-review:thread-conversation:load',
  listAgentThreadConversations: 'poc3:agent-review:thread-conversation:list',
  startResolveJudgement: 'poc3:resolve-judgement:start',
  awaitResolveJudgementResult: 'poc3:resolve-judgement:await',
  listResolveJudgementResults: 'poc3:resolve-judgement:results:list',
  resolveJudgementEvent: 'poc3:resolve-judgement:event',
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

export interface OpenWorkspaceInEditorInput {
  reviewWorkspaceId: string;
  editor?: WorkspaceEditorKind;
  mode?: WorkspaceEditorLaunchMode;
}

export type OpenWorkspaceInEditorFailureReason =
  | 'workspaceNotFound'
  | 'worktreeUnavailable'
  | 'editorUnavailable'
  | 'launchFailed';

export type OpenWorkspaceInEditorResult =
  | { ok: true }
  | {
      ok: false;
      reason: OpenWorkspaceInEditorFailureReason;
      message: string;
    };

export interface ListWorkspaceCreationJobsResult {
  jobs: ReviewWorkspaceCreationJobSnapshot[];
}

export interface LoadWorkspaceGraphInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  includeLayers?: boolean;
}

export interface LoadWorkspaceGraphViewInput extends LoadWorkspaceGraphInput {
  mode?: 'initial' | 'revealed';
  revealedNodeIds?: string[];
}

// FUTURE: differential reveal patch API.
// `loadWorkspaceGraphView({ mode: 'revealed', revealedNodeIds })` 全体差し替えで現在は十分。
// nodes が増えて payload が問題になる場合に下記の patch 型を追加する想定:
//
//   export interface RevealGraphNodesInput {
//     reviewWorkspaceId: string;
//     scopeKey?: string;
//     nodeIds?: string[];
//     filePath?: string;
//     includeLayers?: boolean;
//     currentlyRevealedNodeIds: string[];
//   }
//
// レスポンスは追加された node / edge のみを返す差分形式とし、renderer は既存 view に
// merge する。Task 3 の view/summary cache 投入で当面は再計算コストが下がっているため、
// payload size が profiling で問題化してから着手する。

export type LoadWorkspaceGraphFullInput = LoadWorkspaceGraphInput;

export interface LoadWorkspaceGraphSummaryInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  includeLayers?: boolean;
}

export interface GraphFileSummary {
  filePath: string;
  isDiffFile: boolean;
  nodeCount: number;
  diffNodeCount: number;
  findingCount: number;
  remoteThreadCount: number;
}

export interface GraphViewSummary {
  revisionId: string;
  graphSnapshotId: string;
  scopeKey: string;
  totalNodeCount: number;
  totalEdgeCount: number;
  renderedNodeCount: number;
  renderedEdgeCount: number;
  diffNodeCount: number;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  limits: GraphLimitSummary;
  files: GraphFileSummary[];
  commentCounts: {
    agentFindingCount: number;
    remoteThreadCount: number;
  };
  denseRecommended: boolean;
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

type LoadWorkspaceGraphFailure = Extract<LoadWorkspaceGraphResult, { ok: false }>;

export type LoadWorkspaceGraphViewResult =
  | {
      ok: true;
      workspace: ReviewWorkspaceListItem;
      revision: RevisionContext;
      analysis: AnalysisRunSnapshot;
      graph: GraphRenderSnapshot;
      summary: GraphViewSummary;
    }
  | LoadWorkspaceGraphFailure;

export type LoadWorkspaceGraphSummaryResult =
  | {
      ok: true;
      workspace: ReviewWorkspaceListItem;
      revision: RevisionContext;
      analysis: AnalysisRunSnapshot;
      summary: GraphViewSummary;
    }
  | LoadWorkspaceGraphFailure;

export interface ListGraphCommentSummariesInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  graphSnapshotId?: string;
}

export interface GraphCommentSummary {
  key: string;
  type: 'agent' | 'remote';
  nodeId: string;
  commentKey: ResolveJudgementCommentKey;
  title: string;
  filePath: string | null;
  line: number | null;
  publishedRemoteCount?: number;
}

export type ListGraphCommentSummariesResult =
  | {
      ok: true;
      revisionId: string | null;
      items: GraphCommentSummary[];
    }
  | {
      ok: false;
      reason: 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady';
      message: string;
      revisionId: null;
      items: [];
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

export interface LoadRepositoryLayerProfileInput {
  repositoryProfileId: string;
}

export type LoadRepositoryLayerProfileResult =
  | {
      ok: true;
      profile: RepositoryLayerProfile | null;
      reusableProfile: RepositoryLayerProfile | null;
    }
  | {
      ok: false;
      reason: 'repositoryProfileNotFound' | 'profileReadFailed';
      message: string;
      profile: null;
      reusableProfile: null;
      diagnostics: GraphLayerDiagnostic[];
    };

export interface InferRepositoryLayerProfileInput {
  repositoryProfileId: string;
}

export type InferRepositoryLayerProfileResult =
  | {
      ok: true;
      draft: RepositoryLayerProfileDraft;
      source: 'same-repository-copy' | 'heuristic' | 'empty';
      diagnostics: GraphLayerDiagnostic[];
    }
  | {
      ok: false;
      reason: 'repositoryProfileNotFound' | 'inferFailed';
      message: string;
      draft: null;
      source: null;
      diagnostics: GraphLayerDiagnostic[];
    };

export interface ValidateRepositoryLayerProfileInput {
  draft: RepositoryLayerProfileDraft;
}

export type ValidateRepositoryLayerProfileResult =
  | {
      ok: true;
      issues: GraphLayerDiagnostic[];
    }
  | {
      ok: false;
      reason: 'invalidProfile';
      message: string;
      issues: GraphLayerDiagnostic[];
    };

export interface SaveRepositoryLayerProfileInput {
  draft: RepositoryLayerProfileDraft;
}

export type SaveRepositoryLayerProfileResult =
  | {
      ok: true;
      profile: RepositoryLayerProfile;
      recomputeQueued: boolean;
    }
  | {
      ok: false;
      reason: 'repositoryProfileNotFound' | 'invalidProfile' | 'saveFailed';
      message: string;
      profile: null;
      recomputeQueued: false;
      diagnostics: GraphLayerDiagnostic[];
    };

export interface PreviewRepositoryLayerProfileInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  draft: RepositoryLayerProfileDraft;
}

export type PreviewRepositoryLayerProfileResult =
  | {
      ok: true;
      summary: GraphLayerUnclassifiedSummary;
      diagnostics: GraphLayerDiagnostic[];
      violationEdgeIds: string[];
    }
  | {
      ok: false;
      reason: 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady' | 'invalidProfile';
      message: string;
      diagnostics: GraphLayerDiagnostic[];
    };

export interface RecomputeWorkspaceLayerLayoutInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
}

export type RecomputeWorkspaceLayerLayoutResult =
  | {
      ok: true;
      application: GraphLayerApplicationSnapshot;
    }
  | {
      ok: false;
      reason:
        | 'workspaceNotFound'
        | 'revisionNotFound'
        | 'graphNotReady'
        | 'layerProfileNotFound'
        | 'layoutFailed';
      message: string;
      diagnostics: GraphLayerDiagnostic[];
    };

export type LayerApplicationEvent =
  | {
      type: 'layer.application.started';
      reviewWorkspaceId: string;
      graphSnapshotId: string;
      layerProfileId: string;
      profileVersion: number;
    }
  | {
      type: 'layer.application.completed';
      reviewWorkspaceId: string;
      graphSnapshotId: string;
      graphLayerApplicationId: string;
      layerProfileId: string;
      profileVersion: number;
    }
  | {
      type: 'layer.application.failed';
      reviewWorkspaceId: string;
      graphSnapshotId: string;
      layerProfileId: string;
      profileVersion: number;
      message: string;
      diagnostics: GraphLayerDiagnostic[];
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

export interface PublishInlineCommentInput {
  reviewWorkspaceId: string;
  revisionId: string;
  body: string;
  anchor: Poc3InlineCommentAnchor;
  source: Poc3PublishCommentSource;
}

export type PublishInlineCommentResult =
  | {
      ok: true;
      published: Poc3PublishedCommentRecord;
      remoteThread: ReviewRemoteThread;
      sourceSnapshot: ReviewSourceSnapshot;
      publishedAgentThreadLink: PublishedAgentThreadLink | null;
    }
  | {
      ok: false;
      reason:
        | 'workspaceNotFound'
        | 'revisionNotFound'
        | 'sourceSnapshotNotFound'
        | 'inactiveRevision'
        | 'providerUnavailable'
        | 'tokenNotFound'
        | 'invalidBody'
        | 'invalidAnchor'
        | 'providerRejected';
      message: string;
    };

export interface ReplyRemoteCommentInput {
  reviewWorkspaceId: string;
  revisionId: string;
  providerThreadId: string;
  body: string;
}

export type ReplyRemoteCommentResult =
  | {
      ok: true;
      published: Poc3PublishedCommentRecord;
      remoteThread: ReviewRemoteThread;
      sourceSnapshot: ReviewSourceSnapshot;
    }
  | {
      ok: false;
      reason:
        | 'workspaceNotFound'
        | 'revisionNotFound'
        | 'sourceSnapshotNotFound'
        | 'threadNotFound'
        | 'threadNotReplyable'
        | 'providerUnavailable'
        | 'tokenNotFound'
        | 'invalidBody'
        | 'providerRejected';
      message: string;
    };

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

export interface LoadNodeCompanionDetailInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  ownerNodeId: string;
  relationId: string;
}

export type LoadNodeCompanionDetailFailureReason =
  | 'workspaceNotFound'
  | 'revisionNotFound'
  | 'graphNotReady'
  | 'ownerNodeNotFound'
  | 'companionNotFound'
  | 'fileNotFound'
  | 'detailUnavailable';

export type LoadNodeCompanionDetailResult =
  | {
      ok: true;
      detail: NodeCompanionDetailSnapshot;
    }
  | {
      ok: false;
      reason: LoadNodeCompanionDetailFailureReason;
      message: string;
      detail: NodeCompanionDetailSnapshot | null;
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

export interface StartResolveJudgementInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  agent: AgentKind;
  codexModel?: string;
  codexReasoningEffort?: string;
}

export type StartResolveJudgementResult =
  | {
      ok: true;
      run: ResolveJudgementRun;
      reusedRunningRun: boolean;
    }
  | {
      ok: false;
      reason: 'agentUnavailable' | 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady';
      message: string;
      run: null;
    };

export interface AwaitResolveJudgementInput {
  runId: string;
}

export type AwaitResolveJudgementResult =
  | {
      ok: true;
      run: ResolveJudgementRun;
      results: ResolveJudgementResult[];
    }
  | {
      ok: false;
      reason: 'runNotFound' | 'agentFailed' | 'schemaValidationFailed';
      message: string;
      run: ResolveJudgementRun | null;
      results: ResolveJudgementResult[];
    };

export interface ListResolveJudgementResultsInput {
  reviewWorkspaceId: string;
  revisionId: string;
}

export interface ListResolveJudgementResultsResult {
  results: ResolveJudgementResult[];
  runningRun: ResolveJudgementRun | null;
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
  openWorkspaceInEditor(input: OpenWorkspaceInEditorInput): Promise<OpenWorkspaceInEditorResult>;
  listWorkspaceCreationJobs(): Promise<ListWorkspaceCreationJobsResult>;
  loadWorkspaceGraph(input: LoadWorkspaceGraphInput): Promise<LoadWorkspaceGraphResult>;
  loadWorkspaceGraphView(input: LoadWorkspaceGraphViewInput): Promise<LoadWorkspaceGraphViewResult>;
  loadWorkspaceGraphSummary(
    input: LoadWorkspaceGraphSummaryInput,
  ): Promise<LoadWorkspaceGraphSummaryResult>;
  loadWorkspaceGraphFull(input: LoadWorkspaceGraphFullInput): Promise<LoadWorkspaceGraphResult>;
  listGraphCommentSummaries(
    input: ListGraphCommentSummariesInput,
  ): Promise<ListGraphCommentSummariesResult>;
  retryGraphAnalysis(input: RetryGraphAnalysisInput): Promise<RetryGraphAnalysisResult>;
  loadRepositoryLayerProfile(
    input: LoadRepositoryLayerProfileInput,
  ): Promise<LoadRepositoryLayerProfileResult>;
  inferRepositoryLayerProfile(
    input: InferRepositoryLayerProfileInput,
  ): Promise<InferRepositoryLayerProfileResult>;
  validateRepositoryLayerProfile(
    input: ValidateRepositoryLayerProfileInput,
  ): Promise<ValidateRepositoryLayerProfileResult>;
  saveRepositoryLayerProfile(
    input: SaveRepositoryLayerProfileInput,
  ): Promise<SaveRepositoryLayerProfileResult>;
  previewRepositoryLayerProfile(
    input: PreviewRepositoryLayerProfileInput,
  ): Promise<PreviewRepositoryLayerProfileResult>;
  recomputeWorkspaceLayerLayout(
    input: RecomputeWorkspaceLayerLayoutInput,
  ): Promise<RecomputeWorkspaceLayerLayoutResult>;
  loadWorkspaceRevisions(input: LoadWorkspaceRevisionsInput): Promise<LoadWorkspaceRevisionsResult>;
  refreshWorkspaceRevisions(
    input: RefreshWorkspaceRevisionsInput,
  ): Promise<RefreshWorkspaceRevisionsResult>;
  selectWorkspaceRevision(
    input: SelectWorkspaceRevisionInput,
  ): Promise<SelectWorkspaceRevisionResult>;
  loadNodeDetail(input: LoadNodeDetailInput): Promise<LoadNodeDetailResult>;
  loadNodeCompanionDetail(
    input: LoadNodeCompanionDetailInput,
  ): Promise<LoadNodeCompanionDetailResult>;
  startAgentReview(input: StartAgentReviewInput): Promise<StartAgentReviewResult>;
  awaitAgentReviewResult(input: AwaitAgentReviewResultInput): Promise<AwaitAgentReviewResultResult>;
  listAgentReviewRuns(input: ListAgentReviewRunsInput): Promise<ListAgentReviewRunsResult>;
  listOutdatedAgentThreads(
    input: ListOutdatedAgentThreadsInput,
  ): Promise<ListOutdatedAgentThreadsResult>;
  listArchivedRemoteThreads(
    input: ListArchivedRemoteThreadsInput,
  ): Promise<ListArchivedRemoteThreadsResult>;
  publishInlineComment(input: PublishInlineCommentInput): Promise<PublishInlineCommentResult>;
  replyRemoteComment(input: ReplyRemoteCommentInput): Promise<ReplyRemoteCommentResult>;
  resolveAgentThread(input: ResolveAgentThreadInput): Promise<ResolveAgentThreadResult>;
  resolveRemoteThread(input: ResolveRemoteThreadInput): Promise<ResolveRemoteThreadResult>;
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
  startResolveJudgement(input: StartResolveJudgementInput): Promise<StartResolveJudgementResult>;
  awaitResolveJudgementResult(
    input: AwaitResolveJudgementInput,
  ): Promise<AwaitResolveJudgementResult>;
  listResolveJudgementResults(
    input: ListResolveJudgementResultsInput,
  ): Promise<ListResolveJudgementResultsResult>;
  onWorkspaceCreationEvent(callback: (event: WorkspaceCreationEvent) => void): () => void;
  onGraphAnalysisEvent(callback: (event: GraphAnalysisEvent) => void): () => void;
  onLayerApplicationEvent(callback: (event: LayerApplicationEvent) => void): () => void;
  onRevisionRefreshEvent(callback: (event: RevisionRefreshEvent) => void): () => void;
  onAgentReviewEvent(callback: (event: Poc3AgentReviewEvent) => void): () => void;
  onResolveJudgementEvent(callback: (event: ResolveJudgementEvent) => void): () => void;
}
