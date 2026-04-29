import type { RevisionContext } from './revision';

export interface RevisionCommitAuthor {
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface RevisionCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: RevisionCommitAuthor;
  authoredAt: string | null;
  committedAt: string | null;
  parents: string[];
  refs: string[];
  url: string | null;
}

export type RevisionCommitRole = 'base' | 'head' | 'active' | 'included' | 'orphaned';

export interface RevisionCommitView extends RevisionCommit {
  role: RevisionCommitRole;
  revisionId: string | null;
}

export type RevisionRefreshStatus =
  | 'idle'
  | 'refreshing'
  | 'analysisQueued'
  | 'analysisRunning'
  | 'completed'
  | 'failed';

export interface RevisionRefreshSnapshot {
  refreshId: string;
  reviewWorkspaceId: string;
  status: RevisionRefreshStatus;
  previousHeadSha: string | null;
  latestHeadSha: string | null;
  createdRevisionId: string | null;
  message: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface OutdatedThreadSummary {
  count: number;
  latestCheckedRevisionId: string | null;
}

export interface WorkspaceRevisionView {
  reviewWorkspaceId: string;
  activeRevisionId: string | null;
  activeHeadSha: string | null;
  commits: RevisionCommitView[];
  revisions: RevisionContext[];
  latestRefresh: RevisionRefreshSnapshot | null;
  outdatedThreadSummary: OutdatedThreadSummary;
}
