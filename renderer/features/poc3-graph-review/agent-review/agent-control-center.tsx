'use client';

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  Play,
  ShieldQuestion,
  Terminal,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  AgentKind,
  AppSession,
  ConversationTurn,
  PendingPermission,
} from '../../../../shared/domain/agent';
import { useEffect, useRef, useState } from 'react';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';
import { isAgentReviewRunActive } from './agent-review-state';
import type { AgentReviewRun } from './agent-review-types';
import { OutdatedThreadSection } from './outdated-thread-section';
import { useAgentReview } from './use-agent-review';
import { useOutdatedAgentThreads } from './use-outdated-agent-threads';

type AnimationStage =
  | 'collapsed'
  | 'widthExpanding'
  | 'heightExpanding'
  | 'fullyExpanded'
  | 'contentFadingOut'
  | 'heightCollapsing'
  | 'widthCollapsing';

const TRIGGER_WIDTH = 'min(90vw, 280px)';
const TRIGGER_HEIGHT = 48;
const DOCK_WIDTH = 'min(90vw, 480px)';
const DOCK_HEIGHT = 'min(80vh, 560px)';

const AGENT_OPTIONS: Array<{ value: AgentKind; label: string }> = [
  { value: 'codex', label: 'Codex' },
  { value: 'copilot', label: 'Copilot' },
];

export interface AgentControlCenterProps {
  graph: GraphRenderSnapshot;
  selectedWorkspace: ReviewWorkspaceListItem;
  onCompleted?(): void;
}

export function AgentControlCenter({
  graph,
  selectedWorkspace,
  onCompleted,
}: AgentControlCenterProps) {
  const review = useAgentReview(selectedWorkspace.reviewWorkspaceId);
  const outdatedThreads = useOutdatedAgentThreads(selectedWorkspace.reviewWorkspaceId);
  const [stage, setStage] = useState<AnimationStage>('collapsed');
  const [pendingCompletedNotice, setPendingCompletedNotice] = useState(false);
  const notifiedCompletedRunRef = useRef<string | null>(null);
  const stageRef = useRef<AnimationStage>('collapsed');
  stageRef.current = stage;

  const disabled = !review.canStart || graph.nodes.length === 0;
  const isCollapsed = stage === 'collapsed';
  const isExpanded = stage === 'fullyExpanded';
  const isRunning = review.activeRun !== null;
  const selectedCodexModel = review.codexModelState.models.find(
    (model) => model.model === review.codexModelState.selectedModel,
  );
  const codexReasoningOptions =
    selectedCodexModel &&
    selectedCodexModel.defaultReasoningEffort &&
    !selectedCodexModel.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === selectedCodexModel.defaultReasoningEffort,
    )
      ? [
          ...selectedCodexModel.supportedReasoningEfforts,
          { reasoningEffort: selectedCodexModel.defaultReasoningEffort },
        ]
      : (selectedCodexModel?.supportedReasoningEfforts ?? []);

  const handleExpand = () => {
    setStage('widthExpanding');
    setTimeout(() => setStage('heightExpanding'), 400);
    setTimeout(() => setStage('fullyExpanded'), 850);
    setPendingCompletedNotice(false);
  };

  const handleCollapse = () => {
    setStage('contentFadingOut');
    setTimeout(() => setStage('heightCollapsing'), 250);
    setTimeout(() => setStage('widthCollapsing'), 650);
    setTimeout(() => setStage('collapsed'), 1050);
  };

  useEffect(() => {
    const latest = review.latestRun;
    if (!latest || latest.runId === notifiedCompletedRunRef.current) return;
    if (latest.status === 'completed' || latest.status === 'fallback_rich_text') {
      notifiedCompletedRunRef.current = latest.runId;
      onCompleted?.();
      if (stageRef.current === 'collapsed') {
        setPendingCompletedNotice(true);
      }
    }
  }, [onCompleted, review.latestRun]);

  const widthValue =
    stage === 'collapsed' || stage === 'widthCollapsing' ? TRIGGER_WIDTH : DOCK_WIDTH;

  const heightValue =
    stage === 'collapsed' || stage === 'widthExpanding' || stage === 'widthCollapsing'
      ? TRIGGER_HEIGHT
      : DOCK_HEIGHT;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4">
      <motion.div
        className="pointer-events-auto relative flex flex-col-reverse overflow-hidden"
        initial={{ width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT }}
        animate={{ width: widthValue, height: heightValue }}
        transition={{
          width: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
          height: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
        }}
        style={{
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(62,62,62,0.52) 0%, rgba(30,30,30,0.44) 100%)',
          backdropFilter: 'blur(36px)',
          WebkitBackdropFilter: 'blur(36px)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -24px 48px rgba(0,0,0,0.18), 0 8px 32px rgba(0,0,0,0.36)',
        }}
      >
        {/* gradient sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 40%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        {/* trigger — always visible, at bottom visually (flex-col-reverse) */}
        <div
          role={isCollapsed ? 'button' : undefined}
          tabIndex={isCollapsed ? 0 : undefined}
          aria-expanded={isExpanded}
          aria-label={isCollapsed ? 'Agent Review を開く' : undefined}
          onClick={() => {
            if (isCollapsed) handleExpand();
          }}
          onKeyDown={(e) => {
            if (isCollapsed && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleExpand();
            }
          }}
          className={`relative z-10 flex h-12 w-full shrink-0 items-center gap-3 border-t border-white/[0.06] px-4 outline-none transition ${
            isCollapsed
              ? 'cursor-pointer hover:bg-white/[0.06] focus-visible:bg-white/[0.08]'
              : 'cursor-default'
          }`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-[#58d7ff]/20 bg-[#58d7ff]/[0.08]">
            <Bot className="size-3.5 text-[#dff7ff]" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            {isCollapsed && isRunning ? (
              <span className="text-shimmer block truncate text-[12px] font-medium">
                Agent Review中です
              </span>
            ) : isCollapsed && pendingCompletedNotice ? (
              <span className="block truncate text-[12px] font-medium text-emerald-300/80">
                Agent Reviewが完了しました
              </span>
            ) : (
              <span className="block truncate text-[12px] font-medium text-white/55">
                Agent Review
              </span>
            )}
          </div>

          {!isCollapsed && review.activeRun ? <StatusPill run={review.activeRun} /> : null}

          <AnimatePresence>
            {!isCollapsed && (
              <motion.button
                key="close"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: isExpanded ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCollapse();
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                aria-label="Agent Review を閉じる"
              >
                <X size={12} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* content — grows above trigger */}
        <motion.div
          className="relative z-10 min-h-0 flex-1 overflow-y-auto"
          animate={{ opacity: isExpanded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="fey-scrollbar flex flex-col gap-3 px-4 py-3">
            <p className="truncate text-[11px] text-white/38">{selectedWorkspace.title}</p>

            <div className="grid grid-cols-2 gap-1 rounded-[7px] border border-white/[0.06] bg-white/[0.03] p-1">
              {AGENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-[5px] px-2 py-1.5 text-[12px] font-semibold transition ${
                    review.selectedAgent === option.value
                      ? 'bg-white text-black'
                      : 'text-white/52 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  onClick={() => review.setSelectedAgent(option.value)}
                  disabled={!review.canStart}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {review.selectedAgent === 'codex' ? (
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-1.5">
                <select
                  value={review.codexModelState.selectedModel}
                  onChange={(event) => review.setCodexModel(event.target.value)}
                  disabled={
                    !review.canStart ||
                    review.codexModelState.isLoading ||
                    review.codexModelState.models.length === 0
                  }
                  className="h-8 min-w-0 rounded-[7px] border border-white/[0.06] bg-black/22 px-2 text-[11px] font-medium text-white/70 outline-none transition focus:border-[#58d7ff]/28 disabled:opacity-50"
                  aria-label="Codex model"
                >
                  {review.codexModelState.models.length === 0 ? (
                    <option value="">
                      {review.codexModelState.isLoading ? 'Loading models' : 'Provider default'}
                    </option>
                  ) : (
                    review.codexModelState.models.map((model) => (
                      <option key={model.id} value={model.model}>
                        {model.displayName ?? model.model}
                      </option>
                    ))
                  )}
                </select>
                <select
                  value={review.codexModelState.selectedReasoningEffort}
                  onChange={(event) => review.setCodexReasoningEffort(event.target.value)}
                  disabled={!review.canStart || codexReasoningOptions.length === 0}
                  className="h-8 min-w-0 rounded-[7px] border border-white/[0.06] bg-black/22 px-2 text-[11px] font-medium text-white/70 outline-none transition focus:border-[#58d7ff]/28 disabled:opacity-50"
                  aria-label="Codex reasoning effort"
                >
                  {codexReasoningOptions.length === 0 ? (
                    <option value="">effort</option>
                  ) : (
                    codexReasoningOptions.map((option) => (
                      <option key={option.reasoningEffort} value={option.reasoningEffort}>
                        {option.reasoningEffort}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : null}

            {review.selectedAgent === 'codex' && review.codexModelState.errorMessage ? (
              <p className="rounded-[6px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-2 py-1.5 text-[11px] text-[#ffe0b5]">
                {review.codexModelState.errorMessage}
              </p>
            ) : null}

            <textarea
              value={review.instructions}
              onChange={(event) => review.setInstructions(event.target.value)}
              disabled={!review.canStart}
              rows={4}
              className="min-h-[96px] resize-none rounded-[7px] border border-white/[0.06] bg-black/22 px-3 py-2 text-[12px] leading-5 text-white/72 outline-none transition placeholder:text-white/22 focus:border-[#58d7ff]/28 disabled:opacity-50"
              aria-label="Agent Review instructions"
            />

            <button
              type="button"
              disabled={disabled}
              className="flex h-9 items-center justify-center gap-2 rounded-[7px] bg-[#d8e071] px-3 text-[12px] font-semibold text-black transition hover:bg-[#edf58a] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/28"
              onClick={() =>
                void review.startReview({
                  target: { workspace: selectedWorkspace, graph },
                })
              }
            >
              {review.activeRun ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {review.activeRun ? 'Running' : 'Run Review'}
            </button>

            <OutdatedThreadSection threads={outdatedThreads.threads} />

            {review.runs.length > 0 ? (
              <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2">
                {review.runs.map((run) => (
                  <RunHistoryItem
                    key={run.runId}
                    run={run}
                    expanded={review.expandedRunId === run.runId}
                    submittingPermissionKey={review.submittingPermissionKey}
                    onToggle={() => review.toggleRun(run.runId)}
                    onRespondPermission={review.respondPermission}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function StatusPill({ run }: { run: AgentReviewRun }) {
  const Icon =
    run.status === 'waiting_permission'
      ? ShieldQuestion
      : run.status === 'completed' || run.status === 'fallback_rich_text'
        ? CheckCircle2
        : run.status === 'failed'
          ? AlertTriangle
          : Loader2;
  const tone =
    run.status === 'failed'
      ? 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]'
      : run.status === 'completed' || run.status === 'fallback_rich_text'
        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50'
        : run.status === 'waiting_permission'
          ? 'border-[#ffbf6b]/25 bg-[#ffbf6b]/10 text-[#ffe0b5]'
          : 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}
    >
      <Icon
        className={`size-3 ${run.status === 'running' || run.status === 'starting' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {run.status}
    </span>
  );
}

function RunHistoryItem({
  expanded,
  onRespondPermission,
  onToggle,
  run,
  submittingPermissionKey,
}: {
  expanded: boolean;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
  onToggle(): void;
  run: AgentReviewRun;
  submittingPermissionKey: string | null;
}) {
  const latestTurn = run.session?.turns.at(-1) ?? null;
  const summary = getRunSummary(run, latestTurn);

  return (
    <div className="rounded-[7px] border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-white/38" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-white/38" aria-hidden="true" />
        )}
        <StatusPill run={run} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/55">{summary}</span>
      </button>

      {expanded ? (
        <div className="border-t border-white/[0.06] px-2.5 py-2">
          {run.errorMessage ? (
            <p className="mb-2 rounded-[6px] border border-[#ff7d7d]/25 bg-[#ff7d7d]/10 px-2 py-1.5 text-[11px] text-[#ffd4d4]">
              {run.errorMessage}
            </p>
          ) : null}
          {run.codexModel || run.codexReasoningEffort ? (
            <p className="mb-2 truncate text-[10px] text-white/34">
              {[run.codexModel, run.codexReasoningEffort].filter(Boolean).join(' / ')}
            </p>
          ) : null}
          {run.session ? (
            <SessionHistory
              run={run}
              session={run.session}
              submittingPermissionKey={submittingPermissionKey}
              onRespondPermission={onRespondPermission}
            />
          ) : (
            <p className="text-[11px] text-white/38">Session を開始しています。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SessionHistory({
  onRespondPermission,
  run,
  session,
  submittingPermissionKey,
}: {
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
  run: AgentReviewRun;
  session: AppSession;
  submittingPermissionKey: string | null;
}) {
  const isActive = isAgentReviewRunActive(run.status);
  const pendingPermissions = session.pendingPermissions;
  const turns = session.turns;

  return (
    <div className="flex flex-col gap-2">
      {pendingPermissions.map((permission) => (
        <PermissionActionRow
          key={permission.requestId}
          appSessionId={session.appSessionId}
          permission={permission}
          submittingPermissionKey={submittingPermissionKey}
          onRespondPermission={onRespondPermission}
        />
      ))}
      {turns.map((turn, index) => (
        <TurnEvent
          key={turn.turnId}
          turn={turn}
          isStreaming={isActive && index === turns.length - 1}
        />
      ))}
      {session.streamBuffer.content ? (
        <div className="rounded-[6px] bg-black/22 px-2 py-1.5">
          <p
            className={`whitespace-pre-wrap text-[11px] leading-5 ${isActive ? 'text-shimmer' : 'text-white/52'}`}
          >
            {session.streamBuffer.content}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PermissionActionRow({
  appSessionId,
  onRespondPermission,
  permission,
  submittingPermissionKey,
}: {
  appSessionId: string;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
  permission: PendingPermission;
  submittingPermissionKey: string | null;
}) {
  return (
    <div className="rounded-[7px] border border-[#ffbf6b]/24 bg-[#ffbf6b]/10 px-2.5 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#ffe0b5]">
        <ShieldQuestion className="size-3.5" aria-hidden="true" />
        {permission.method}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {permission.actions.map((action) => {
          const key = `${appSessionId}:${permission.requestId}:${action.actionId}`;
          const busy = submittingPermissionKey === key;
          return (
            <button
              key={action.actionId}
              type="button"
              disabled={busy}
              className="rounded-[5px] border border-[#ffbf6b]/25 px-2 py-1 text-[10px] font-semibold text-[#ffe0b5] transition hover:bg-[#ffbf6b]/12 disabled:opacity-50"
              onClick={() =>
                void onRespondPermission(appSessionId, permission.requestId, action.actionId)
              }
            >
              {busy ? '...' : action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TurnEvent({ isStreaming, turn }: { isStreaming: boolean; turn: ConversationTurn }) {
  const latestSegment = turn.intermediateSegments.at(-1);
  const body = latestSegment?.text || turn.response || turn.progressHint?.text || turn.prompt;
  return (
    <div className="rounded-[6px] bg-black/18 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase text-white/32">
        <span className="inline-flex items-center gap-1">
          <Terminal className="size-3" aria-hidden="true" />
          {turn.status}
        </span>
        <span className="inline-flex items-center gap-1 normal-case">
          <Clock3 className="size-3" aria-hidden="true" />
          {formatTime(turn.startedAt)}
        </span>
      </div>
      <p
        className={`line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 ${isStreaming ? 'text-shimmer' : 'text-white/52'}`}
      >
        {body}
      </p>
    </div>
  );
}

function getRunSummary(run: AgentReviewRun, latestTurn: ConversationTurn | null) {
  if (isAgentReviewRunActive(run.status)) {
    return (
      latestTurn?.progressHint?.text ?? latestTurn?.intermediateSegments.at(-1)?.text ?? 'running'
    );
  }
  if (run.status === 'completed') {
    return latestTurn?.result?.kind === 'richText'
      ? latestTurn.result.content
      : (latestTurn?.response ?? 'completed');
  }
  if (run.status === 'fallback_rich_text') {
    return 'completed with text fallback';
  }
  return run.errorMessage ?? 'failed';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
