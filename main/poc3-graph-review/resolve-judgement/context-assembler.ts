import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type {
  ResolveJudgementCodeContext,
  ResolveJudgementLocation,
  ResolveJudgementReply,
  ResolveJudgementTarget,
} from '../../../shared/poc3-domain/resolve-judgement';
import type {
  PublishedAgentThreadLink,
  PublishedRemoteThreadSummary,
} from '../../../shared/poc3-domain/published-agent-thread';
import type {
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type { Poc3AgentReviewStore } from '../agent/store';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { buildPublishedThreadVisibility } from '../published-agent-thread/visibility';

interface ContextAssemblerInput {
  reviewWorkspaceId: string;
  revisionId: string;
  record: WorkspaceGraphRecord;
  sourceSnapshot: ReviewSourceSnapshot | null;
  agentReviewStore: Poc3AgentReviewStore;
  publishedAgentThreadLinks?: PublishedAgentThreadLink[];
}

export interface ResolveJudgementTargetCollection {
  targets: ResolveJudgementTarget[];
}

export class ResolveJudgementContextAssembler {
  collect(input: ContextAssemblerInput): ResolveJudgementTargetCollection {
    const targets: ResolveJudgementTarget[] = [];
    const seen = new Set<string>();

    const agentThreads = input.agentReviewStore.listThreadsForWorkspace({
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.revisionId,
    });
    const visibility = buildPublishedThreadVisibility({
      reviewWorkspaceId: input.reviewWorkspaceId,
      agentThreads,
      remoteThreads: input.sourceSnapshot?.remoteThreads ?? [],
      links: input.publishedAgentThreadLinks ?? [],
    });

    for (const target of this.collectAgentTargets(
      input,
      agentThreads,
      visibility.publishedRemoteByLocalThreadId,
    )) {
      const dedupKey = `${target.key.commentType}:${target.key.commentId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      targets.push(target);
    }

    for (const target of this.collectRemoteTargets(input, visibility.suppressedProviderThreadIds)) {
      const dedupKey = `${target.key.commentType}:${target.key.commentId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      targets.push(target);
    }

    return { targets };
  }

  private collectAgentTargets(
    input: ContextAssemblerInput,
    threads: Poc3AgentReviewThread[],
    publishedRemoteByLocalThreadId: Map<string, PublishedRemoteThreadSummary[]>,
  ): ResolveJudgementTarget[] {
    const targets: ResolveJudgementTarget[] = [];
    for (const thread of threads) {
      if (thread.status !== 'open') continue;
      targets.push(
        this.toAgentTarget(
          thread,
          input,
          publishedRemoteByLocalThreadId.get(thread.localThreadId) ?? [],
        ),
      );
    }
    return targets;
  }

  private toAgentTarget(
    thread: Poc3AgentReviewThread,
    input: ContextAssemblerInput,
    publishedRemoteThreads: PublishedRemoteThreadSummary[],
  ): ResolveJudgementTarget {
    const conversation = input.agentReviewStore.buildConversation(thread.localThreadId);
    const replies: ResolveJudgementReply[] = [];
    if (conversation) {
      for (const message of conversation.messages) {
        if (message.source === 'initial-finding') continue;
        replies.push({
          role: message.role === 'assistant' ? 'agent' : 'user',
          body: message.body,
          createdAt: message.createdAt,
        });
      }
    }
    const location: ResolveJudgementLocation = this.toAgentLocation(thread);
    const codeContext = this.buildAgentCodeContext(thread, input.sourceSnapshot);
    return {
      key: {
        reviewWorkspaceId: input.reviewWorkspaceId,
        revisionId: input.revisionId,
        commentType: 'agent-thread',
        commentId: thread.localThreadId,
      },
      nodeId: thread.nodeId,
      title: thread.title,
      primaryBody: thread.draftBody,
      replies,
      location,
      currentCodeContext: codeContext,
      sourceState: {
        isOutdated: null,
        isResolved: null,
        status: thread.status === 'open' ? 'open' : 'resolved',
      },
      linkedRemoteThreads: publishedRemoteThreads.flatMap((item) => {
        const remoteThread = item.remoteThread;
        if (!remoteThread) {
          return [];
        }
        return [
          {
            providerThreadId: remoteThread.providerThreadId,
            isResolved: remoteThread.isResolved,
            isOutdated: remoteThread.isOutdated,
            comments: remoteThread.comments.map((comment) => ({
              role: 'reviewer' as const,
              body: comment.body,
              createdAt: comment.createdAt,
            })),
          },
        ];
      }),
    };
  }

  private toAgentLocation(thread: Poc3AgentReviewThread): ResolveJudgementLocation {
    const loc = thread.location;
    if (loc.kind === 'overview') return { kind: 'overview' };
    if (loc.kind === 'diff') {
      return {
        kind: 'diff',
        filePath: loc.filePath,
        startLine: loc.startLine,
        endLine: loc.endLine,
        side: loc.side,
      };
    }
    return {
      kind: 'node',
      nodeId: loc.nodeId,
      filePath: loc.filePath,
      startLine: loc.startLine,
      endLine: loc.endLine,
    };
  }

  private buildAgentCodeContext(
    thread: Poc3AgentReviewThread,
    sourceSnapshot: ReviewSourceSnapshot | null,
  ): ResolveJudgementCodeContext {
    const filePath = thread.location.kind === 'overview' ? null : thread.location.filePath;
    const diffPatch = filePath ? findDiffPatch(sourceSnapshot, filePath) : null;
    return {
      diffPatch,
      currentExcerpt: null,
      relatedFiles: [],
    };
  }

  private collectRemoteTargets(
    input: ContextAssemblerInput,
    suppressedProviderThreadIds: Set<string>,
  ): ResolveJudgementTarget[] {
    const remoteThreads = input.sourceSnapshot?.remoteThreads ?? [];
    const targets: ResolveJudgementTarget[] = [];
    for (const thread of remoteThreads) {
      if (suppressedProviderThreadIds.has(thread.providerThreadId)) continue;
      if (thread.isResolved === true) continue;
      if (thread.location.kind !== 'diff') continue;
      targets.push(this.toRemoteTarget(thread, input));
    }
    return targets;
  }

  private toRemoteTarget(
    thread: ReviewRemoteThread,
    input: ContextAssemblerInput,
  ): ResolveJudgementTarget {
    const [primary, ...rest] = thread.comments;
    const replies: ResolveJudgementReply[] = rest.map((comment) => ({
      role: 'reviewer',
      body: comment.body,
      createdAt: comment.createdAt,
    }));
    const location: ResolveJudgementLocation =
      thread.location.kind === 'diff'
        ? {
            kind: 'diff',
            filePath: thread.location.filePath,
            startLine: thread.location.startLine,
            endLine: thread.location.endLine,
            side: thread.location.side,
          }
        : { kind: 'overview' };
    const filePath = thread.location.kind === 'diff' ? thread.location.filePath : null;
    const diffPatch = filePath ? findDiffPatch(input.sourceSnapshot, filePath) : null;
    return {
      key: {
        reviewWorkspaceId: input.reviewWorkspaceId,
        revisionId: input.revisionId,
        commentType: 'remote-thread',
        commentId: thread.providerThreadId,
      },
      nodeId: null,
      title: primary?.body.slice(0, 80) ?? '(empty)',
      primaryBody: primary?.body ?? '',
      replies,
      location,
      currentCodeContext: {
        diffPatch,
        currentExcerpt: null,
        relatedFiles: [],
      },
      sourceState: {
        isOutdated: thread.isOutdated,
        isResolved: thread.isResolved,
        status: thread.isResolved === true ? 'resolved' : 'open',
      },
    };
  }
}

function findDiffPatch(
  sourceSnapshot: ReviewSourceSnapshot | null,
  filePath: string,
): string | null {
  if (!sourceSnapshot) return null;
  const file = sourceSnapshot.changedFiles.find(
    (f) => f.path === filePath || f.oldPath === filePath,
  );
  return file?.patch ?? null;
}
