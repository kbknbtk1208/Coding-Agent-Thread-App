'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GraphRenderNode } from '../../../../shared/poc3-domain/graph';
import type {
  NodeDetailSnapshot,
  NodeDetailViewMode,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewProviderKind } from '../../../../shared/poc3-domain/review-workspace';
import { usePublishComments } from '../provider-comments/use-publish-comments';
import type { UsePublishCommentsReturn } from '../provider-comments/use-publish-comments';
import type { NodeDetailState } from './use-node-detail';
import {
  NodeDetailScrollTargetProvider,
  type NodeDetailScrollTarget,
} from './node-detail-scroll-target-context';
import type { DiffAwareSourceBase } from './diff-aware-source-model';
import { PanelHeader } from './panel-shell/panel-header';
import { LoadingState, ErrorState, InlineNotice } from './panel-shell/panel-status';
import { SignalsSection } from './sections/signals-section';
import { RelationsSection } from './sections/relations-section';
import { DiagnosticsSection } from './sections/diagnostics-section';
import { UnavailableSection } from './sections/unavailable-section';
import { DiffAwareSourceSection } from './diff-source/diff-aware-source-section';
import { CompanionCodePane } from './companion-code-pane';

const PANEL_WIDTH_CLASS = 'w-[min(710px,calc(100vw-28px))]';
const PANEL_WITH_COMPANION_WIDTH_CLASS = 'w-[min(1280px,calc(100vw-28px))]';

export interface NodeDetailPanelProps {
  state: NodeDetailState;
  selectedNode: GraphRenderNode | null;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
  onClose(): void;
  onNodeDetailRefresh?: () => void;
  onThreadResolved?: () => void;
  providerKind?: ReviewProviderKind;
  scrollTarget?: NodeDetailScrollTarget | null;
}

export function NodeDetailPanel({
  state,
  selectedNode,
  viewMode,
  onViewModeChange,
  onSelectNode,
  onClose,
  onNodeDetailRefresh,
  onThreadResolved,
  providerKind,
  scrollTarget = null,
}: NodeDetailPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [showCompanion, setShowCompanion] = useState(false);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? panelRef.current;
    focusTarget?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [selectedNode]);

  useEffect(() => {
    setShowCompanion(false);
  }, [selectedNode?.nodeId]);

  const companionState = state.detail?.companion ?? null;
  const companionEnabled = Boolean(companionState && companionState.companions.length > 0);
  const isCompanionOpen = showCompanion && companionEnabled;

  return (
    <AnimatePresence initial={false}>
      {selectedNode ? (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.08)_60%,rgba(0,0,0,0.28)_100%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          />
          <motion.aside
            key="panel"
            role="region"
            aria-labelledby={titleId}
            tabIndex={-1}
            ref={panelRef}
            className={`absolute inset-y-3 right-3 z-30 flex ${
              isCompanionOpen ? PANEL_WITH_COMPANION_WIDTH_CLASS : PANEL_WIDTH_CLASS
            } overflow-hidden rounded-[14px] border border-white/[0.12] bg-[#090909]/96 text-white shadow-[0_28px_80px_rgba(0,0,0,0.58)] backdrop-blur-[20px]`}
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                const target = event.target as HTMLElement;
                if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
                if (target.closest('[data-diff-composer]')) return;
                onClose();
              }
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <PanelHeader
                node={selectedNode}
                state={state}
                onClose={onClose}
                titleId={titleId}
                closeButtonRef={closeButtonRef}
                companionToggle={{
                  state: companionState,
                  checked: isCompanionOpen,
                  onCheckedChange: setShowCompanion,
                }}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                <NodeDetailScrollTargetProvider target={scrollTarget}>
                  <PanelBody
                    state={state}
                    selectedNode={selectedNode}
                    viewMode={viewMode}
                    onViewModeChange={onViewModeChange}
                    onSelectNode={onSelectNode}
                    onNodeDetailRefresh={onNodeDetailRefresh}
                    onThreadResolved={onThreadResolved}
                    providerKind={providerKind}
                    showCompanion={isCompanionOpen}
                  />
                </NodeDetailScrollTargetProvider>
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PanelBody({
  state,
  selectedNode,
  viewMode,
  onViewModeChange,
  onSelectNode,
  onNodeDetailRefresh,
  onThreadResolved,
  providerKind,
  showCompanion,
}: {
  state: NodeDetailState;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  onSelectNode(nodeId: string): void;
  onNodeDetailRefresh?: () => void;
  onThreadResolved?: () => void;
  providerKind?: ReviewProviderKind;
  showCompanion: boolean;
}) {
  const detail = state.detail;
  const publishComments = usePublishComments({
    onPublished: () => onNodeDetailRefresh?.(),
  });

  if (state.status === 'loading' && !detail) {
    return (
      <div className="flex flex-col gap-4">
        <SignalsSection detail={null} selectedNode={selectedNode} />
        <LoadingState message="Loading node detail…" />
      </div>
    );
  }
  if (state.status === 'failed' && !detail) {
    return (
      <div className="flex flex-col gap-4">
        <SignalsSection detail={null} selectedNode={selectedNode} />
        <ErrorState message={state.message} />
      </div>
    );
  }

  const primary = (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {state.status === 'loading' && detail ? (
        <InlineNotice tone="loading" message={state.message ?? 'Refreshing node detail…'} />
      ) : null}
      {state.status === 'failed' && detail ? (
        <InlineNotice tone="error" message={state.message} />
      ) : null}
      <SignalsSection detail={detail} selectedNode={selectedNode} />
      <PrimarySection
        detail={detail}
        selectedNode={selectedNode}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        publishComments={publishComments}
        providerKind={providerKind}
        onThreadResolved={onThreadResolved}
      />
      {detail ? <RelationsSection detail={detail} onSelectNode={onSelectNode} /> : null}
      {detail ? <DiagnosticsSection detail={detail} /> : null}
    </div>
  );
  if (!showCompanion || !detail?.companion) {
    return primary;
  }
  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      {primary}
      <div className="min-w-0 flex-1 border-t border-white/[0.08] pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
        <CompanionCodePane
          companion={detail.companion}
          reviewWorkspaceId={detail.reviewWorkspaceId}
          scopeKey={detail.scopeKey}
          graphSnapshotId={null}
          ownerNodeId={detail.nodeId}
          refreshKey={0}
          publishComments={publishComments}
          providerKind={providerKind}
          onThreadResolved={onThreadResolved}
        />
      </div>
    </div>
  );
}

function PrimarySection({
  detail,
  selectedNode,
  viewMode,
  onViewModeChange,
  publishComments,
  providerKind,
  onThreadResolved,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
  viewMode: NodeDetailViewMode;
  onViewModeChange(viewMode: NodeDetailViewMode): void;
  publishComments: UsePublishCommentsReturn;
  providerKind?: ReviewProviderKind;
  onThreadResolved?: () => void;
}) {
  const source = useMemo<DiffAwareSourceBase | null>(
    () => (detail ? (detail.functionCode ?? detail.fileContext ?? detail.codeExcerpt) : null),
    [detail],
  );

  if (!detail) {
    return <UnavailableSection selectedNode={selectedNode} />;
  }

  if (source || detail.diffExcerpt || detail.diffSummary.patch) {
    return (
      <DiffAwareSourceSection
        detail={detail}
        source={source}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        publishComments={publishComments}
        providerKind={providerKind}
        onThreadResolved={onThreadResolved}
      />
    );
  }
  return <UnavailableSection selectedNode={selectedNode} detail={detail} />;
}
