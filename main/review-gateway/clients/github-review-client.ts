import type { GitHubPRFile, GitHubPRReviewComment } from '../../../shared/domain/review-provider';
import type { ReviewProvider } from '../../../shared/domain/review';
import { requestJson, requestPagedJson, type FetchLike } from '../request-json';

export interface GitHubPullRequestDetail {
  number: number;
  title: string;
  body: string | null;
  base: {
    sha: string;
  };
  head: {
    sha: string;
  };
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GitHubCreatedIssueComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  html_url: string;
}

export interface GitHubCreatedReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  start_line: number | null;
  start_side?: 'LEFT' | 'RIGHT' | null;
  side: string;
  user: { login: string };
  created_at: string;
  commit_id: string;
  diff_hunk: string;
  in_reply_to_id?: number;
  original_commit_id?: string;
  html_url: string;
}

export interface GitHubCreateIssueCommentPayload {
  body: string;
}

export interface GitHubCreateReviewCommentPayload {
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

export interface GitHubReviewClient {
  provider: ReviewProvider;
  fetchPullRequestDetail(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullRequestDetail>;
  fetchPullRequestFiles(owner: string, repo: string, pullNumber: number): Promise<GitHubPRFile[]>;
  fetchPullRequestComments(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPRReviewComment[]>;
  fetchIssueComments(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubIssueComment[]>;
  createIssueComment(
    owner: string,
    repo: string,
    pullNumber: number,
    payload: GitHubCreateIssueCommentPayload,
  ): Promise<GitHubCreatedIssueComment>;
  createReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    payload: GitHubCreateReviewCommentPayload,
  ): Promise<GitHubCreatedReviewComment>;
}

function encodePathSegment(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function createUrl(baseUrl: string, pathname: string): URL {
  return new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

export function createGitHubReviewClient(args: {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
}): GitHubReviewClient {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${args.token}`,
    'X-GitHub-Api-Version': '2026-03-10',
  };

  return {
    provider: 'github',
    async fetchPullRequestDetail(owner, repo, pullNumber) {
      return requestJson<GitHubPullRequestDetail>(
        createUrl(
          args.baseUrl,
          `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/pulls/${pullNumber}`,
        ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async fetchPullRequestFiles(owner, repo, pullNumber) {
      return requestPagedJson<GitHubPRFile>(
        () =>
          createUrl(
            args.baseUrl,
            `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/pulls/${pullNumber}/files`,
          ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async fetchPullRequestComments(owner, repo, pullNumber) {
      return requestPagedJson<GitHubPRReviewComment>(
        () =>
          createUrl(
            args.baseUrl,
            `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/pulls/${pullNumber}/comments`,
          ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async fetchIssueComments(owner, repo, pullNumber) {
      return requestPagedJson<GitHubIssueComment>(
        () =>
          createUrl(
            args.baseUrl,
            `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/issues/${pullNumber}/comments`,
          ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async createIssueComment(owner, repo, pullNumber, payload) {
      return requestJson<GitHubCreatedIssueComment>(
        createUrl(
          args.baseUrl,
          `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/issues/${pullNumber}/comments`,
        ),
        {
          fetchImpl: args.fetchImpl,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    },
    async createReviewComment(owner, repo, pullNumber, payload) {
      return requestJson<GitHubCreatedReviewComment>(
        createUrl(
          args.baseUrl,
          `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/pulls/${pullNumber}/comments`,
        ),
        {
          fetchImpl: args.fetchImpl,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    },
  };
}
