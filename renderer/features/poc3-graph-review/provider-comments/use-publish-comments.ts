import { useCallback, useMemo, useState } from 'react';
import type {
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../../../../shared/poc3-domain/comment-publish';
import type { ReviewRemoteThread } from '../../../../shared/poc3-domain/source-snapshot';
import type {
  NodeCompanionDetailSnapshot,
  NodeDetailSnapshot,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

type PublishablePaneSnapshot = NodeDetailSnapshot | NodeCompanionDetailSnapshot;

interface PublishCommentState {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  draftReplyByThread: Record<string, string>;
}

export interface UsePublishCommentsOptions {
  onPublished?: (remoteThread: ReviewRemoteThread) => void;
}

export interface PublishInlineCommentArgs {
  reviewWorkspaceId: string;
  revisionId: string;
  body: string;
  anchor: Poc3InlineCommentAnchor;
  source: Poc3PublishCommentSource;
  sourceKey: string;
}

export interface ReplyRemoteCommentArgs {
  reviewWorkspaceId: string;
  revisionId: string;
  providerThreadId: string;
  body: string;
  sourceKey: string;
}

export interface ReplyRemoteThreadArgs {
  detail: PublishablePaneSnapshot;
  providerThreadId: string;
  body: string;
}

export interface PublishFindingArgs {
  finding: NodeDetailSnapshot['findings'][number];
  detail: PublishablePaneSnapshot;
  body: string;
}

export interface UsePublishCommentsReturn {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  draftReplyByThread: Record<string, string>;
  publishInlineComment: (args: PublishInlineCommentArgs) => Promise<void>;
  replyRemoteComment: (args: ReplyRemoteCommentArgs) => Promise<void>;
  replyRemoteThread: (args: ReplyRemoteThreadArgs) => Promise<void>;
  setDraftReplyByThread: (threadId: string, body: string) => void;
  publishFinding: (args: PublishFindingArgs) => Promise<void>;
  clearError: (sourceKey: string) => void;
}

export function usePublishComments(
  options: UsePublishCommentsOptions = {},
): UsePublishCommentsReturn {
  const { onPublished } = options;

  const [state, setState] = useState<PublishCommentState>({
    inFlightKey: null,
    errorByKey: {},
    publishedBySourceKey: {},
    commentUrlBySourceKey: {},
    draftReplyByThread: {},
  });

  const publishInlineComment = useCallback(
    async (args: PublishInlineCommentArgs): Promise<void> => {
      setState((prev) => ({
        ...prev,
        inFlightKey: args.sourceKey,
        errorByKey: { ...prev.errorByKey, [args.sourceKey]: '' },
      }));

      try {
        const result = await window.poc3GraphReviewApi.publishInlineComment({
          reviewWorkspaceId: args.reviewWorkspaceId,
          revisionId: args.revisionId,
          body: args.body,
          anchor: args.anchor,
          source: args.source,
        });

        if (result.ok) {
          const commentUrl = result.remoteThread.comments[0]?.url ?? null;
          setState((prev) => ({
            ...prev,
            inFlightKey: null,
            publishedBySourceKey: {
              ...prev.publishedBySourceKey,
              [args.sourceKey]: result.published,
            },
            commentUrlBySourceKey: commentUrl
              ? { ...prev.commentUrlBySourceKey, [args.sourceKey]: commentUrl }
              : prev.commentUrlBySourceKey,
          }));
          onPublished?.(result.remoteThread);
        } else {
          setState((prev) => ({
            ...prev,
            inFlightKey: null,
            errorByKey: {
              ...prev.errorByKey,
              [args.sourceKey]: resolvePublishErrorMessage(result.reason, result.message),
            },
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'コメントの投稿に失敗しました。';
        setState((prev) => ({
          ...prev,
          inFlightKey: null,
          errorByKey: { ...prev.errorByKey, [args.sourceKey]: message },
        }));
      }
    },
    [onPublished],
  );

  const replyRemoteComment = useCallback(
    async (args: ReplyRemoteCommentArgs): Promise<void> => {
      setState((prev) => ({
        ...prev,
        inFlightKey: args.sourceKey,
        errorByKey: { ...prev.errorByKey, [args.sourceKey]: '' },
      }));

      try {
        const result = await window.poc3GraphReviewApi.replyRemoteComment({
          reviewWorkspaceId: args.reviewWorkspaceId,
          revisionId: args.revisionId,
          providerThreadId: args.providerThreadId,
          body: args.body,
        });

        if (result.ok) {
          setState((prev) => ({
            ...prev,
            inFlightKey: null,
            publishedBySourceKey: {
              ...prev.publishedBySourceKey,
              [args.sourceKey]: result.published,
            },
          }));
          onPublished?.(result.remoteThread);
        } else {
          setState((prev) => ({
            ...prev,
            inFlightKey: null,
            errorByKey: {
              ...prev.errorByKey,
              [args.sourceKey]: resolveReplyErrorMessage(result.reason, result.message),
            },
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '返信の投稿に失敗しました。';
        setState((prev) => ({
          ...prev,
          inFlightKey: null,
          errorByKey: { ...prev.errorByKey, [args.sourceKey]: message },
        }));
      }
    },
    [onPublished],
  );

  const setDraftReplyByThread = useCallback((threadId: string, body: string) => {
    setState((prev) => ({
      ...prev,
      draftReplyByThread: { ...prev.draftReplyByThread, [threadId]: body },
    }));
  }, []);

  const replyRemoteThread = useCallback(
    async (args: ReplyRemoteThreadArgs): Promise<void> => {
      const sourceKey = `remote-thread:${args.providerThreadId}`;
      await replyRemoteComment({
        reviewWorkspaceId: args.detail.reviewWorkspaceId,
        revisionId: args.detail.revisionId,
        providerThreadId: args.providerThreadId,
        body: args.body,
        sourceKey,
      });
    },
    [replyRemoteComment],
  );

  const clearError = useCallback((sourceKey: string) => {
    setState((prev) => ({
      ...prev,
      errorByKey: { ...prev.errorByKey, [sourceKey]: '' },
    }));
  }, []);

  const publishFinding = useCallback(
    async (args: PublishFindingArgs): Promise<void> => {
      const anchor = findingToInlineAnchor(args.finding, args.detail);
      if (!anchor) return;
      const sourceKey = `agent-finding:${args.finding.localThreadId}`;
      await publishInlineComment({
        reviewWorkspaceId: args.detail.reviewWorkspaceId,
        revisionId: args.detail.revisionId,
        body: args.body,
        anchor,
        source: {
          kind: 'agent-finding',
          localThreadId: args.finding.localThreadId,
          findingId: args.finding.findingId,
        },
        sourceKey,
      });
    },
    [publishInlineComment],
  );

  return useMemo(
    () => ({
      inFlightKey: state.inFlightKey,
      errorByKey: state.errorByKey,
      publishedBySourceKey: state.publishedBySourceKey,
      commentUrlBySourceKey: state.commentUrlBySourceKey,
      draftReplyByThread: state.draftReplyByThread,
      publishInlineComment,
      replyRemoteComment,
      replyRemoteThread,
      setDraftReplyByThread,
      publishFinding,
      clearError,
    }),
    [
      state.inFlightKey,
      state.errorByKey,
      state.publishedBySourceKey,
      state.commentUrlBySourceKey,
      state.draftReplyByThread,
      publishInlineComment,
      replyRemoteComment,
      replyRemoteThread,
      setDraftReplyByThread,
      publishFinding,
      clearError,
    ],
  );
}

function resolveReplyErrorMessage(reason: string, fallbackMessage: string): string {
  switch (reason) {
    case 'threadNotFound':
      return 'コメントスレッドが見つかりません。refresh してください';
    case 'threadNotReplyable':
      return 'このコメントには返信できません';
    case 'invalidBody':
      return '返信内容を入力してください';
    case 'inactiveRevision':
      return '最新 revision に切り替えてから返信してください';
    case 'tokenNotFound':
      return 'Repository Provider の token を設定してください';
    case 'providerRejected':
      return `Provider への返信投稿に失敗しました。${fallbackMessage}`;
    default:
      return fallbackMessage;
  }
}

function resolvePublishErrorMessage(reason: string, fallbackMessage: string): string {
  switch (reason) {
    case 'invalidBody':
      return '本文を入力してください';
    case 'invalidAnchor':
      return 'この Finding は現在の diff 上に投稿できません';
    case 'inactiveRevision':
      return '最新 revision に切り替えてから投稿してください';
    case 'tokenNotFound':
      return 'Repository Provider の token を設定してください';
    case 'providerRejected':
      return `Provider への投稿に失敗しました。${fallbackMessage}`;
    default:
      return fallbackMessage;
  }
}

function findingToInlineAnchor(
  finding: NodeDetailSnapshot['findings'][number],
  detail: PublishablePaneSnapshot,
): Poc3InlineCommentAnchor | null {
  if (finding.line === null) return null;
  const filePath = detail.summary.filePath ?? ('node' in detail ? detail.node.filePath : null);
  if (!filePath) return null;
  const side = finding.side === 'old' ? 'LEFT' : 'RIGHT';
  return {
    kind: 'diff',
    filePath,
    oldPath: null,
    side,
    startLine: finding.endLine && finding.endLine !== finding.line ? finding.line : null,
    endLine: finding.endLine ?? finding.line,
  };
}
