'use client';

import { AnimatePresence } from 'framer-motion';
import type { WorkspaceCreationJobView } from './use-workspace-creation-jobs';
import { WorkspaceCreationCard } from './workspace-creation-card';

interface WorkspaceCreationStackProps {
  jobs: WorkspaceCreationJobView[];
  onToggleExpand: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}

export function WorkspaceCreationStack({
  jobs,
  onToggleExpand,
  onDismiss,
  onRetry,
}: WorkspaceCreationStackProps) {
  return (
    <div
      className="pointer-events-none flex flex-col gap-3"
      role="region"
      aria-label="Review Workspace creation jobs"
    >
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <WorkspaceCreationCard
            key={job.jobId}
            job={job}
            onToggleExpand={onToggleExpand}
            onDismiss={onDismiss}
            onRetry={onRetry}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
