'use client';

import { GitPullRequest, Network } from 'lucide-react';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import { DependencyGraphCanvas } from './dependency-graph-canvas';
import { GraphAnalysisState } from './graph-analysis-state';
import { GraphEmptyState } from './graph-empty-state';
import { useWorkspaceGraph } from './use-workspace-graph';

export function DependencyGraphPanel({
  selectedWorkspace,
}: {
  selectedWorkspace: ReviewWorkspaceListItem | null;
}) {
  const { state, retry } = useWorkspaceGraph(selectedWorkspace);

  if (!selectedWorkspace) {
    return <GraphSetupState />;
  }

  return (
    <section className="w-full pt-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#d8e071]">
            <GitPullRequest className="size-4" aria-hidden="true" />
            {selectedWorkspace.provider === 'github'
              ? `PR #${selectedWorkspace.reviewId}`
              : `MR !${selectedWorkspace.reviewId}`}
          </p>
          <h2 className="mt-2 truncate text-2xl font-semibold text-white">
            {selectedWorkspace.title}
          </h2>
        </div>
        {state.status === 'ready' ? (
          <div className="rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs text-white/58">
            {state.result.graph?.nodes.length ?? 0} nodes
          </div>
        ) : null}
      </div>

      {state.status === 'idle' || state.status === 'loading' || state.status === 'notReady' ? (
        <GraphAnalysisState status="loading" message={state.message} />
      ) : null}
      {state.status === 'failed' || state.status === 'missing' ? (
        <GraphAnalysisState
          status={state.status}
          message={state.message}
          onRetry={state.status === 'failed' ? () => void retry() : undefined}
        />
      ) : null}
      {state.status === 'ready' &&
      (!state.result.graph || state.result.graph.nodes.length === 0) ? (
        <GraphEmptyState />
      ) : null}
      {state.status === 'ready' && state.result.graph && state.result.graph.nodes.length > 0 ? (
        <DependencyGraphCanvas graph={state.result.graph} />
      ) : null}
    </section>
  );
}

function GraphSetupState() {
  return (
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
          <SetupStep index="01" title="Provider" description="GitHub / GitLab の token を保存" />
          <SetupStep
            index="02"
            title="Repository"
            description="local clone と worktree root を紐づけ"
          />
          <SetupStep index="03" title="Workspace" description="PR / MR から Workspace を作成" />
        </div>
      </div>
    </section>
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
