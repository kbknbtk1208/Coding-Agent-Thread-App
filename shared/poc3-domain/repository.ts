export type RepositoryProviderKind = 'github' | 'gitlab';

export interface RepositoryProvider {
  repositoryProviderId: string;
  kind: RepositoryProviderKind;
  displayName: string;
  baseUrl: string;
  tokenRef: string;
  isDefaultForKind: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PublicRepositoryProvider = Omit<RepositoryProvider, 'tokenRef'> & {
  hasToken: boolean;
};

export interface RepositoryProviderSecretInput {
  repositoryProviderId?: string;
  kind: RepositoryProviderKind;
  displayName: string;
  baseUrl: string;
  token?: string;
  isDefaultForKind: boolean;
}

export interface RepositoryProviderConnectionResult {
  ok: boolean;
  statusCode: number | null;
  message: string;
}

export interface ResolvedRepositoryProvider {
  kind: RepositoryProviderKind;
  baseUrl: string;
  host: string;
}

export type RepositoryLocator =
  | {
      kind: 'github';
      owner: string;
      repo: string;
    }
  | {
      kind: 'gitlab';
      projectPathOrId: string;
    };

export interface RepositorySetupScript {
  scriptText: string;
  shell: 'powershell' | 'cmd' | 'bash' | 'zsh' | 'systemDefault';
  cwdMode: 'worktreeRoot' | 'worktreePath';
}

export interface RepositoryProfile {
  repositoryProfileId: string;
  repositoryProviderId: string;
  originUrl: string;
  resolvedProvider: ResolvedRepositoryProvider;
  repoLocator: RepositoryLocator;
  localClonePath: string;
  worktreeRootPath: string;
  setupScript: RepositorySetupScript | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryProfileInput {
  repositoryProfileId?: string;
  repositoryProviderId: string;
  originUrl: string;
  localClonePath: string;
  worktreeRootPath: string;
  setupScript: RepositorySetupScript | null;
  allowOriginMismatch?: boolean;
}

export interface RepositoryProviderCandidate {
  repositoryProviderId: string;
  displayName: string;
  kind: RepositoryProviderKind;
  baseUrl: string;
  match: 'exactHost' | 'sameHost';
}

export interface ResolveRepositoryProviderResult {
  normalizedOriginUrl: string | null;
  candidates: RepositoryProviderCandidate[];
  repoLocator: RepositoryLocator | null;
  status: 'resolved' | 'multipleCandidates' | 'noProvider' | 'invalidUrl' | 'unsupportedUrl';
  message: string | null;
}

export interface RepositoryProfileValidationIssue {
  code:
    | 'INVALID_ORIGIN_URL'
    | 'NO_PROVIDER'
    | 'LOCAL_CLONE_MISSING'
    | 'LOCAL_CLONE_NOT_ABSOLUTE'
    | 'LOCAL_CLONE_NOT_DIRECTORY'
    | 'NOT_GIT_WORK_TREE'
    | 'GIT_REMOTE_ORIGIN_MISSING'
    | 'ORIGIN_MISMATCH'
    | 'PROVIDER_ORIGIN_MISMATCH'
    | 'WORKTREE_ROOT_INVALID'
    | 'WORKTREE_ROOT_INSIDE_CLONE'
    | 'GIT_STATUS_FAILED';
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface RepositoryProfileValidationResult {
  ok: boolean;
  issues: RepositoryProfileValidationIssue[];
  gitRemoteOriginUrl: string | null;
  isDirty: boolean | null;
}
