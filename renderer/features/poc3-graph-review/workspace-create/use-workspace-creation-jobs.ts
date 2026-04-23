'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GraphAnalysisEvent,
  ReviewWorkspaceCreationJobSnapshot,
  WorkspaceCreationEvent,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export interface WorkspaceCreationJobView extends ReviewWorkspaceCreationJobSnapshot {
  expanded: boolean;
  dismissed: boolean;
  retrying: boolean;
  trackedAnalysisRunId: string | null;
  trackedRevisionId: string | null;
}

interface JobState {
  [jobId: string]: WorkspaceCreationJobView;
}

function toView(
  snapshot: ReviewWorkspaceCreationJobSnapshot,
  current?: WorkspaceCreationJobView,
): WorkspaceCreationJobView {
  return {
    ...snapshot,
    expanded: current?.expanded ?? false,
    dismissed: current?.dismissed ?? false,
    retrying: current?.retrying ?? false,
    trackedAnalysisRunId: current?.trackedAnalysisRunId ?? null,
    trackedRevisionId: current?.trackedRevisionId ?? null,
  };
}

export function useWorkspaceCreationJobs() {
  const [jobs, setJobs] = useState<JobState>({});
  const hydratedRef = useRef(false);

  const upsertJobSnapshot = useCallback((snapshot: ReviewWorkspaceCreationJobSnapshot) => {
    setJobs((current) => ({
      ...current,
      [snapshot.jobId]: toView(snapshot, current[snapshot.jobId]),
    }));
  }, []);

  const hydrate = useCallback(async () => {
    const result = await window.poc3GraphReviewApi.listWorkspaceCreationJobs();
    setJobs((current) => {
      const next: JobState = { ...current };
      for (const snapshot of result.jobs) {
        next[snapshot.jobId] = toView(snapshot, current[snapshot.jobId]);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    void hydrate();

    const unsubscribe = window.poc3GraphReviewApi.onWorkspaceCreationEvent(
      (event: WorkspaceCreationEvent) => {
        if (event.type === 'snapshot') {
          upsertJobSnapshot(event.job);
          return;
        }
        if (event.type === 'log') {
          setJobs((current) => {
            const existing = current[event.jobId];
            if (!existing) {
              return current;
            }
            const logLines = [...existing.logLines, event.line];
            if (logLines.length > 500) {
              logLines.splice(0, logLines.length - 500);
            }
            return {
              ...current,
              [event.jobId]: {
                ...existing,
                logLines,
                latestLogLine: event.line,
                updatedAt: event.updatedAt,
              },
            };
          });
        }
      },
    );
    return unsubscribe;
  }, [hydrate, upsertJobSnapshot]);

  useEffect(() => {
    const unsubscribe = window.poc3GraphReviewApi.onGraphAnalysisEvent(
      (event: GraphAnalysisEvent) => {
        setJobs((current) => {
          const entries = Object.entries(current);
          let changed = false;
          const next: JobState = { ...current };
          for (const [jobId, job] of entries) {
            if (!matchesTrackedAnalysis(job, event)) {
              continue;
            }
            changed = true;
            next[jobId] = applyGraphEventToJob(job, event);
          }
          return changed ? next : current;
        });
      },
    );
    return unsubscribe;
  }, []);

  const toggleExpanded = useCallback((jobId: string) => {
    setJobs((current) => {
      const job = current[jobId];
      if (!job) {
        return current;
      }
      return {
        ...current,
        [jobId]: { ...job, expanded: !job.expanded },
      };
    });
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((current) => {
      const job = current[jobId];
      if (!job) {
        return current;
      }
      return {
        ...current,
        [jobId]: { ...job, dismissed: true },
      };
    });
  }, []);

  const retryJob = useCallback(
    async (jobId: string) => {
      const currentJob = jobs[jobId];
      if (!currentJob?.reviewWorkspaceId || currentJob.retrying) {
        return;
      }
      setJobs((current) => {
        const job = current[jobId];
        if (!job) {
          return current;
        }
        return {
          ...current,
          [jobId]: {
            ...job,
            retrying: true,
            status: 'running',
            phase: 'startAnalysis',
            errorMessage: null,
            latestLogLine: 'Graph analysis を再実行しています。',
            logLines: [...job.logLines, '[retryAnalysis] Graph analysis を再実行しています。'],
          },
        };
      });

      try {
        const result = await window.poc3GraphReviewApi.retryGraphAnalysis({
          reviewWorkspaceId: currentJob.reviewWorkspaceId,
        });
        setJobs((current) => {
          const job = current[jobId];
          if (!job) {
            return current;
          }
          if (!result.ok) {
            return {
              ...current,
              [jobId]: {
                ...job,
                retrying: false,
                status: 'failed',
                errorMessage: result.message,
                latestLogLine: result.message,
                logLines: [...job.logLines, `[error] ${result.message}`],
              },
            };
          }
          return {
            ...current,
            [jobId]: {
              ...job,
              retrying: true,
              status: 'running',
              phase: 'startAnalysis',
              errorMessage: null,
              trackedAnalysisRunId: result.analysis.analysisRunId,
              trackedRevisionId: result.analysis.revisionId,
              latestLogLine: 'Graph analysis queued',
              logLines: [
                ...job.logLines,
                `[retryAnalysis] graph analysis queued: ${result.analysis.analysisRunId}`,
              ],
            },
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Graph analysis の再試行に失敗しました。';
        setJobs((current) => {
          const job = current[jobId];
          if (!job) {
            return current;
          }
          return {
            ...current,
            [jobId]: {
              ...job,
              retrying: false,
              status: 'failed',
              errorMessage: message,
              latestLogLine: message,
              logLines: [...job.logLines, `[error] ${message}`],
            },
          };
        });
      }
    },
    [jobs],
  );

  const visibleJobs = Object.values(jobs)
    .filter((job) => !job.dismissed)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    jobs: visibleJobs,
    toggleExpanded,
    dismissJob,
    retryJob,
    upsertJobSnapshot,
  };
}

export function workspaceCardLayoutId(jobId: string): string {
  return `poc3-workspace-card-${jobId}`;
}

export function matchesTrackedAnalysis(
  job: WorkspaceCreationJobView,
  event: GraphAnalysisEvent,
): boolean {
  if (!job.trackedRevisionId && !job.trackedAnalysisRunId) {
    return false;
  }
  if (event.type === 'graph.ready') {
    return event.revisionId === job.trackedRevisionId;
  }
  return (
    event.analysisRunId === job.trackedAnalysisRunId || event.revisionId === job.trackedRevisionId
  );
}

export function toWorkspacePhase(
  phase: Extract<GraphAnalysisEvent, { type: 'analysis.snapshot' }>['phase'],
): WorkspaceCreationJobView['phase'] {
  switch (phase) {
    case 'program':
      return 'analysisProgram';
    case 'extract':
      return 'analysisExtract';
    case 'buildGraph':
      return 'analysisBuildGraph';
    case 'layout':
      return 'analysisLayout';
    case 'persist':
      return 'analysisPersist';
    default:
      return 'startAnalysis';
  }
}

export function applyGraphEventToJob(
  job: WorkspaceCreationJobView,
  event: GraphAnalysisEvent,
): WorkspaceCreationJobView {
  if (event.type === 'graph.ready') {
    return {
      ...job,
      retrying: false,
      status: 'completed',
      phase: 'done',
      latestLogLine: '依存関係分析が完了しました。',
      logLines: [...job.logLines, '[done] 依存関係分析が完了しました。'],
      trackedAnalysisRunId: null,
      trackedRevisionId: null,
    };
  }

  const nextPhase = toWorkspacePhase(event.phase);
  const message = event.message ?? fallbackMessageForPhase(event.phase);
  const nextStatus =
    event.status === 'failed' ? 'failed' : event.status === 'completed' ? 'completed' : 'running';
  const nextLogLines = [...job.logLines];
  if (message) {
    nextLogLines.push(
      event.status === 'failed' ? `[error] ${message}` : `[analysis:${event.phase}] ${message}`,
    );
  }
  return {
    ...job,
    retrying: event.status === 'queued' || event.status === 'running',
    status: nextStatus,
    phase: event.status === 'completed' ? 'done' : nextPhase,
    latestLogLine: message,
    logLines: nextLogLines,
    errorMessage: event.status === 'failed' ? message : null,
    trackedAnalysisRunId:
      event.status === 'failed' || event.status === 'completed' ? null : job.trackedAnalysisRunId,
    trackedRevisionId:
      event.status === 'failed' || event.status === 'completed' ? null : job.trackedRevisionId,
  };
}

export function fallbackMessageForPhase(
  phase: Extract<GraphAnalysisEvent, { type: 'analysis.snapshot' }>['phase'],
): string {
  switch (phase) {
    case 'program':
      return 'TypeScript Program を構築しています。';
    case 'extract':
      return '依存関係を抽出しています。';
    case 'buildGraph':
      return '依存関係 Graph を構築しています。';
    case 'layout':
      return 'Graph layout を計算しています。';
    case 'persist':
      return 'Graph snapshot を保存しています。';
    default:
      return 'Graph analysis queued';
  }
}
