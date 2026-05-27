'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentKind, AppSession } from '../../../../shared/domain/agent';
import {
  DEFAULT_AGENT_REVIEW_INSTRUCTIONS,
  buildAgentReviewStartRequest,
  isAgentReviewRunActive,
  toAgentReviewRunStatus,
} from './agent-review-state';
import type {
  AgentReviewCodexModelState,
  AgentReviewRun,
  AgentReviewRunDetail,
  AgentReviewStartInput,
} from './agent-review-types';
import { useCodexModelSelection } from './use-codex-model-selection';

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Agent Review の開始に失敗しました。';
}

function applySessionToRun(run: AgentReviewRun, session: AppSession): AgentReviewRun {
  return {
    ...run,
    appSessionId: session.appSessionId,
    session,
    status: toAgentReviewRunStatus(session.status),
    errorMessage: session.lastError?.message ?? run.errorMessage,
    updatedAt: session.updatedAt,
    completedAt:
      session.status === 'completed' || session.status === 'failed'
        ? (run.completedAt ?? new Date().toISOString())
        : null,
  };
}

export interface UseAgentReviewResult {
  selectedAgent: AgentKind;
  instructions: string;
  runs: AgentReviewRun[];
  activeRun: AgentReviewRun | null;
  latestRun: AgentReviewRun | null;
  expandedRunId: string | null;
  submittingPermissionKey: string | null;
  codexModelState: AgentReviewCodexModelState;
  canStart: boolean;
  runDetailsById: Record<string, AgentReviewRunDetail>;
  detailLoadingRunId: string | null;
  detailErrorByRunId: Record<string, string>;
  setSelectedAgent(agent: AgentKind): void;
  setInstructions(value: string): void;
  setCodexModel(value: string): void;
  setCodexReasoningEffort(value: string): void;
  startReview(
    input: Omit<AgentReviewStartInput, 'agent' | 'instructions'>,
  ): Promise<AgentReviewRun | null>;
  toggleRun(runId: string): void;
  respondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
  loadRunDetail(runId: string): Promise<void>;
}

export function useAgentReview(reviewWorkspaceId: string): UseAgentReviewResult {
  const [selectedAgent, setSelectedAgent] = useState<AgentKind>('codex');
  const [instructions, setInstructions] = useState(DEFAULT_AGENT_REVIEW_INSTRUCTIONS);
  const [runs, setRuns] = useState<AgentReviewRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [submittingPermissionKey, setSubmittingPermissionKey] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const codexModelSelection = useCodexModelSelection();
  const [runDetailsById, setRunDetailsById] = useState<Record<string, AgentReviewRunDetail>>({});
  const [detailLoadingRunId, setDetailLoadingRunId] = useState<string | null>(null);
  const [detailErrorByRunId, setDetailErrorByRunId] = useState<Record<string, string>>({});
  const detailLoadingRunIdRef = useRef<string | null>(null);

  const syncSession = useCallback((session: AppSession) => {
    setRuns((current) =>
      current.map((run) =>
        run.appSessionId === session.appSessionId ? applySessionToRun(run, session) : run,
      ),
    );
  }, []);

  useEffect(() => {
    let disposed = false;
    void window.poc3GraphReviewApi
      .listAgentReviewRuns({ reviewWorkspaceId })
      .then((result) => {
        if (disposed) return;
        setRuns(
          result.runs.slice(0, 8).map((item) => ({
            runId: item.run.runId,
            agent: item.run.reviewAgent,
            instructions: item.run.instructions,
            status: item.run.status,
            appSessionId: item.run.rootAppSessionId,
            session: null,
            errorMessage: null,
            codexModel: item.run.codexModel ?? null,
            codexReasoningEffort: item.run.codexReasoningEffort ?? null,
            commit: item.commit,
            createdAt: item.run.createdAt,
            updatedAt: item.run.completedAt ?? item.run.createdAt,
            completedAt: item.run.completedAt,
            serverRun: item.run,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [reviewWorkspaceId]);

  useEffect(() => {
    setRunDetailsById({});
    setDetailErrorByRunId({});
    setDetailLoadingRunId(null);
  }, [reviewWorkspaceId]);

  useEffect(() => {
    const unsubscribe = window.poc3GraphReviewApi.onAgentReviewEvent((event) => {
      if (event.type === 'agent-review.started') {
        if (event.run.reviewWorkspaceId !== reviewWorkspaceId) return;
        const nextRun = toUiRun(event.run, event.session);
        setRuns((current) =>
          [nextRun, ...current.filter((run) => run.runId !== nextRun.runId)].slice(0, 8),
        );
        setExpandedRunId(nextRun.runId);
        return;
      }
      if (event.type === 'agent-review.session') {
        if (event.run.reviewWorkspaceId !== reviewWorkspaceId) return;
        const nextRun = toUiRun(event.run, event.session);
        setRuns((current) =>
          [nextRun, ...current.filter((run) => run.runId !== nextRun.runId)].slice(0, 8),
        );
        return;
      }
      if (event.type === 'agent-review.completed') {
        if (event.envelope.run.reviewWorkspaceId !== reviewWorkspaceId) return;
        const completedRunId = event.envelope.run.runId;
        setRuns((current) =>
          current.map((run) =>
            run.runId === completedRunId
              ? {
                  ...run,
                  status: event.envelope.run.status,
                  completedAt: event.envelope.run.completedAt,
                  updatedAt: event.envelope.run.completedAt ?? run.updatedAt,
                  serverRun: event.envelope.run,
                }
              : run,
          ),
        );
        setRunDetailsById((current) => {
          const next = { ...current };
          delete next[completedRunId];
          return next;
        });
        return;
      }
      if (event.type === 'agent-review.failed') {
        if (event.run.reviewWorkspaceId !== reviewWorkspaceId) return;
        setRuns((current) =>
          current.map((run) =>
            run.runId === event.run.runId
              ? {
                  ...run,
                  status: 'failed',
                  errorMessage: event.message,
                  completedAt: event.run.completedAt,
                  updatedAt: event.run.completedAt ?? run.updatedAt,
                  serverRun: event.run,
                }
              : run,
          ),
        );
      }
    });
    return unsubscribe;
  }, [reviewWorkspaceId]);

  const startReview = useCallback(
    async ({
      target,
    }: Omit<AgentReviewStartInput, 'agent' | 'instructions'>): Promise<AgentReviewRun | null> => {
      if (isStarting) return null;
      setIsStarting(true);
      const trimmedInstructions = instructions.trim();

      try {
        const result = await window.poc3GraphReviewApi.startAgentReview(
          buildAgentReviewStartRequest({
            target,
            selectedAgent,
            instructions: trimmedInstructions,
            codexModel: codexModelSelection.selectedModel,
            codexReasoningEffort: codexModelSelection.selectedReasoningEffort,
          }),
        );
        if (!result.ok) {
          throw new Error(result.message);
        }
        const nextRun = toUiRun(result.run, result.session);
        setRuns((current) =>
          [nextRun, ...current.filter((run) => run.runId !== nextRun.runId)].slice(0, 8),
        );
        setExpandedRunId(nextRun.runId);
        return nextRun;
      } catch (error) {
        const failedAt = new Date().toISOString();
        const runId = `agent-review-start-failed-${Date.now()}`;
        const failedRun: AgentReviewRun = {
          runId,
          agent: selectedAgent,
          instructions: trimmedInstructions,
          status: 'failed' as const,
          appSessionId: null,
          session: null,
          errorMessage: toErrorMessage(error),
          codexModel: selectedAgent === 'codex' ? codexModelSelection.selectedModel || null : null,
          codexReasoningEffort:
            selectedAgent === 'codex' ? codexModelSelection.selectedReasoningEffort || null : null,
          commit: null,
          createdAt: failedAt,
          updatedAt: failedAt,
          completedAt: failedAt,
        };
        setRuns((current) => [failedRun, ...current].slice(0, 8));
        setExpandedRunId(runId);
        return failedRun;
      } finally {
        setIsStarting(false);
      }
    },
    [
      codexModelSelection.selectedModel,
      codexModelSelection.selectedReasoningEffort,
      instructions,
      isStarting,
      selectedAgent,
    ],
  );

  const toggleRun = useCallback((runId: string) => {
    setExpandedRunId((current) => (current === runId ? null : runId));
  }, []);

  const respondPermission = useCallback(
    async (appSessionId: string, requestId: string, actionId: string) => {
      const key = `${appSessionId}:${requestId}:${actionId}`;
      setSubmittingPermissionKey(key);
      try {
        await window.poc3GraphReviewApi.respondAgentReviewPermission({
          appSessionId,
          requestId,
          actionId,
        });
        const sessions = await window.agentApi.listSessions();
        const session = sessions.find((item) => item.appSessionId === appSessionId);
        if (session) {
          syncSession(session);
        }
      } finally {
        setSubmittingPermissionKey(null);
      }
    },
    [syncSession],
  );

  const loadRunDetail = useCallback(
    async (runId: string) => {
      if (detailLoadingRunIdRef.current === runId) return;
      detailLoadingRunIdRef.current = runId;
      setDetailLoadingRunId(runId);
      setDetailErrorByRunId((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
      try {
        const result = await window.poc3GraphReviewApi.getAgentReviewRunDetail({
          reviewWorkspaceId,
          runId,
        });
        if (result.ok) {
          setRunDetailsById((current) => ({ ...current, [runId]: result.detail }));
        } else {
          setDetailErrorByRunId((current) => ({ ...current, [runId]: result.message }));
        }
      } catch (error) {
        setDetailErrorByRunId((current) => ({
          ...current,
          [runId]: error instanceof Error ? error.message : 'Detail の取得に失敗しました。',
        }));
      } finally {
        if (detailLoadingRunIdRef.current === runId) {
          detailLoadingRunIdRef.current = null;
        }
        setDetailLoadingRunId(null);
      }
    },
    [reviewWorkspaceId],
  );

  const activeRun = runs.find((run) => isAgentReviewRunActive(run.status)) ?? null;
  const latestRun = runs[0] ?? null;
  const codexModelState = useMemo<AgentReviewCodexModelState>(
    () => ({
      models: codexModelSelection.models,
      selectedModel: codexModelSelection.selectedModel,
      selectedReasoningEffort: codexModelSelection.selectedReasoningEffort,
      isLoading: codexModelSelection.isLoading,
      errorMessage: codexModelSelection.errorMessage,
    }),
    [
      codexModelSelection.errorMessage,
      codexModelSelection.isLoading,
      codexModelSelection.models,
      codexModelSelection.selectedModel,
      codexModelSelection.selectedReasoningEffort,
    ],
  );

  return useMemo(
    () => ({
      selectedAgent,
      instructions,
      runs,
      activeRun,
      latestRun,
      expandedRunId,
      submittingPermissionKey,
      codexModelState,
      canStart: activeRun === null && !isStarting,
      runDetailsById,
      detailLoadingRunId,
      detailErrorByRunId,
      setSelectedAgent,
      setInstructions,
      setCodexModel: codexModelSelection.setSelectedModel,
      setCodexReasoningEffort: codexModelSelection.setSelectedReasoningEffort,
      startReview,
      toggleRun,
      respondPermission,
      loadRunDetail,
    }),
    [
      activeRun,
      codexModelState,
      detailErrorByRunId,
      detailLoadingRunId,
      expandedRunId,
      instructions,
      isStarting,
      latestRun,
      loadRunDetail,
      respondPermission,
      runDetailsById,
      runs,
      selectedAgent,
      startReview,
      submittingPermissionKey,
      toggleRun,
    ],
  );
}

function toUiRun(
  run: import('../../../../shared/poc3-domain/agent-review').Poc3AgentReviewRun,
  session: AppSession | null,
): AgentReviewRun {
  return {
    runId: run.runId,
    agent: run.reviewAgent,
    instructions: run.instructions,
    status: session ? toAgentReviewRunStatus(session.status) : run.status,
    appSessionId: run.rootAppSessionId,
    session,
    errorMessage: session?.lastError?.message ?? null,
    codexModel: run.codexModel ?? session?.modelSelection?.requestedModel ?? null,
    codexReasoningEffort:
      run.codexReasoningEffort ?? session?.modelSelection?.requestedReasoningEffort ?? null,
    commit: null,
    createdAt: run.createdAt,
    updatedAt: session?.updatedAt ?? run.completedAt ?? run.createdAt,
    completedAt: run.completedAt,
    serverRun: run,
  };
}
