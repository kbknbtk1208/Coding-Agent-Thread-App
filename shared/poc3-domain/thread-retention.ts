import type { Poc3AgentReviewLocation, Poc3AgentReviewThread } from './agent-review';
import type { RevisionContext } from './revision';

export type Poc3ThreadTrackingStatus = 'current' | 'tracked' | 'outdated' | 'unavailable';

export type Poc3ThreadOutdatedReason =
  | 'nodeMissing'
  | 'fileDeleted'
  | 'rangeChanged'
  | 'diffAnchorMissing'
  | 'orphanedRevision'
  | 'codeUnavailable';

export interface Poc3ThreadTracking {
  localThreadId: string;
  reviewWorkspaceId: string;
  sourceRevisionId: string;
  checkedRevisionId: string;
  status: Poc3ThreadTrackingStatus;
  reason: Poc3ThreadOutdatedReason | null;
  originalNodeId: string | null;
  trackedNodeId: string | null;
  originalLocation: Poc3AgentReviewLocation;
  checkedAt: string;
}

export interface Poc3OutdatedAgentThread {
  thread: Poc3AgentReviewThread;
  tracking: Poc3ThreadTracking;
  sourceRevision: RevisionContext;
  checkedRevision: RevisionContext;
}
