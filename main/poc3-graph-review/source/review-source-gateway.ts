import type { ReviewProviderKind } from '../../../shared/poc3-domain/review-workspace';
import type {
  ReviewChangedFile,
  ReviewChangedFileStatus,
  ReviewRemoteThread,
} from '../../../shared/poc3-domain/source-snapshot';
import type { RevisionCommit as Poc3RevisionCommit } from '../../../shared/poc3-domain/revision-commit';
import {
  fetchGitLabMergeRequestDiffsWithFallback,
  type GitLabNormalizedMergeRequestDiff,
  type GitLabSourceDiagnostic,
} from '../../helpers/gitlab-merge-request-diffs';
import { resolveGitLabDiffRefs } from '../../helpers/gitlab-diff-refs';
import { apiEndpointForProvider } from './repository-url';
import { parseUnifiedDiffHunks } from './unified-diff-parser';
import { ProviderApiError, isProviderApiError } from './provider-api-error';
import {
  type GithubReviewThreadState,
  normalizeGitHubRemoteThreads,
  normalizeGitLabRemoteThreads,
} from './remote-thread-normalizer';
import { resolveRemoteThreadAnchors } from './remote-thread-anchor-resolver';

const MAX_CHANGED_FILES = 300;

export interface FetchedReviewSourceSnapshot {
  provider: ReviewProviderKind;
  reviewId: string;
  title: string;
  description: string;
  baseSha: string;
  headSha: string;
  startSha: string | null;
  sourceBranchName: string | null;
  diffVersion: string | null;
  changedFiles: ReviewChangedFile[];
  commits: Poc3RevisionCommit[];
  remoteThreads: ReviewRemoteThread[];
  diagnostics: GitLabSourceDiagnostic[];
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ReviewSourceFetchInput {
  provider: ReviewProviderKind;
  baseUrl: string;
  token: string;
  repositoryPath: string;
  reviewId: string;
  fetchImpl?: FetchLike;
}

interface GithubPullResponse {
  number: number;
  title: string;
  body: string | null;
  base: { sha: string };
  head: { sha: string; ref: string | null };
}

interface GithubPullFileResponse {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GithubPullCommitResponse {
  sha: string;
  html_url: string | null;
  parents?: Array<{ sha: string }>;
  commit: {
    message: string;
    author: { name: string; email: string | null; date: string | null } | null;
    committer: { date: string | null } | null;
  };
  author: { avatar_url: string | null } | null;
}

interface GitlabMergeRequestResponse {
  iid: number;
  title: string;
  description: string | null;
  diff_refs: { base_sha: string; head_sha: string; start_sha?: string } | null;
  source_branch: string | null;
  sha: string | null;
}

interface GitlabMergeRequestCommitResponse {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string | null;
  authored_date: string | null;
  committed_date: string | null;
  parent_ids?: string[];
  web_url: string | null;
}

async function readResponseExcerpt(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return null;
  }
}

function getFetchImpl(fetchImpl?: FetchLike): FetchLike {
  return fetchImpl ?? globalThis.fetch.bind(globalThis);
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  fetchImpl?: FetchLike,
): Promise<T> {
  try {
    const response = await getFetchImpl(fetchImpl)(url, { headers });
    if (!response.ok) {
      const excerpt = await readResponseExcerpt(response);
      throw new ProviderApiError({
        message: `Provider API error: HTTP ${response.status} for ${url}`,
        status: response.status,
        url,
        responseBodyExcerpt: excerpt,
      });
    }
    return (await response.json()) as T;
  } catch (err) {
    if (isProviderApiError(err)) {
      throw err;
    }
    throw new ProviderApiError({
      message: err instanceof Error ? err.message : String(err),
      status: null,
      url,
      cause: err,
    });
  }
}

async function fetchPaginatedJson<T>(
  url: string,
  headers: Record<string, string>,
  limit: number,
  fetchImpl?: FetchLike,
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (rows.length <= limit) {
    const separator = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${separator}per_page=100&page=${page}`;
    const body = await fetchJson<T[]>(pageUrl, headers, fetchImpl);
    rows.push(...body);
    if (body.length < 100) {
      break;
    }
    page += 1;
  }
  return rows;
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  fetchImpl?: FetchLike,
): Promise<string> {
  try {
    const response = await getFetchImpl(fetchImpl)(url, { headers });
    if (!response.ok) {
      const excerpt = await readResponseExcerpt(response);
      throw new ProviderApiError({
        message: `Provider API error: HTTP ${response.status} for ${url}`,
        status: response.status,
        url,
        responseBodyExcerpt: excerpt,
      });
    }
    return await response.text();
  } catch (err) {
    if (isProviderApiError(err)) {
      throw err;
    }
    throw new ProviderApiError({
      message: err instanceof Error ? err.message : String(err),
      status: null,
      url,
      cause: err,
    });
  }
}

function normalizeGithubStatus(status: string): ReviewChangedFileStatus {
  if (status === 'added' || status === 'modified' || status === 'removed' || status === 'renamed') {
    return status;
  }
  if (status === 'copied') {
    return 'copied';
  }
  return 'unknown';
}

function normalizeGitlabStatus(file: GitLabNormalizedMergeRequestDiff): ReviewChangedFileStatus {
  if (file.deleted_file) {
    return 'removed';
  }
  if (file.renamed_file) {
    return 'renamed';
  }
  if (file.new_file) {
    return 'added';
  }
  return 'modified';
}

function countPatchLines(patch: string | null): {
  additions: number | null;
  deletions: number | null;
} {
  if (!patch) {
    return { additions: null, deletions: null };
  }
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

function githubGraphqlEndpoint(baseUrl: string): string {
  if (baseUrl.includes('github.com')) {
    return 'https://api.github.com/graphql';
  }
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${normalizedPath}/api/graphql`;
  return url.toString();
}

async function fetchGithubReviewThreadStates(input: {
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  pullNumber: string;
  fetchImpl?: FetchLike;
}): Promise<GithubReviewThreadState[]> {
  const states: GithubReviewThreadState[] = [];
  let cursor: string | null = null;
  do {
    const response = await getFetchImpl(input.fetchImpl)(githubGraphqlEndpoint(input.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query ReviewThreadStates($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $number) {
                reviewThreads(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    id
                    isResolved
                    isOutdated
                    comments(first: 1) { nodes { databaseId } }
                  }
                }
              }
            }
          }
        `,
        variables: {
          owner: input.owner,
          repo: input.repo,
          number: Number(input.pullNumber),
          cursor,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`GitHub GraphQL が HTTP ${response.status} を返しました。`);
    }
    const data = (await response.json()) as {
      data?: {
        repository?: {
          pullRequest?: {
            reviewThreads?: {
              pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
              nodes?: Array<{
                id: string;
                isResolved?: boolean | null;
                isOutdated?: boolean | null;
                comments?: { nodes?: Array<{ databaseId?: number | null }> };
              }>;
            };
          };
        };
      };
    };
    const threads = data.data?.repository?.pullRequest?.reviewThreads;
    for (const node of threads?.nodes ?? []) {
      const rootCommentDatabaseId = node.comments?.nodes?.[0]?.databaseId;
      if (typeof rootCommentDatabaseId !== 'number') continue;
      states.push({
        rootCommentDatabaseId,
        nodeId: node.id,
        isResolved: node.isResolved ?? null,
        isOutdated: node.isOutdated ?? null,
      });
    }
    cursor = threads?.pageInfo?.hasNextPage ? (threads.pageInfo.endCursor ?? null) : null;
  } while (cursor);
  return states;
}

export async function fetchReviewSourceSnapshot(
  input: ReviewSourceFetchInput,
): Promise<FetchedReviewSourceSnapshot> {
  const endpoint = apiEndpointForProvider(input.provider, input.baseUrl);
  if (input.provider === 'github') {
    const [owner, repo] = input.repositoryPath.split('/');
    if (!owner || !repo) {
      throw new Error(`GitHub repository path の形式が不正です: ${input.repositoryPath}`);
    }
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${input.token}`,
    };
    const detail = await fetchJson<GithubPullResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}`,
      headers,
      input.fetchImpl,
    );
    const files = await fetchPaginatedJson<GithubPullFileResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}/files`,
      headers,
      MAX_CHANGED_FILES,
      input.fetchImpl,
    );
    const commitsResponse = await fetchPaginatedJson<GithubPullCommitResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}/commits`,
      headers,
      1000,
      input.fetchImpl,
    );
    const diagnostics: GitLabSourceDiagnostic[] = [];
    if (files.length > MAX_CHANGED_FILES) {
      diagnostics.push({
        code: 'CHANGED_FILES_LIMIT_EXCEEDED',
        message: `Changed files が上限 ${MAX_CHANGED_FILES} 件を超えました。`,
        severity: 'error',
      });
    }
    const changedFiles = files.slice(0, MAX_CHANGED_FILES).map((file): ReviewChangedFile => {
      const patch = file.patch ?? null;
      return {
        path: file.filename,
        oldPath: file.previous_filename ?? null,
        status: normalizeGithubStatus(file.status),
        additions: file.additions ?? null,
        deletions: file.deletions ?? null,
        patch,
        hunks: parseUnifiedDiffHunks(file.filename, patch),
      };
    });

    const headSha = detail.head.sha;
    let remoteThreads: ReviewRemoteThread[] = [];
    try {
      const [rawReviewComments, rawIssueComments] = await Promise.all([
        fetchPaginatedJson<Record<string, unknown>>(
          `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(input.reviewId)}/comments`,
          headers,
          3000,
          input.fetchImpl,
        ),
        fetchPaginatedJson<Record<string, unknown>>(
          `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(input.reviewId)}/comments`,
          headers,
          3000,
          input.fetchImpl,
        ),
      ]);
      let threadStates: GithubReviewThreadState[] = [];
      try {
        threadStates = await fetchGithubReviewThreadStates({
          baseUrl: input.baseUrl,
          token: input.token,
          owner,
          repo,
          pullNumber: input.reviewId,
          fetchImpl: input.fetchImpl,
        });
      } catch {
        diagnostics.push({
          code: 'GITHUB_REVIEW_THREAD_STATE_FETCH_FAILED',
          message: 'GitHub review thread の resolved 状態取得に失敗しました。',
          severity: 'warning',
        });
      }
      const normalized = normalizeGitHubRemoteThreads(
        rawReviewComments as unknown as Parameters<typeof normalizeGitHubRemoteThreads>[0],
        rawIssueComments as unknown as Parameters<typeof normalizeGitHubRemoteThreads>[1],
        headSha,
        threadStates,
      );
      remoteThreads = resolveRemoteThreadAnchors({ threads: normalized, changedFiles, headSha });
    } catch {
      diagnostics.push({
        code: 'REMOTE_COMMENTS_FETCH_FAILED',
        message: 'コメントの取得に失敗しました。',
        severity: 'warning',
      });
    }

    return {
      provider: 'github',
      reviewId: String(detail.number),
      title: detail.title ?? '',
      description: detail.body ?? '',
      baseSha: detail.base.sha,
      headSha,
      startSha: null,
      sourceBranchName: detail.head.ref ?? null,
      diffVersion: null,
      changedFiles,
      remoteThreads,
      commits: commitsResponse.map(
        (commit): Poc3RevisionCommit => ({
          sha: commit.sha,
          shortSha: commit.sha.slice(0, 7),
          message: commit.commit.message.split(/\r?\n/)[0] ?? commit.commit.message,
          author: {
            name: commit.commit.author?.name ?? 'unknown',
            email: commit.commit.author?.email ?? null,
            avatarUrl: commit.author?.avatar_url ?? null,
          },
          authoredAt: commit.commit.author?.date ?? null,
          committedAt: commit.commit.committer?.date ?? null,
          parents: commit.parents?.map((parent) => parent.sha) ?? [],
          refs: [],
          url: commit.html_url,
        }),
      ),
      diagnostics,
    };
  }

  const encoded = encodeURIComponent(input.repositoryPath);
  const headers = {
    'PRIVATE-TOKEN': input.token,
  };
  const mr = await fetchJson<GitlabMergeRequestResponse>(
    `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}`,
    headers,
    input.fetchImpl,
  );
  const transport = {
    fetchJson: <T>(url: string) => fetchJson<T>(url, headers, input.fetchImpl),
    fetchPagedJson: <T>(url: string, limit: number) =>
      fetchPaginatedJson<T>(url, headers, limit, input.fetchImpl),
    fetchText: (url: string) => fetchText(url, headers, input.fetchImpl),
    getHttpStatus: (err: unknown) => (isProviderApiError(err) ? err.status : null),
  };
  const refsResult = await resolveGitLabDiffRefs({
    endpoint,
    projectPathOrId: input.repositoryPath,
    mergeRequestIid: input.reviewId,
    mrDiffRefs: mr.diff_refs,
    mrSha: mr.sha,
    transport,
  });
  const diffResult = await fetchGitLabMergeRequestDiffsWithFallback({
    endpoint,
    projectPathOrId: input.repositoryPath,
    mergeRequestIid: input.reviewId,
    maxChangedFiles: MAX_CHANGED_FILES,
    transport,
  });
  const diffs = diffResult.diffs;
  const commitsResponse = await fetchPaginatedJson<GitlabMergeRequestCommitResponse>(
    `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}/commits`,
    headers,
    1000,
    input.fetchImpl,
  );
  const baseSha = refsResult.refs.baseSha;
  const headSha = refsResult.refs.headSha;
  if (!headSha) {
    throw new Error('GitLab Merge Request から head sha を取得できませんでした。');
  }
  const diagnostics: GitLabSourceDiagnostic[] = [
    ...refsResult.diagnostics,
    ...diffResult.diagnostics,
  ];
  if (diffs.length > MAX_CHANGED_FILES) {
    diagnostics.push({
      code: 'CHANGED_FILES_LIMIT_EXCEEDED',
      message: `Changed files が上限 ${MAX_CHANGED_FILES} 件を超えました。`,
      severity: 'error',
    });
  }
  const changedFiles = diffs.slice(0, MAX_CHANGED_FILES).map((file): ReviewChangedFile => {
    const path = file.new_path || file.old_path;
    const patch = file.too_large || file.collapsed ? null : file.diff;
    if (file.too_large || file.collapsed) {
      diagnostics.push({
        code: 'DIFF_TRUNCATED',
        message: `${path} の diff が省略されています。`,
        severity: 'warning',
        filePath: path,
      });
    }
    const counts = countPatchLines(patch);
    return {
      path,
      oldPath: file.renamed_file ? file.old_path : null,
      status: normalizeGitlabStatus(file),
      additions: counts.additions,
      deletions: counts.deletions,
      patch,
      hunks: parseUnifiedDiffHunks(path, patch),
    };
  });

  let remoteThreads: ReviewRemoteThread[] = [];
  try {
    const rawDiscussions = await fetchPaginatedJson<Record<string, unknown>>(
      `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}/discussions`,
      headers,
      3000,
      input.fetchImpl,
    );
    const normalized = normalizeGitLabRemoteThreads(
      rawDiscussions as unknown as Parameters<typeof normalizeGitLabRemoteThreads>[0],
    );
    remoteThreads = resolveRemoteThreadAnchors({ threads: normalized, changedFiles, headSha });
  } catch {
    diagnostics.push({
      code: 'REMOTE_COMMENTS_FETCH_FAILED',
      message: 'コメントの取得に失敗しました。',
      severity: 'warning',
    });
  }

  return {
    provider: 'gitlab',
    reviewId: String(mr.iid),
    title: mr.title ?? '',
    description: mr.description ?? '',
    baseSha,
    headSha,
    startSha: refsResult.refs.startSha,
    sourceBranchName: mr.source_branch ?? null,
    diffVersion: null,
    changedFiles,
    remoteThreads,
    commits: commitsResponse.map(
      (commit): Poc3RevisionCommit => ({
        sha: commit.id,
        shortSha: commit.short_id || commit.id.slice(0, 7),
        message: commit.title || commit.message.split(/\r?\n/)[0] || commit.message,
        author: {
          name: commit.author_name || 'unknown',
          email: commit.author_email ?? null,
          avatarUrl: null,
        },
        authoredAt: commit.authored_date ?? null,
        committedAt: commit.committed_date ?? null,
        parents: commit.parent_ids ?? [],
        refs: [],
        url: commit.web_url,
      }),
    ),
    diagnostics,
  };
}
