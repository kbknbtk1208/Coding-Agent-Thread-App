import type { Poc3InlineCommentAnchor } from '../../../shared/poc3-domain/comment-publish';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import { resolveGitLabDiffRefs, type GitLabDiffRefs } from '../../helpers/gitlab-diff-refs';
import { apiEndpointForProvider } from './repository-url';
import type { FetchLike } from './review-source-gateway';

export interface PostInlineCommentGitHubInput {
  kind: 'github';
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  pullNumber: string;
  body: string;
  anchor: Poc3InlineCommentAnchor;
  sourceSnapshot: ReviewSourceSnapshot;
  fetchImpl?: FetchLike;
}

export interface PostInlineCommentGitLabInput {
  kind: 'gitlab';
  baseUrl: string;
  token: string;
  projectPathOrId: string;
  mergeRequestIid: string;
  body: string;
  anchor: Poc3InlineCommentAnchor;
  sourceSnapshot: ReviewSourceSnapshot;
  fetchImpl?: FetchLike;
}

export interface PostReplyGitHubInput {
  kind: 'github';
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  pullNumber: string;
  body: string;
  topLevelCommentId: string;
}

export interface PostReplyGitLabInput {
  kind: 'gitlab';
  baseUrl: string;
  token: string;
  projectPathOrId: string;
  mergeRequestIid: string;
  body: string;
  discussionId: string;
}

export interface ResolveGitHubReviewThreadInput {
  kind: 'github';
  baseUrl: string;
  token: string;
  threadNodeId: string;
}

export interface ResolveGitLabDiscussionInput {
  kind: 'gitlab';
  baseUrl: string;
  token: string;
  projectPathOrId: string;
  mergeRequestIid: string;
  discussionId: string;
}

export interface ResolveThreadResult {
  providerThreadId: string;
  remoteThread?: ReviewRemoteThread;
}

export interface PostCommentResult {
  providerThreadId: string;
  providerCommentIds: string[];
}

export async function postGitHubInlineComment(
  input: PostInlineCommentGitHubInput,
): Promise<PostCommentResult> {
  const endpoint = apiEndpointForProvider('github', input.baseUrl);
  const url = `${endpoint}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/comments`;

  const payload: Record<string, unknown> = {
    body: input.body,
    commit_id: input.sourceSnapshot.headSha,
    path: input.anchor.filePath,
    line: input.anchor.endLine,
    side: input.anchor.side,
  };
  if (input.anchor.startLine !== null && input.anchor.startLine !== input.anchor.endLine) {
    payload.start_line = input.anchor.startLine;
    payload.start_side = input.anchor.side;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitHub が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }

  const data = (await response.json()) as { id: number };
  const commentId = String(data.id);
  return {
    providerThreadId: `github-review-comment:${commentId}`,
    providerCommentIds: [commentId],
  };
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

export async function resolveGitHubReviewThread(
  input: ResolveGitHubReviewThreadInput,
): Promise<ResolveThreadResult> {
  const response = await fetch(githubGraphqlEndpoint(input.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation ResolveReviewThread($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread { id isResolved }
          }
        }
      `,
      variables: { threadId: input.threadNodeId },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitHub GraphQL が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }
  const data = (await response.json()) as { errors?: unknown[] };
  if (data.errors && data.errors.length > 0) {
    throw new ProviderRejectedError(`GitHub GraphQL が resolve を拒否しました。`);
  }
  return { providerThreadId: input.threadNodeId };
}

export async function postGitHubReply(input: PostReplyGitHubInput): Promise<PostCommentResult> {
  const endpoint = apiEndpointForProvider('github', input.baseUrl);
  const url = `${endpoint}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/comments/${input.topLevelCommentId}/replies`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: input.body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitHub が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }

  const data = (await response.json()) as { id: number };
  const commentId = String(data.id);
  return {
    providerThreadId: `github-review-comment:${input.topLevelCommentId}`,
    providerCommentIds: [commentId],
  };
}

export async function postGitLabInlineComment(
  input: PostInlineCommentGitLabInput,
): Promise<PostCommentResult> {
  const endpoint = apiEndpointForProvider('gitlab', input.baseUrl);
  const encodedProject = encodeURIComponent(input.projectPathOrId);
  const url = `${endpoint}/projects/${encodedProject}/merge_requests/${input.mergeRequestIid}/discussions`;

  const { sourceSnapshot, anchor } = input;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let refs: GitLabDiffRefs = {
    baseSha: sourceSnapshot.baseSha,
    headSha: sourceSnapshot.headSha,
    startSha: sourceSnapshot.startSha,
  };
  if (!refs.baseSha || !refs.headSha || !refs.startSha) {
    refs = await fetchLatestGitLabDiffRefs({
      endpoint,
      projectPathOrId: input.projectPathOrId,
      mergeRequestIid: input.mergeRequestIid,
      token: input.token,
      fetchImpl,
      fallbackRefs: refs,
      forceRefresh: false,
    });
  }

  const buildPosition = (nextRefs: GitLabDiffRefs): Record<string, unknown> => {
    if (!nextRefs.baseSha || !nextRefs.headSha || !nextRefs.startSha) {
      throw new ProviderRejectedError(
        'GitLab inline コメントに必要な diff refs を取得できませんでした。',
      );
    }
    const position: Record<string, unknown> = {
      position_type: 'text',
      base_sha: nextRefs.baseSha,
      head_sha: nextRefs.headSha,
      start_sha: nextRefs.startSha,
      old_path: anchor.oldPath ?? anchor.filePath,
      new_path: anchor.filePath,
    };

    if (anchor.side === 'RIGHT') {
      position.new_line = anchor.endLine;
    } else {
      position.old_line = anchor.endLine;
    }

    if (anchor.startLine !== null && anchor.startLine !== anchor.endLine) {
      const startType = anchor.side === 'RIGHT' ? 'new' : 'old';
      const endType = startType;
      const startLineCode = buildGitLabLineCode(
        anchor.oldPath ?? anchor.filePath,
        anchor.filePath,
        anchor.startLine,
        anchor.side,
      );
      const endLineCode = buildGitLabLineCode(
        anchor.oldPath ?? anchor.filePath,
        anchor.filePath,
        anchor.endLine,
        anchor.side,
      );
      position.line_range = {
        start: { line_code: startLineCode, type: startType },
        end: { line_code: endLineCode, type: endType },
      };
    }
    return position;
  };

  let response = await postGitLabDiscussion(
    fetchImpl,
    url,
    input.token,
    input.body,
    buildPosition(refs),
  );

  if (!response.ok && (response.status === 400 || response.status === 422)) {
    refs = await fetchLatestGitLabDiffRefs({
      endpoint,
      projectPathOrId: input.projectPathOrId,
      mergeRequestIid: input.mergeRequestIid,
      token: input.token,
      fetchImpl,
      fallbackRefs: refs,
      forceRefresh: true,
    });
    response = await postGitLabDiscussion(
      fetchImpl,
      url,
      input.token,
      input.body,
      buildPosition(refs),
    );
  }

  await ensureGitLabOk(response);

  const data = (await response.json()) as { id: string; notes: Array<{ id: number }> };
  const discussionId = data.id;
  const commentId = String(data.notes[0]?.id ?? '');
  return {
    providerThreadId: `gitlab-discussion:${discussionId}`,
    providerCommentIds: commentId ? [commentId] : [],
  };
}

async function postGitLabDiscussion(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  body: string,
  position: Record<string, unknown>,
): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body, position }),
  });
}

async function ensureGitLabOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const text = await response.text().catch(() => '');
  throw new ProviderRejectedError(
    `GitLab が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
  );
}

async function fetchLatestGitLabDiffRefs(input: {
  endpoint: string;
  projectPathOrId: string;
  mergeRequestIid: string;
  token: string;
  fetchImpl: FetchLike;
  fallbackRefs: GitLabDiffRefs;
  forceRefresh: boolean;
}): Promise<GitLabDiffRefs> {
  try {
    const result = await resolveGitLabDiffRefs({
      endpoint: input.endpoint,
      projectPathOrId: input.projectPathOrId,
      mergeRequestIid: input.mergeRequestIid,
      mrDiffRefs: {
        base_sha: input.fallbackRefs.baseSha,
        head_sha: input.fallbackRefs.headSha,
        start_sha: input.fallbackRefs.startSha,
      },
      forceRefresh: input.forceRefresh,
      transport: {
        fetchPagedJson: async <T>(url: string): Promise<T[]> => {
          const separator = url.includes('?') ? '&' : '?';
          const response = await input.fetchImpl(`${url}${separator}per_page=1&page=1`, {
            headers: { 'PRIVATE-TOKEN': input.token },
          });
          if (!response.ok) {
            throw new GitLabPostHttpError(response.status);
          }
          return (await response.json()) as T[];
        },
        getHttpStatus: (err) => (err instanceof GitLabPostHttpError ? err.status : null),
      },
    });
    return result.refs;
  } catch (err) {
    if (err instanceof GitLabPostHttpError) {
      throw new ProviderRejectedError(`GitLab が HTTP ${err.status} を返しました。`);
    }
    throw err;
  }
}

class GitLabPostHttpError extends Error {
  constructor(readonly status: number) {
    super(`GitLab HTTP ${status}`);
  }
}

export async function postGitLabReply(input: PostReplyGitLabInput): Promise<PostCommentResult> {
  const endpoint = apiEndpointForProvider('gitlab', input.baseUrl);
  const encodedProject = encodeURIComponent(input.projectPathOrId);
  const url = `${endpoint}/projects/${encodedProject}/merge_requests/${input.mergeRequestIid}/discussions/${input.discussionId}/notes`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': input.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: input.body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitLab が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }

  const data = (await response.json()) as { id: number };
  const commentId = String(data.id);
  return {
    providerThreadId: `gitlab-discussion:${input.discussionId}`,
    providerCommentIds: [commentId],
  };
}

export async function resolveGitLabDiscussion(
  input: ResolveGitLabDiscussionInput,
): Promise<ResolveThreadResult> {
  const endpoint = apiEndpointForProvider('gitlab', input.baseUrl);
  const encodedProject = encodeURIComponent(input.projectPathOrId);
  const url = `${endpoint}/projects/${encodedProject}/merge_requests/${input.mergeRequestIid}/discussions/${input.discussionId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'PRIVATE-TOKEN': input.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resolved: true }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitLab が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }
  return { providerThreadId: `gitlab-discussion:${input.discussionId}` };
}

function buildGitLabLineCode(
  oldPath: string,
  newPath: string,
  line: number,
  side: 'LEFT' | 'RIGHT',
): string {
  const sha = side === 'RIGHT' ? newPath : oldPath;
  return `${sha}_${line}_${line}`;
}

export class ProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRejectedError';
  }
}
