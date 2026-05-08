'use client';

import { createContext, useContext } from 'react';
import type {
  ResolveJudgementCommentKey,
  ResolveJudgementCommentType,
} from '../../../../shared/poc3-domain/resolve-judgement';
import { toResolveJudgementMapKey } from '../../../../shared/poc3-domain/resolve-judgement';
import type {
  UseResolveJudgementsResult,
  ResolveJudgementViewModel,
} from './use-resolve-judgements';

const noopContext: UseResolveJudgementsResult = {
  resultsByKey: new Map(),
  runState: { status: 'idle', targetCount: 0 },
  start: async () => undefined,
  reload: async () => undefined,
};

export const ResolveJudgementContext = createContext<UseResolveJudgementsResult>(noopContext);

export function useResolveJudgementContext(): UseResolveJudgementsResult {
  return useContext(ResolveJudgementContext);
}

export function buildResolveJudgementMapKey(key: ResolveJudgementCommentKey): string {
  return toResolveJudgementMapKey(key);
}

export function lookupResolveJudgement(
  ctx: UseResolveJudgementsResult,
  input: {
    reviewWorkspaceId: string;
    revisionId: string;
    commentType: ResolveJudgementCommentType;
    commentId: string;
  },
): ResolveJudgementViewModel | null {
  return ctx.resultsByKey.get(toResolveJudgementMapKey(input)) ?? null;
}
