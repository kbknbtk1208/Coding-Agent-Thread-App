import type { Poc3InlineCommentAnchor } from '../../../shared/poc3-domain/comment-publish';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import { apiEndpointForProvider } from './repository-url';

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

  const position: Record<string, unknown> = {
    position_type: 'text',
    base_sha: sourceSnapshot.baseSha,
    head_sha: sourceSnapshot.headSha,
    start_sha: sourceSnapshot.startSha ?? sourceSnapshot.baseSha,
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': input.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: input.body, position }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderRejectedError(
      `GitLab が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
    );
  }

  const data = (await response.json()) as { id: string; notes: Array<{ id: number }> };
  const discussionId = data.id;
  const commentId = String(data.notes[0]?.id ?? '');
  return {
    providerThreadId: `gitlab-discussion:${discussionId}`,
    providerCommentIds: commentId ? [commentId] : [],
  };
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
