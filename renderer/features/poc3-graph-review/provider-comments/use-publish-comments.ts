import { useCallback, useState } from 'react';
import type {
  Poc3InlineCommentAnchor,
  Poc3PublishCommentSource,
  Poc3PublishedCommentRecord,
} from '../../../../shared/poc3-domain/comment-publish';
import type { ReviewRemoteThread } from '../../../../shared/poc3-domain/source-snapshot';

interface PublishCommentState {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
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

export interface UsePublishCommentsReturn {
  inFlightKey: string | null;
  errorByKey: Record<string, string>;
  publishedBySourceKey: Record<string, Poc3PublishedCommentRecord>;
  publishInlineComment: (args: PublishInlineCommentArgs) => Promise<void>;
  replyRemoteComment: (args: ReplyRemoteCommentArgs) => Promise<void>;
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

  return {
    inFlightKey: state.inFlightKey,
    errorByKey: state.errorByKey,
    publishedBySourceKey: state.publishedBySourceKey,
    publishInlineComment,
    replyRemoteComment,
    clearError,
  };
}
