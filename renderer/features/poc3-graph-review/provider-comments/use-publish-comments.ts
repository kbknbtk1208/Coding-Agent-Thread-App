import { useCallback, useState } from 'react';
import type {
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../../../../shared/poc3-domain/comment-publish';
import type { ReviewRemoteThread } from '../../../../shared/poc3-domain/source-snapshot';
import type { NodeDetailSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';

interface PublishCommentState {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
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

export interface PublishFindingArgs {
  finding: NodeDetailSnapshot['findings'][number];
  detail: NodeDetailSnapshot;
  body: string;
}

export interface UsePublishCommentsReturn {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  commentUrlBySourceKey: Record<string, string>;
  publishInlineComment: (args: PublishInlineCommentArgs) => Promise<void>;
  replyRemoteComment: (args: ReplyRemoteCommentArgs) => Promise<void>;
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
            errorByKey: { ...prev.errorByKey, [args.sourceKey]: result.message },
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

  return {
    inFlightKey: state.inFlightKey,
    errorByKey: state.errorByKey,
    publishedBySourceKey: state.publishedBySourceKey,
    commentUrlBySourceKey: state.commentUrlBySourceKey,
    publishInlineComment,
    replyRemoteComment,
    publishFinding,
    clearError,
  };
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
  detail: NodeDetailSnapshot,
): Poc3InlineCommentAnchor | null {
  if (finding.line === null) return null;
  const filePath = detail.summary.filePath ?? detail.node.filePath;
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
