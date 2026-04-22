import type { ReviewProviderKind } from '../../../shared/poc3-domain/review-workspace';
import { apiEndpointForProvider } from './repository-url';

export interface ReviewSourceSnapshot {
  provider: ReviewProviderKind;
  reviewId: string;
  title: string;
  description: string;
  baseSha: string;
  headSha: string;
  sourceBranchName: string | null;
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

interface GitlabMergeRequestResponse {
  iid: number;
  title: string;
  description: string | null;
  diff_refs: { base_sha: string; head_sha: string; start_sha?: string } | null;
  source_branch: string | null;
  sha: string | null;
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Provider API error: HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchReviewSourceSnapshot(
  input: ReviewSourceFetchInput,
): Promise<ReviewSourceSnapshot> {
  const endpoint = apiEndpointForProvider(input.provider, input.baseUrl);
  if (input.provider === 'github') {
    const [owner, repo] = input.repositoryPath.split('/');
    if (!owner || !repo) {
      throw new Error(`GitHub repository path の形式が不正です: ${input.repositoryPath}`);
    }
    const detail = await fetchJson<GithubPullResponse>(
      `${endpoint}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(
        input.reviewId,
      )}`,
      {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${input.token}`,
      },
    );
    return {
      provider: 'github',
      reviewId: String(detail.number),
      title: detail.title ?? '',
      description: detail.body ?? '',
      baseSha: detail.base.sha,
      headSha: detail.head.sha,
      sourceBranchName: detail.head.ref ?? null,
    };
  }

  const encoded = encodeURIComponent(input.repositoryPath);
  const mr = await fetchJson<GitlabMergeRequestResponse>(
    `${endpoint}/projects/${encoded}/merge_requests/${encodeURIComponent(input.reviewId)}`,
    {
      'PRIVATE-TOKEN': input.token,
    },
  );
  const baseSha = mr.diff_refs?.base_sha ?? '';
  const headSha = mr.diff_refs?.head_sha ?? mr.sha ?? '';
  if (!headSha) {
    throw new Error('GitLab Merge Request から head sha を取得できませんでした。');
  }
  return {
    provider: 'gitlab',
    reviewId: String(mr.iid),
    title: mr.title ?? '',
    description: mr.description ?? '',
    baseSha,
    headSha,
    sourceBranchName: mr.source_branch ?? null,
  };
}
