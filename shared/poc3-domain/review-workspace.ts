import type { RepositoryLocator, RepositorySetupScript } from './repository';

export type ReviewProviderKind = 'github' | 'gitlab';

export function repositoryLabelFromLocator(locator: RepositoryLocator): string {
  return locator.kind === 'github' ? `${locator.owner}/${locator.repo}` : locator.projectPathOrId;
}

export interface ReviewWorkspace {
  reviewWorkspaceId: string;
  repositoryProfileId: string;
  provider: ReviewProviderKind;
  reviewUrl: string;
  reviewId: string;
  title: string;
  baseSha: string;
  headSha: string;
  sourceBranchName: string | null;
  worktreePath: string;
  setupStatus: 'pending' | 'running' | 'completed' | 'failed';
  status: 'active' | 'inactive' | 'archived' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export type ReviewWorkspaceListItemSetupStatus = 'completed' | 'pending' | 'failed' | 'orphan';

export type ReviewWorkspaceListItemAnalysisStatus =
  | 'completed'
  | 'queued'
  | 'running'
  | 'failed'
  | 'missing';

export interface ReviewWorkspaceListItem {
  reviewWorkspaceId: string;
  repositoryLabel: string;
  provider: ReviewProviderKind;
  reviewId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  setupStatus: ReviewWorkspaceListItemSetupStatus;
  analysisStatus: ReviewWorkspaceListItemAnalysisStatus;
  worktreeExists: boolean;
}

export interface ReviewWorkspaceTarget {
  repositoryProviderId: string;
  repositoryProfileId: string;
  provider: ReviewProviderKind;
  reviewUrl: string;
  reviewId: string;
  repositoryLabel: string;
  originUrl: string;
  localClonePath: string;
  worktreeRootPath: string;
  setupScript: RepositorySetupScript | null;
}

export type ResolveReviewWorkspaceTargetStatus =
  | 'resolved'
  | 'invalidUrl'
  | 'unsupportedUrl'
  | 'noProvider'
  | 'noRepositoryProfile'
  | 'multipleRepositoryProfiles';

export interface ResolveReviewWorkspaceTargetResult {
  ok: boolean;
  status: ResolveReviewWorkspaceTargetStatus;
  message: string | null;
  target: ReviewWorkspaceTarget | null;
}

export type WorkspaceCreationPhase =
  | 'resolveTarget'
  | 'loadSourceSnapshot'
  | 'fetchSource'
  | 'createWorktree'
  | 'verifyHead'
  | 'runSetupScript'
  | 'persistWorkspace'
  | 'startAnalysis'
  | 'analysisProgram'
  | 'analysisExtract'
  | 'analysisBuildGraph'
  | 'analysisLayout'
  | 'analysisPersist'
  | 'done';

export type ReviewWorkspaceCreationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ReviewWorkspaceCreationJobSnapshot {
  jobId: string;
  reviewUrl: string;
  repositoryProfileId: string;
  repositoryLabel: string;
  worktreePath: string | null;
  status: ReviewWorkspaceCreationJobStatus;
  phase: WorkspaceCreationPhase;
  latestLogLine: string | null;
  logLines: string[];
  errorMessage: string | null;
  reviewWorkspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceCreationEvent =
  | {
      type: 'snapshot';
      job: ReviewWorkspaceCreationJobSnapshot;
    }
  | {
      type: 'log';
      jobId: string;
      line: string;
      updatedAt: string;
    };
