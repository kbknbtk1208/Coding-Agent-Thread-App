import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import { apiEndpointForProvider } from './repository-url';
import { ProviderRejectedError } from './review-comment-client';

export interface ResolveRemoteThreadProviderInput {
  token: string;
  profile: RepositoryProfile;
  workspace: ReviewWorkspace;
  sourceSnapshot: ReviewSourceSnapshot;
  remoteThread: ReviewRemoteThread;
}

export interface ResolveRemoteThreadProviderResult {
  providerThreadId: string;
  isResolved: true;
  remoteThread?: ReviewRemoteThread;
}

export class ReviewThreadResolveClient {
  async resolveRemoteThread(
    input: ResolveRemoteThreadProviderInput,
  ): Promise<ResolveRemoteThreadProviderResult> {
    if (input.profile.resolvedProvider.kind === 'github') {
      return this.resolveGitHubThread(input);
    }
    return this.resolveGitLabThread(input);
  }

  private async resolveGitHubThread(
    input: ResolveRemoteThreadProviderInput,
  ): Promise<ResolveRemoteThreadProviderResult> {
    const locator = input.profile.repoLocator;
    if (locator.kind !== 'github') {
      throw new ProviderRejectedError('GitHub provider locator が不正です。');
    }
    if (!input.remoteThread.providerThreadId.startsWith('github-review-comment:')) {
      throw new ThreadNotResolvableError('GitHub issue comment は resolve 対象外です。');
    }

    const threadId =
      input.remoteThread.providerContext.resolve?.githubReviewThreadNodeId ??
      (await findGitHubReviewThreadNodeId({
        baseUrl: input.profile.resolvedProvider.baseUrl,
        token: input.token,
        owner: locator.owner,
        repo: locator.repo,
        pullNumber: input.sourceSnapshot.reviewId,
        rootCommentDatabaseId: Number(input.remoteThread.providerContext.remoteDiscussionId),
      }));
    if (!threadId) {
      throw new ThreadNotResolvableError('GitHub review thread node id を解決できません。');
    }

    const response = await fetch(githubGraphqlEndpoint(input.profile.resolvedProvider.baseUrl), {
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
        variables: { threadId },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderRejectedError(
        `GitHub GraphQL が HTTP ${response.status} を返しました。${text ? ` ${text}` : ''}`,
      );
    }
    const data = (await response.json()) as {
      data?: { resolveReviewThread?: { thread?: { isResolved?: boolean | null } | null } | null };
      errors?: Array<{ message?: string }>;
    };
    if (data.errors?.length) {
      throw new ProviderRejectedError(
        data.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join('\n') || 'GitHub review thread の resolve に失敗しました。',
      );
    }
    if (data.data?.resolveReviewThread?.thread?.isResolved !== true) {
      throw new ProviderRejectedError('GitHub review thread が resolved になりませんでした。');
    }

    return {
      providerThreadId: input.remoteThread.providerThreadId,
      isResolved: true,
      remoteThread: {
        ...input.remoteThread,
        isResolved: true,
        providerContext: {
          ...input.remoteThread.providerContext,
          resolve: {
            ...input.remoteThread.providerContext.resolve,
            githubReviewThreadNodeId: threadId,
          },
        },
      },
    };
  }

  private async resolveGitLabThread(
    input: ResolveRemoteThreadProviderInput,
  ): Promise<ResolveRemoteThreadProviderResult> {
    const locator = input.profile.repoLocator;
    if (locator.kind !== 'gitlab') {
      throw new ProviderRejectedError('GitLab provider locator が不正です。');
    }
    const discussionId =
      input.remoteThread.providerContext.resolve?.gitlabDiscussionId ??
      input.remoteThread.providerContext.remoteDiscussionId;
    if (!discussionId || !input.remoteThread.providerThreadId.startsWith('gitlab-discussion:')) {
      throw new ThreadNotResolvableError('GitLab discussion id を解決できません。');
    }

    const endpoint = apiEndpointForProvider('gitlab', input.profile.resolvedProvider.baseUrl);
    const encodedProject = encodeURIComponent(locator.projectPathOrId);
    const url = `${endpoint}/projects/${encodedProject}/merge_requests/${encodeURIComponent(
      input.sourceSnapshot.reviewId,
    )}/discussions/${encodeURIComponent(discussionId)}`;
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

    return {
      providerThreadId: input.remoteThread.providerThreadId,
      isResolved: true,
      remoteThread: {
        ...input.remoteThread,
        isResolved: true,
        providerContext: {
          ...input.remoteThread.providerContext,
          resolve: {
            ...input.remoteThread.providerContext.resolve,
            gitlabDiscussionId: discussionId,
          },
        },
      },
    };
  }
}

export class ThreadNotResolvableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreadNotResolvableError';
  }
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

async function findGitHubReviewThreadNodeId(input: {
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  pullNumber: string;
  rootCommentDatabaseId: number;
}): Promise<string | null> {
  if (!Number.isFinite(input.rootCommentDatabaseId)) {
    return null;
  }
  let cursor: string | null = null;
  do {
    const response = await fetch(githubGraphqlEndpoint(input.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query ReviewThreadNode($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $number) {
                reviewThreads(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes { id comments(first: 1) { nodes { databaseId } } }
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
      throw new ProviderRejectedError(`GitHub GraphQL が HTTP ${response.status} を返しました。`);
    }
    const data = (await response.json()) as {
      data?: {
        repository?: {
          pullRequest?: {
            reviewThreads?: {
              pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
              nodes?: Array<{
                id: string;
                comments?: { nodes?: Array<{ databaseId?: number | null }> };
              }>;
            };
          };
        };
      };
    };
    const threads = data.data?.repository?.pullRequest?.reviewThreads;
    for (const node of threads?.nodes ?? []) {
      if (node.comments?.nodes?.[0]?.databaseId === input.rootCommentDatabaseId) {
        return node.id;
      }
    }
    cursor = threads?.pageInfo?.hasNextPage ? (threads.pageInfo.endCursor ?? null) : null;
  } while (cursor);
  return null;
}
