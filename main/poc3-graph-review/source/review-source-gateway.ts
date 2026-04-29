import type { ReviewProviderKind } from '../../../shared/poc3-domain/review-workspace';
import type {
  ReviewChangedFile,
  ReviewChangedFileStatus,
} from '../../../shared/poc3-domain/source-snapshot';
import type { RevisionCommit as Poc3RevisionCommit } from '../../../shared/poc3-domain/revision-commit';
import { apiEndpointForProvider } from './repository-url';
import { parseUnifiedDiffHunks } from './unified-diff-parser';

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
  diagnostics: Array<{ code: string; message: string }>;
}

export interface ReviewSourceFetchInput {
  provider: ReviewProviderKind;
  baseUrl: string;
  token: string;
  repositoryPath: string;
  reviewId: string;
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

interface GitlabMergeRequestDiffResponse {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string | null;
  too_large?: boolean;
  collapsed?: boolean;
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

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Provider API error: HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchPaginatedJson<T>(
  url: string,
  headers: Record<string, string>,
  limit: number,
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (rows.length <= limit) {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}per_page=100&page=${page}`, { headers });
    if (!response.ok) {
      throw new Error(`Provider API error: HTTP ${response.status} for ${url}`);
    }
    const body = (await response.json()) as T[];
    rows.push(...body);
    const next = response.headers.get('link')?.includes('rel="next"') ?? false;
    if (!next || body.length === 0) {
      break;
    }
    page += 1;
  }
  return rows;
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

function normalizeGitlabStatus(file: GitlabMergeRequestDiffResponse): ReviewChangedFileStatus {
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
    );
    const files = await fetchPaginatedJson<GithubPullFileResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}/files`,
      headers,
      MAX_CHANGED_FILES,
    );
    const commitsResponse = await fetchPaginatedJson<GithubPullCommitResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}/commits`,
      headers,
      1000,
    );
    const diagnostics: Array<{ code: string; message: string }> = [];
    if (files.length > MAX_CHANGED_FILES) {
      diagnostics.push({
        code: 'CHANGED_FILES_LIMIT_EXCEEDED',
        message: `Changed files が上限 ${MAX_CHANGED_FILES} 件を超えました。`,
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
    return {
      provider: 'github',
      reviewId: String(detail.number),
      title: detail.title ?? '',
      description: detail.body ?? '',
      baseSha: detail.base.sha,
      headSha: detail.head.sha,
      startSha: null,
      sourceBranchName: detail.head.ref ?? null,
      diffVersion: null,
      changedFiles,
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
  );
  const diffs = await fetchPaginatedJson<GitlabMergeRequestDiffResponse>(
    `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}/diffs`,
    headers,
    MAX_CHANGED_FILES,
  );
  const commitsResponse = await fetchPaginatedJson<GitlabMergeRequestCommitResponse>(
    `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}/commits`,
    headers,
    1000,
  );
  const baseSha = mr.diff_refs?.base_sha ?? '';
  const headSha = mr.diff_refs?.head_sha ?? mr.sha ?? '';
  if (!headSha) {
    throw new Error('GitLab Merge Request から head sha を取得できませんでした。');
  }
  const diagnostics: Array<{ code: string; message: string }> = [];
  if (diffs.length > MAX_CHANGED_FILES) {
    diagnostics.push({
      code: 'CHANGED_FILES_LIMIT_EXCEEDED',
      message: `Changed files が上限 ${MAX_CHANGED_FILES} 件を超えました。`,
    });
  }
  const changedFiles = diffs.slice(0, MAX_CHANGED_FILES).map((file): ReviewChangedFile => {
    const path = file.new_path || file.old_path;
    const patch = file.too_large || file.collapsed ? null : file.diff;
    if (file.too_large || file.collapsed) {
      diagnostics.push({
        code: 'DIFF_TRUNCATED',
        message: `${path} の diff が省略されています。`,
      });
    }
    return {
      path,
      oldPath: file.renamed_file ? file.old_path : null,
      status: normalizeGitlabStatus(file),
      additions: null,
      deletions: null,
      patch,
      hunks: parseUnifiedDiffHunks(path, patch),
    };
  });
  return {
    provider: 'gitlab',
    reviewId: String(mr.iid),
    title: mr.title ?? '',
    description: mr.description ?? '',
    baseSha,
    headSha,
    startSha: mr.diff_refs?.start_sha ?? null,
    sourceBranchName: mr.source_branch ?? null,
    diffVersion: null,
    changedFiles,
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
