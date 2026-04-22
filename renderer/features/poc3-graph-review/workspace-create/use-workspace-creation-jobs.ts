'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ReviewWorkspaceCreationJobSnapshot,
  WorkspaceCreationEvent,
} from '../../../../shared/poc3-contracts/graph-review-ipc';

export interface WorkspaceCreationJobView extends ReviewWorkspaceCreationJobSnapshot {
  expanded: boolean;
  dismissed: boolean;
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
  };
}

export function useWorkspaceCreationJobs() {
  const [jobs, setJobs] = useState<JobState>({});
  const hydratedRef = useRef(false);

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
          setJobs((current) => ({
            ...current,
            [event.job.jobId]: toView(event.job, current[event.job.jobId]),
          }));
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
  }, [hydrate]);

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

  const visibleJobs = Object.values(jobs)
    .filter((job) => !job.dismissed)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    jobs: visibleJobs,
    toggleExpanded,
    dismissJob,
  };
}

export function workspaceCardLayoutId(jobId: string): string {
  return `poc3-workspace-card-${jobId}`;
}
