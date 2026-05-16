import type { GitLabDiscussion, GitLabMRDiff } from '../../../shared/domain/review-provider';
import type { ReviewProvider } from '../../../shared/domain/review';
import {
  fetchGitLabMergeRequestDiffsWithFallback,
  type GitLabNormalizedMergeRequestDiff,
} from '../../helpers/gitlab-merge-request-diffs';
import { requestJson, requestPagedJson, requestText, type FetchLike } from '../request-json';
import { isReviewGatewayError } from '../review-gateway-error';

export interface GitLabMergeRequestDetail {
  iid: number;
  title: string;
  description: string | null;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha?: string;
  };
}

export interface GitLabCreatedDiscussion {
  id: string;
  notes: Array<{
    id: number;
    body: string;
    author: { username: string };
    created_at: string;
    position?: {
      new_path: string;
      old_path: string;
      new_line: number | null;
      old_line: number | null;
      line_range?: {
        start: { new_line: number | null; old_line: number | null; type: string };
        end: { new_line: number | null; old_line: number | null; type: string };
      };
    } | null;
    resolvable: boolean;
    resolved?: boolean;
  }>;
}

export interface GitLabCreateDiscussionPosition {
  position_type: 'text';
  base_sha: string;
  head_sha: string;
  start_sha: string;
  new_path?: string;
  old_path?: string;
  new_line?: number;
  old_line?: number;
  line_range?: {
    start: { line_code: string; type: 'old' | 'new' };
    end: { line_code: string; type: 'old' | 'new' };
  };
}

export interface GitLabCreateDiscussionPayload {
  body: string;
  position?: GitLabCreateDiscussionPosition;
}

export interface GitLabReviewClient {
  provider: ReviewProvider;
  fetchMergeRequestDetail(
    projectPathOrId: string,
    mergeRequestIid: number,
  ): Promise<GitLabMergeRequestDetail>;
  fetchMergeRequestDiffs(projectPathOrId: string, mergeRequestIid: number): Promise<GitLabMRDiff[]>;
  fetchMergeRequestDiscussions(
    projectPathOrId: string,
    mergeRequestIid: number,
  ): Promise<GitLabDiscussion[]>;
  createMergeRequestDiscussion(
    projectPathOrId: string,
    mergeRequestIid: number,
    payload: GitLabCreateDiscussionPayload,
  ): Promise<GitLabCreatedDiscussion>;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function createUrl(baseUrl: string, pathname: string): URL {
  return new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function toLegacyGitLabDiff(diff: GitLabNormalizedMergeRequestDiff): GitLabMRDiff {
  return {
    old_path: diff.old_path,
    new_path: diff.new_path,
    a_mode: diff.a_mode ?? '',
    b_mode: diff.b_mode ?? '',
    diff: diff.diff ?? '',
    new_file: diff.new_file,
    renamed_file: diff.renamed_file,
    deleted_file: diff.deleted_file,
    collapsed: diff.collapsed,
    too_large: diff.too_large,
  };
}

export function createGitLabReviewClient(args: {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
}): GitLabReviewClient {
  const headers = {
    'PRIVATE-TOKEN': args.token,
  };

  return {
    provider: 'gitlab',
    async fetchMergeRequestDetail(projectPathOrId, mergeRequestIid) {
      return requestJson<GitLabMergeRequestDetail>(
        createUrl(
          args.baseUrl,
          `/api/v4/projects/${encodePathSegment(projectPathOrId)}/merge_requests/${mergeRequestIid}`,
        ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async fetchMergeRequestDiffs(projectPathOrId, mergeRequestIid) {
      const result = await fetchGitLabMergeRequestDiffsWithFallback({
        endpoint: createUrl(args.baseUrl, '/api/v4').toString().replace(/\/$/, ''),
        projectPathOrId,
        mergeRequestIid,
        maxChangedFiles: 300,
        transport: {
          fetchJson: (url) => requestJson(url, { fetchImpl: args.fetchImpl, headers }),
          fetchPagedJson: (url, limit, pageSize) =>
            requestPagedJson(() => url, {
              fetchImpl: args.fetchImpl,
              headers,
              pageSize,
              maxPages: Math.max(1, Math.ceil(limit / (pageSize ?? 100))),
            }),
          fetchText: (url) => requestText(url, { fetchImpl: args.fetchImpl, headers }),
          getHttpStatus: (err) => (isReviewGatewayError(err) ? (err.status ?? null) : null),
        },
      });
      return result.diffs.map(toLegacyGitLabDiff);
    },
    async fetchMergeRequestDiscussions(projectPathOrId, mergeRequestIid) {
      return requestPagedJson<GitLabDiscussion>(
        () =>
          createUrl(
            args.baseUrl,
            `/api/v4/projects/${encodePathSegment(projectPathOrId)}/merge_requests/${mergeRequestIid}/discussions`,
          ),
        { fetchImpl: args.fetchImpl, headers },
      );
    },
    async createMergeRequestDiscussion(projectPathOrId, mergeRequestIid, payload) {
      return requestJson<GitLabCreatedDiscussion>(
        createUrl(
          args.baseUrl,
          `/api/v4/projects/${encodePathSegment(projectPathOrId)}/merge_requests/${mergeRequestIid}/discussions`,
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
