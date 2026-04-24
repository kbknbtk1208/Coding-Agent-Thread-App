'use client';

import { LayoutGroup } from 'framer-motion';
import { Play, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Poc3AnimatedProfileMenu } from './components/animated-profile-menu';
import { DependencyGraphPanel } from './dependency-graph/dependency-graph-panel';
import {
  RepositorySettingsDialog,
  SETTINGS_LAYOUT_ID,
} from './repository-settings/repository-settings-dialog';
import {
  CREATE_WORKSPACE_LAYOUT_ID,
  CreateWorkspaceDialog,
} from './workspace-create/create-workspace-dialog';
import { useWorkspaceCreationJobs } from './workspace-create/use-workspace-creation-jobs';
import { WorkspaceCreationStack } from './workspace-create/workspace-creation-stack';
import { useReviewWorkspaces } from './workspaces/use-review-workspaces';
import { WorkspaceListCard } from './workspaces/workspace-list-card';

export function GraphReviewPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { jobs, toggleExpanded, dismissJob, retryJob, upsertJobSnapshot } =
    useWorkspaceCreationJobs();
  const {
    selectedWorkspace,
    otherWorkspaces,
    selectWorkspace,
    removingWorkspaceId,
    removeError,
    removeWorkspace,
  } = useReviewWorkspaces();
  const workspaceRemovalRunning = removingWorkspaceId !== null;

  const menuItems = useMemo(
    () => [
      {
        id: 'create-workspace',
        icon: Play,
        title: 'Create Workspace',
        description: 'PR / MR から Review Workspace を作成',
        layoutId: CREATE_WORKSPACE_LAYOUT_ID,
        disabled: workspaceRemovalRunning,
        onSelect: () => {
          if (!workspaceRemovalRunning) {
            setCreateOpen(true);
          }
        },
      },
      {
        id: 'repository-settings',
        icon: Settings,
        title: 'Repository Settings',
        description: 'Provider と local clone を管理',
        layoutId: SETTINGS_LAYOUT_ID,
        onSelect: () => setSettingsOpen(true),
      },
    ],
    [workspaceRemovalRunning],
  );

  return (
    <LayoutGroup>
      <div className="min-h-screen bg-[#050505] text-white">
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.18]"
          aria-hidden="true"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
          }}
        />
        <main className="relative flex min-h-screen w-full flex-col px-4 py-4 sm:px-6 lg:px-8 xl:px-10">
          <DependencyGraphPanel selectedWorkspace={selectedWorkspace} />
        </main>

        <div
          className="pointer-events-none fixed left-4 top-4 z-40 flex w-[340px] flex-col gap-3"
          role="region"
          aria-label="Review Workspace controls"
        >
          <WorkspaceListCard
            selectedWorkspace={selectedWorkspace}
            otherWorkspaces={otherWorkspaces}
            onSelectWorkspace={selectWorkspace}
            removingWorkspaceId={removingWorkspaceId}
            removeError={removeError}
            onRemoveWorkspace={removeWorkspace}
          />
          <WorkspaceCreationStack
            jobs={jobs}
            onToggleExpand={toggleExpanded}
            onDismiss={dismissJob}
            onRetry={retryJob}
          />
        </div>
        <Poc3AnimatedProfileMenu items={menuItems} />
        <RepositorySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CreateWorkspaceDialog
          open={createOpen && !workspaceRemovalRunning}
          onClose={() => setCreateOpen(false)}
          onStarted={(job) => {
            upsertJobSnapshot(job);
            setCreateOpen(false);
          }}
        />
      </div>
    </LayoutGroup>
  );
}
