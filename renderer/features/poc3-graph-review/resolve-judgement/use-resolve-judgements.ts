'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentKind } from '../../../../shared/domain/agent';
import type {
  ResolveJudgementCommentKey,
  ResolveJudgementResult,
} from '../../../../shared/poc3-domain/resolve-judgement';
import { toResolveJudgementMapKey } from '../../../../shared/poc3-domain/resolve-judgement';

export type ResolveJudgementDecision = 'resolvable' | 'unresolvable';

export interface ResolveJudgementViewModel {
  decision: ResolveJudgementDecision;
  reasonMarkdown: string;
  evidence: string[];
  judgedAt: string;
}

export type ResolveJudgementRunState =
  | { status: 'idle'; targetCount: number }
  | { status: 'running'; runId: string; targetCount: number }
  | { status: 'failed'; message: string; targetCount: number };

export interface UseResolveJudgementsInput {
  reviewWorkspaceId: string | null;
  revisionId: string | null;
  scopeKey: string;
  agent: AgentKind;
}

export interface UseResolveJudgementsResult {
  resultsByKey: ReadonlyMap<string, ResolveJudgementViewModel>;
  runState: ResolveJudgementRunState;
  start: () => Promise<void>;
  reload: () => Promise<void>;
}

function toViewModel(result: ResolveJudgementResult): ResolveJudgementViewModel {
  return {
    decision: result.decision,
    reasonMarkdown: result.reasonMarkdown,
    evidence: result.evidence,
    judgedAt: result.checkedAt,
  };
}

export function useResolveJudgements(input: UseResolveJudgementsInput): UseResolveJudgementsResult {
  const { reviewWorkspaceId, revisionId, scopeKey, agent } = input;
  const [resultsByKey, setResultsByKey] = useState<ReadonlyMap<string, ResolveJudgementViewModel>>(
    new Map(),
  );
  const [runState, setRunState] = useState<ResolveJudgementRunState>({
    status: 'idle',
    targetCount: 0,
  });
  const activeRequestRef = useRef<string>('');

  const reload = useCallback(async () => {
    if (!reviewWorkspaceId || !revisionId) {
      setResultsByKey(new Map());
      setRunState({ status: 'idle', targetCount: 0 });
      return;
    }
    const requestId = `${reviewWorkspaceId}:${revisionId}`;
    activeRequestRef.current = requestId;
    const response = await window.poc3GraphReviewApi.listResolveJudgementResults({
      reviewWorkspaceId,
      revisionId,
    });
    if (activeRequestRef.current !== requestId) return;
    const map = new Map<string, ResolveJudgementViewModel>();
    for (const result of response.results) {
      map.set(toResolveJudgementMapKey(result.key), toViewModel(result));
    }
    setResultsByKey(map);
    if (response.runningRun) {
      setRunState({
        status: 'running',
        runId: response.runningRun.runId,
        targetCount: response.runningRun.targetCount,
      });
    } else {
      setRunState({ status: 'idle', targetCount: 0 });
    }
  }, [reviewWorkspaceId, revisionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const off = window.poc3GraphReviewApi.onResolveJudgementEvent((event) => {
      const eventRevisionId = event.run.revisionId;
      if (eventRevisionId !== revisionId) return;
      if (event.run.reviewWorkspaceId !== reviewWorkspaceId) return;
      if (event.type === 'resolve-judgement.started') {
        setRunState({
          status: 'running',
          runId: event.run.runId,
          targetCount: event.run.targetCount,
        });
        return;
      }
      if (event.type === 'resolve-judgement.completed') {
        setResultsByKey((current) => {
          const next = new Map(current);
          for (const result of event.results) {
            next.set(toResolveJudgementMapKey(result.key), toViewModel(result));
          }
          return next;
        });
        setRunState({ status: 'idle', targetCount: 0 });
        return;
      }
      if (event.type === 'resolve-judgement.failed') {
        setRunState({
          status: 'failed',
          message: event.message,
          targetCount: event.run.targetCount,
        });
      }
    });
    return off;
  }, [reviewWorkspaceId, revisionId]);

  const start = useCallback(async () => {
    if (!reviewWorkspaceId) return;
    setRunState((current) =>
      current.status === 'running' ? current : { status: 'running', runId: '', targetCount: 0 },
    );
    const response = await window.poc3GraphReviewApi.startResolveJudgement({
      reviewWorkspaceId,
      scopeKey,
      agent,
    });
    if (!response.ok) {
      setRunState({ status: 'failed', message: response.message, targetCount: 0 });
      return;
    }
    if (response.run.status === 'completed') {
      setRunState({ status: 'idle', targetCount: response.run.targetCount });
      void reload();
      return;
    }
    setRunState({
      status: 'running',
      runId: response.run.runId,
      targetCount: response.run.targetCount,
    });
  }, [reviewWorkspaceId, scopeKey, agent, reload]);

  return useMemo(
    () => ({
      resultsByKey,
      runState,
      start,
      reload,
    }),
    [resultsByKey, runState, start, reload],
  );
}

export function buildResolveJudgementMapKey(key: ResolveJudgementCommentKey): string {
  return toResolveJudgementMapKey(key);
}
