import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type {
  PublishedAgentThreadLink,
  PublishedRemoteThreadSummary,
} from '../../../shared/poc3-domain/published-agent-thread';
import type { ReviewRemoteThread } from '../../../shared/poc3-domain/source-snapshot';

export interface PublishedThreadVisibilityModel {
  visibleRemoteThreads: ReviewRemoteThread[];
  publishedRemoteByLocalThreadId: Map<string, PublishedRemoteThreadSummary[]>;
  suppressedProviderThreadIds: Set<string>;
}

export interface BuildPublishedThreadVisibilityInput {
  reviewWorkspaceId: string;
  agentThreads: Poc3AgentReviewThread[];
  remoteThreads: ReviewRemoteThread[];
  links: PublishedAgentThreadLink[];
}

export function buildPublishedThreadVisibility(
  input: BuildPublishedThreadVisibilityInput,
): PublishedThreadVisibilityModel {
  const visibleLocalThreadIds = new Set(input.agentThreads.map((thread) => thread.localThreadId));
  const openLocalThreadIds = new Set(
    input.agentThreads
      .filter((thread) => thread.status === 'open')
      .map((thread) => thread.localThreadId),
  );
  const remoteThreadByProviderThreadId = new Map(
    input.remoteThreads.map((thread) => [thread.providerThreadId, thread]),
  );
  const publishedRemoteByLocalThreadId = new Map<string, PublishedRemoteThreadSummary[]>();
  const suppressedProviderThreadIds = new Set<string>();

  for (const link of input.links) {
    if (link.reviewWorkspaceId !== input.reviewWorkspaceId) {
      continue;
    }
    if (!visibleLocalThreadIds.has(link.localThreadId)) {
      continue;
    }

    const remoteThread = remoteThreadByProviderThreadId.get(link.providerThreadId) ?? null;
    const summaries = publishedRemoteByLocalThreadId.get(link.localThreadId) ?? [];
    summaries.push({ link, remoteThread });
    publishedRemoteByLocalThreadId.set(link.localThreadId, summaries);

    if (remoteThread && openLocalThreadIds.has(link.localThreadId)) {
      suppressedProviderThreadIds.add(link.providerThreadId);
    }
  }

  return {
    visibleRemoteThreads: input.remoteThreads.filter(
      (thread) => !suppressedProviderThreadIds.has(thread.providerThreadId),
    ),
    publishedRemoteByLocalThreadId,
    suppressedProviderThreadIds,
  };
}
