import type { ReviewSourceSnapshot } from './source-snapshot';

export type ThreadResolveFailureReason =
  | 'workspaceNotFound'
  | 'revisionNotFound'
  | 'sourceSnapshotNotFound'
  | 'threadNotFound'
  | 'threadNotResolvable'
  | 'providerUnavailable'
  | 'tokenNotFound'
  | 'providerRejected'
  | 'localPersistenceFailed';

export type RemoteThreadResolveStatus = 'resolved' | 'skipped' | 'failed';

export interface RemoteThreadResolveItemResult {
  providerThreadId: string;
  status: RemoteThreadResolveStatus;
  reason?: ThreadResolveFailureReason | 'alreadyResolved' | 'missingRemote' | 'overview';
  message?: string;
}

export interface ResolveAgentThreadInput {
  reviewWorkspaceId: string;
  revisionId: string;
  localThreadId: string;
}

export interface ResolveRemoteThreadInput {
  reviewWorkspaceId: string;
  revisionId: string;
  providerThreadId: string;
}

export type ResolveAgentThreadResult =
  | {
      ok: true;
      localThreadId: string;
      agentThreadStatus: 'resolved';
      sourceSnapshot: ReviewSourceSnapshot | null;
      remoteResults: RemoteThreadResolveItemResult[];
    }
  | {
      ok: false;
      reason: ThreadResolveFailureReason;
      message: string;
    };

export type ResolveRemoteThreadResult =
  | {
      ok: true;
      providerThreadId: string;
      sourceSnapshot: ReviewSourceSnapshot;
    }
  | {
      ok: false;
      reason: ThreadResolveFailureReason;
      message: string;
    };

export function isUnresolvedAgentThread(thread: { status: 'open' | 'resolved' }): boolean {
  return thread.status === 'open';
}

export function isUnresolvedRemoteThread(thread: {
  isResolved: boolean | null;
  location: { kind: string };
}): boolean {
  return thread.location.kind === 'diff' && thread.isResolved !== true;
}

export function isResolvableAgentThread(thread: {
  status: 'open' | 'resolved';
  location: { kind: string };
}): boolean {
  return thread.status === 'open' && thread.location.kind !== 'overview';
}

export function isResolvableRemoteThread(thread: {
  isResolved: boolean | null;
  location: { kind: string };
}): boolean {
  return thread.location.kind === 'diff' && thread.isResolved !== true;
}
