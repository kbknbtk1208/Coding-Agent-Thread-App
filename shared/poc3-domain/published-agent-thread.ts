import type { ReviewRemoteThread } from './source-snapshot';

export type PublishedAgentThreadLinkStatus = 'active' | 'missingRemote';

export interface PublishedAgentThreadLink {
  linkId: string;
  reviewWorkspaceId: string;
  localThreadId: string;
  sourceRevisionId: string;
  providerThreadId: string;
  providerCommentIds: string[];
  publishedAt: string;
  lastSyncedAt: string;
  status: PublishedAgentThreadLinkStatus;
}

export interface PublishedRemoteThreadSummary {
  link: PublishedAgentThreadLink;
  remoteThread: ReviewRemoteThread | null;
}
