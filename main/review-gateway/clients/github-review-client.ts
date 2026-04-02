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
  };
}
