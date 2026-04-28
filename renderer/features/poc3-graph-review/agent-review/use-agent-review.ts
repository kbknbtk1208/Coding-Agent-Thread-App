'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentKind, AppSession, CodexModelOption } from '../../../../shared/domain/agent';
import {
  DEFAULT_AGENT_REVIEW_INSTRUCTIONS,
  buildAgentReviewStartRequest,
  isAgentReviewRunActive,
  toAgentReviewRunStatus,
} from './agent-review-state';
import type {
  AgentReviewCodexModelState,
  AgentReviewRun,
  AgentReviewStartInput,
} from './agent-review-types';

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
  setSelectedAgent(agent: AgentKind): void;
  setInstructions(value: string): void;
  setCodexModel(value: string): void;
  setCodexReasoningEffort(value: string): void;
  startReview(input: Omit<AgentReviewStartInput, 'agent' | 'instructions'>): Promise<void>;
  toggleRun(runId: string): void;
  respondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
}

export function useAgentReview(reviewWorkspaceId: string): UseAgentReviewResult {
  const [selectedAgent, setSelectedAgent] = useState<AgentKind>('codex');
  const [instructions, setInstructions] = useState(DEFAULT_AGENT_REVIEW_INSTRUCTIONS);
  const [runs, setRuns] = useState<AgentReviewRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [submittingPermissionKey, setSubmittingPermissionKey] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);
  const [codexModelError, setCodexModelError] = useState<string | null>(null);
  const [isLoadingCodexModels, setIsLoadingCodexModels] = useState(false);
  const [selectedCodexModel, setSelectedCodexModel] = useState('');
  const [selectedCodexReasoningEffort, setSelectedCodexReasoningEffort] = useState('');

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
          result.runs.slice(0, 8).map((run) => ({
            runId: run.runId,
            agent: run.reviewAgent,
            instructions: run.instructions,
            status: run.status,
            appSessionId: run.rootAppSessionId,
            session: null,
            errorMessage: null,
            codexModel: run.codexModel ?? null,
            codexReasoningEffort: run.codexReasoningEffort ?? null,
            createdAt: run.createdAt,
            updatedAt: run.completedAt ?? run.createdAt,
            completedAt: run.completedAt,
            serverRun: run,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [reviewWorkspaceId]);

  useEffect(() => {
    let disposed = false;
    setIsLoadingCodexModels(true);
    setCodexModelError(null);
    void window.agentApi
      .listCodexModels()
      .then((result) => {
        if (disposed) return;
        setCodexModels(result.models);
        const defaultModel = pickDefaultModel(result.models);
        setSelectedCodexModel((current) =>
          current && result.models.some((model) => model.model === current)
            ? current
            : defaultModel,
        );
      })
      .catch((error) => {
        if (disposed) return;
        setCodexModels([]);
        setSelectedCodexModel('');
        setSelectedCodexReasoningEffort('');
        setCodexModelError(
          error instanceof Error ? error.message : 'Codex model list の取得に失敗しました。',
        );
      })
      .finally(() => {
        if (!disposed) {
          setIsLoadingCodexModels(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const selected = codexModels.find((model) => model.model === selectedCodexModel);
    if (!selected) {
      setSelectedCodexReasoningEffort('');
      return;
    }
    setSelectedCodexReasoningEffort((current) =>
      current &&
      selected.supportedReasoningEfforts.some((option) => option.reasoningEffort === current)
        ? current
        : pickDefaultReasoningEffort(selected),
    );
  }, [codexModels, selectedCodexModel]);

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
        setRuns((current) =>
          current.map((run) =>
            run.runId === event.envelope.run.runId
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
    async ({ target }: Omit<AgentReviewStartInput, 'agent' | 'instructions'>) => {
      if (isStarting) return;
      setIsStarting(true);
      const trimmedInstructions = instructions.trim();

      try {
        const result = await window.poc3GraphReviewApi.startAgentReview(
          buildAgentReviewStartRequest({
            target,
            selectedAgent,
            instructions: trimmedInstructions,
            codexModel: selectedCodexModel,
            codexReasoningEffort: selectedCodexReasoningEffort,
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
      } catch (error) {
        const failedAt = new Date().toISOString();
        const runId = `agent-review-start-failed-${Date.now()}`;
        setRuns((current) =>
          [
            {
              runId,
              agent: selectedAgent,
              instructions: trimmedInstructions,
              status: 'failed' as const,
              appSessionId: null,
              session: null,
              errorMessage: toErrorMessage(error),
              codexModel: selectedAgent === 'codex' ? selectedCodexModel || null : null,
              codexReasoningEffort:
                selectedAgent === 'codex' ? selectedCodexReasoningEffort || null : null,
              createdAt: failedAt,
              updatedAt: failedAt,
              completedAt: failedAt,
            },
            ...current,
          ].slice(0, 8),
        );
        setExpandedRunId(runId);
      } finally {
        setIsStarting(false);
      }
    },
    [instructions, isStarting, selectedAgent, selectedCodexModel, selectedCodexReasoningEffort],
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

  const activeRun = runs.find((run) => isAgentReviewRunActive(run.status)) ?? null;
  const latestRun = runs[0] ?? null;
  const codexModelState = useMemo<AgentReviewCodexModelState>(
    () => ({
      models: codexModels,
      selectedModel: selectedCodexModel,
      selectedReasoningEffort: selectedCodexReasoningEffort,
      isLoading: isLoadingCodexModels,
      errorMessage: codexModelError,
    }),
    [
      codexModelError,
      codexModels,
      isLoadingCodexModels,
      selectedCodexModel,
      selectedCodexReasoningEffort,
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
      setSelectedAgent,
      setInstructions,
      setCodexModel: setSelectedCodexModel,
      setCodexReasoningEffort: setSelectedCodexReasoningEffort,
      startReview,
      toggleRun,
      respondPermission,
    }),
    [
      activeRun,
      codexModelState,
      expandedRunId,
      instructions,
      isStarting,
      latestRun,
      respondPermission,
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
    createdAt: run.createdAt,
    updatedAt: session?.updatedAt ?? run.completedAt ?? run.createdAt,
    completedAt: run.completedAt,
    serverRun: run,
  };
}

function pickDefaultModel(models: CodexModelOption[]): string {
  return models.find((model) => model.isDefault)?.model ?? models[0]?.model ?? '';
}

function pickDefaultReasoningEffort(model: CodexModelOption): string {
  return model.defaultReasoningEffort ?? model.supportedReasoningEfforts[0]?.reasoningEffort ?? '';
}
