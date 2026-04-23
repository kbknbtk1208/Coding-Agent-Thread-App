'use client';

import { LayoutGroup } from 'framer-motion';
import { GitPullRequest, Network, Play, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Poc3AnimatedProfileMenu } from './components/animated-profile-menu';
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
  const { jobs, toggleExpanded, dismissJob } = useWorkspaceCreationJobs();
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
        <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.1] pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d8e071]">
                Graph Review
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Dependency review workspace
              </h1>
            </div>
            <div className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm text-[#a8b0b8]">
              Repository setup first
            </div>
          </header>

          <section className="grid flex-1 place-items-center py-12">
            <div className="w-full max-w-3xl">
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#d8e071]/25 bg-[#d8e071]/12 text-[#d8e071]">
                  <Network className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Review graph setup</h2>
                  <p className="mt-1 text-sm leading-6 text-[#a8b0b8]">
                    Repository Provider と local clone の対応を登録すると、PR / MR の依存関係 graph
                    を作成できます。
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SetupStep
                  index="01"
                  title="Provider"
                  description="GitHub / GitLab の origin host と token を保存"
                />
                <SetupStep
                  index="02"
                  title="Repository"
                  description="origin URL と local clone、worktree root を紐づけ"
                />
                <SetupStep
                  index="03"
                  title="Workspace"
                  description="PR / MR から Review Workspace を作成"
                />
              </div>

              <div className="mt-8 rounded-lg border border-dashed border-white/[0.14] bg-white/[0.025] px-5 py-5">
                <div className="flex items-start gap-3">
                  <GitPullRequest className="mt-0.5 h-5 w-5 text-[#d8e071]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-white">メニューから Workspace を作成</p>
                    <p className="mt-1 text-sm leading-6 text-[#a8b0b8]">
                      左下のメニューを開き、Create Workspace を選択すると PR / MR URL から Review
                      Workspace を作成できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
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
          />
        </div>
        <Poc3AnimatedProfileMenu items={menuItems} />
        <RepositorySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CreateWorkspaceDialog
          open={createOpen && !workspaceRemovalRunning}
          onClose={() => setCreateOpen(false)}
          onStarted={() => setCreateOpen(false)}
        />
      </div>
    </LayoutGroup>
  );
}

function SetupStep({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-lg border border-white/[0.1] bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d8e071]">{index}</p>
      <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#a8b0b8]">{description}</p>
    </article>
  );
}
