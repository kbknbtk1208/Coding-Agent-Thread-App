import * as React from 'react';

export type DraftReplyBodies = Record<string, string>;

export interface UseDraftComposerStateReturn {
  replyBodies: DraftReplyBodies;
  getReplyBody: (threadId: string) => string;
  setReplyBody: (threadId: string, body: string) => void;
  clearReplyBody: (threadId: string) => void;
  clearAll: () => void;
}

export function useDraftComposerState(): UseDraftComposerStateReturn {
  const [replyBodies, setReplyBodies] = React.useState<DraftReplyBodies>({});

  const getReplyBody = React.useCallback(
    (threadId: string) => {
      return replyBodies[threadId] ?? '';
    },
    [replyBodies],
  );

  const setReplyBody = React.useCallback((threadId: string, body: string) => {
    setReplyBodies((current) => {
      if (current[threadId] === body) {
        return current;
      }

      return {
        ...current,
        [threadId]: body,
      };
    });
  }, []);

  const clearReplyBody = React.useCallback((threadId: string) => {
    setReplyBodies((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, threadId)) {
        return current;
      }

      const nextReplyBodies = { ...current };
      delete nextReplyBodies[threadId];
      return nextReplyBodies;
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setReplyBodies((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }

      return {};
    });
  }, []);

  return React.useMemo(
    () => ({
      replyBodies,
      getReplyBody,
      setReplyBody,
      clearReplyBody,
      clearAll,
    }),
    [clearAll, clearReplyBody, getReplyBody, replyBodies, setReplyBody],
  );
}
