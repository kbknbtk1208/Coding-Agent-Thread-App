import type {
  AnalysisRunSnapshot,
  GraphAnalysisEvent,
  GraphWorkspaceView,
} from '../poc3-domain/graph';
import type { NodeDetailSnapshot, NodeDetailViewMode } from '../poc3-domain/node-detail';
import type { RevisionContext } from '../poc3-domain/revision';
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

export type { GraphAnalysisEvent, GraphRenderSnapshot } from '../poc3-domain/graph';
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
  NodeThreadSummary,
} from '../poc3-domain/node-detail';
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
  loadNodeDetail: 'poc3:node:load-detail',
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
}

export type RemoveReviewWorkspaceResult =
  | { ok: true; reviewWorkspaceId: string }
  | {
      ok: false;
      reviewWorkspaceId: string;
      reason: 'notFound' | 'forceRequired' | 'gitFailed';
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
  loadNodeDetail(input: LoadNodeDetailInput): Promise<LoadNodeDetailResult>;
  onWorkspaceCreationEvent(callback: (event: WorkspaceCreationEvent) => void): () => void;
  onGraphAnalysisEvent(callback: (event: GraphAnalysisEvent) => void): () => void;
}
