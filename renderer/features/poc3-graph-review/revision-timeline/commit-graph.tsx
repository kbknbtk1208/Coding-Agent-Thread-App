'use client';

import React from 'react';
import { motion, useMotionValue, animate, useReducedMotion } from 'motion/react';
import type { RevisionCommitView } from '../../../../shared/poc3-domain/revision-commit';
import {
  POC3_MOTION_DELAY,
  POC3_MOTION_DURATION,
  POC3_MOTION_EASE,
  getMotionStaggerDelay,
  resolveMotionDuration,
} from '../components/motion-timing';

const CURVE_RADIUS = 10;
const CURVE_RATIO = 0.46;
const CURVE_ITERATIONS = 12;
const GROUP_DOT_X = 10;
const ITEM_DOT_X = 30;

interface TimelineNode {
  x: number;
  y: number;
}

interface CommitDateGroup {
  label: string;
  dateKey: string;
  commits: RevisionCommitView[];
}

function computeRadii(nodes: TimelineNode[]): number[] {
  const radii = nodes.map(() => CURVE_RADIUS);
  for (let iter = 0; iter < CURVE_ITERATIONS; iter++) {
    let adjusted = false;
    for (let i = 0; i < nodes.length - 1; i++) {
      const next = nodes[i + 1];
      const curr = nodes[i];
      if (!next || !curr) continue;
      const maxRadius = Math.abs(next.y - curr.y) * CURVE_RATIO;
      const total = radii[i] + (radii[i + 1] ?? 0);
      if (total <= maxRadius || total === 0) continue;
      const scale = maxRadius / total;
      radii[i] *= scale;
      if (radii[i + 1] !== undefined) {
        radii[i + 1] = (radii[i + 1] ?? 0) * scale;
      }
      adjusted = true;
    }
    if (!adjusted) break;
  }
  return radii;
}

function buildPath(nodes: TimelineNode[]): string {
  if (nodes.length < 2) return '';
  const radii = computeRadii(nodes);
  const first = nodes[0];
  if (!first) return '';
  let path = `M ${first.x} ${first.y}`;

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (!prev || !curr) continue;
    const dx = curr.x - prev.x;
    const absDx = Math.abs(dx);

    if (absDx < 2) {
      path += ` L ${curr.x} ${curr.y}`;
    } else {
      const dirY = curr.y - prev.y >= 0 ? 1 : -1;
      const dirX = dx > 0 ? 1 : -1;
      const r1 = radii[i - 1] ?? 0;
      const r2 = radii[i] ?? 0;
      const curveStartY = prev.y + dirY * r1;
      const curveEndY = curr.y - dirY * r2;
      const midY = (curveStartY + curveEndY) * 0.5;
      const halfDist = Math.abs(curveEndY - curveStartY) * 0.5;
      const hRadius = Math.min(24, absDx * 0.5, halfDist * 0.85);

      path += ` L ${prev.x} ${curveStartY}`;
      path += ` Q ${prev.x} ${midY}, ${prev.x + dirX * hRadius} ${midY}`;
      path += ` L ${curr.x - dirX * hRadius} ${midY}`;
      path += ` Q ${curr.x} ${midY}, ${curr.x} ${curveEndY}`;
      path += ` L ${curr.x} ${curr.y}`;
    }
  }

  const last = nodes[nodes.length - 1];
  if (last) path += ` L ${last.x} ${last.y}`;
  return path;
}

function DotIndicator({ isActive, reducedMotion }: { isActive: boolean; reducedMotion: boolean }) {
  if (isActive) {
    return (
      <div className="relative flex items-center justify-center z-10 size-2.5">
        {!reducedMotion ? (
          <motion.div
            className="absolute rounded-full bg-rose-400/60 z-10"
            initial={{ width: 14, height: 14, opacity: 0.6 }}
            animate={{ width: 18, height: 18, opacity: 0 }}
            transition={{
              duration: POC3_MOTION_DURATION.pulse,
              repeat: Infinity,
              ease: POC3_MOTION_EASE.easeOut,
            }}
          />
        ) : null}
        <motion.div
          className="rounded-full bg-rose-500 ring-2 ring-white/10 size-2.5"
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center relative justify-center z-10 size-2">
      <div className="rounded-full ring-2 ring-white/[0.06] size-2 bg-white/25" />
    </div>
  );
}

interface CommitTimelineSVGProps {
  nodes: TimelineNode[];
  activeIndex: number;
  containerHeight: number;
}

function CommitTimelineSVG({ nodes, activeIndex, containerHeight }: CommitTimelineSVGProps) {
  const stop1Ref = React.useRef<SVGStopElement>(null);
  const stop2Ref = React.useRef<SVGStopElement>(null);
  const progress = useMotionValue(0);
  const pathD = React.useMemo(() => buildPath(nodes), [nodes]);

  React.useEffect(() => {
    if (nodes.length < 2) return;
    const activeNode = nodes[activeIndex];
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!activeNode || !firstNode || !lastNode) return;
    const activeY = activeNode.y;
    const firstY = firstNode.y;
    const span = lastNode.y - firstY;
    if (span === 0) return;
    const ratio = (activeY - firstY) / span;
    animate(progress, ratio, {
      duration: POC3_MOTION_DURATION.fast,
      ease: POC3_MOTION_EASE.easeOut,
    });
  }, [activeIndex, nodes, progress]);

  React.useEffect(
    () =>
      progress.on('change', (val) => {
        const pct = val * 100;
        stop1Ref.current?.setAttribute('offset', `${Math.max(0, pct)}%`);
        stop2Ref.current?.setAttribute('offset', `${Math.min(100, pct + 4)}%`);
      }),
    [progress],
  );

  if (!pathD) return null;

  const firstY = nodes[0]?.y ?? 0;
  const lastY = nodes[nodes.length - 1]?.y ?? containerHeight;

  return (
    <svg
      className="absolute top-0 pointer-events-none"
      height={containerHeight}
      style={{ left: 0, width: '40px', overflow: 'visible', zIndex: 1 }}
    >
      <defs>
        <linearGradient
          id="commit-graph-tl-grad"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={firstY}
          x2="0"
          y2={lastY}
        >
          <stop ref={stop1Ref} offset="0%" stopColor="#fb7185" />
          <stop ref={stop2Ref} offset="4%" stopColor="rgba(255,255,255,0.1)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill="none"
        stroke="url(#commit-graph-tl-grad)"
        strokeWidth={2}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDateLabel(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const commitDayMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (commitDayMs === todayMs) return 'Today';
  if (commitDayMs === todayMs - 86_400_000) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function groupCommitsByDate(commits: RevisionCommitView[]): CommitDateGroup[] {
  const groups: CommitDateGroup[] = [];
  const keyIndex = new Map<string, number>();

  for (const commit of commits) {
    const dateStr = commit.committedAt ?? commit.authoredAt;
    let dateKey = 'unknown';

    if (dateStr) {
      const date = new Date(dateStr);
      if (!Number.isNaN(date.getTime())) {
        dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }
    }

    const existingIdx = keyIndex.get(dateKey);
    if (existingIdx !== undefined) {
      const group = groups[existingIdx];
      if (group) group.commits.push(commit);
    } else {
      keyIndex.set(dateKey, groups.length);
      groups.push({ label: formatDateLabel(dateStr), dateKey, commits: [commit] });
    }
  }

  return groups;
}

interface CommitRowProps {
  commit: RevisionCommitView;
  flatIndex: number;
  isActive: boolean;
  onSelectRevision(revisionId: string): void;
  registerDot(index: number, el: HTMLElement | null): void;
  reducedMotion: boolean;
}

function CommitRow({
  commit,
  flatIndex,
  isActive,
  onSelectRevision,
  registerDot,
  reducedMotion,
}: CommitRowProps) {
  const disabled = !commit.revisionId;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (commit.revisionId) onSelectRevision(commit.revisionId);
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: resolveMotionDuration(POC3_MOTION_DURATION.fast, reducedMotion),
        delay: getMotionStaggerDelay(
          flatIndex,
          POC3_MOTION_DELAY.commitRowStep,
          0,
          POC3_MOTION_DELAY.commitItemMax,
          reducedMotion,
        ),
      }}
      className={`group relative flex w-full items-center rounded-md py-2.5 pr-3 text-left transition-colors duration-200 ${
        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-white/[0.04]'
      } ${isActive ? 'bg-white/[0.06]' : ''}`}
      style={{ marginLeft: '-20px', paddingLeft: '36px' }}
    >
      <div
        className="absolute"
        style={{ top: '50%', left: `${ITEM_DOT_X - 16}px`, width: 0, height: 0, zIndex: 10 }}
      >
        <div
          className="flex items-center justify-center"
          ref={(el) => registerDot(flatIndex, el)}
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <DotIndicator isActive={isActive} reducedMotion={reducedMotion} />
        </div>
      </div>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`truncate text-[12px] font-medium transition-colors ${
              isActive ? 'text-white/90' : 'text-white/55 group-hover:text-white/72'
            }`}
          >
            {commit.message}
          </span>
          {isActive ? (
            <span className="shrink-0 rounded-[3px] border border-[#d8e071]/25 bg-[#d8e071]/10 px-1 py-[1px] text-[9px] font-semibold uppercase text-[#edf58a]">
              active
            </span>
          ) : null}
          {commit.role === 'orphaned' ? (
            <span className="shrink-0 rounded-[3px] border border-[#ffbf6b]/25 bg-[#ffbf6b]/10 px-1 py-[1px] text-[9px] font-semibold uppercase text-[#ffe0b5]">
              orphaned
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-white/36">
          <span className="truncate">{commit.author.name}</span>
          <span>{formatRelativeTime(commit.committedAt ?? commit.authoredAt)}</span>
          <code className="ml-auto font-mono text-[10px] text-white/38">{commit.shortSha}</code>
        </span>
      </span>
    </motion.button>
  );
}

interface CommitGroupSectionProps {
  group: CommitDateGroup;
  groupFlatIndex: number;
  itemStartIndex: number;
  onSelectRevision(revisionId: string): void;
  registerDot(index: number, el: HTMLElement | null): void;
  reducedMotion: boolean;
}

function CommitGroupSection({
  group,
  groupFlatIndex,
  itemStartIndex,
  onSelectRevision,
  registerDot,
  reducedMotion,
}: CommitGroupSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: resolveMotionDuration(POC3_MOTION_DURATION.commitGroup, reducedMotion),
        delay: getMotionStaggerDelay(
          groupFlatIndex,
          POC3_MOTION_DELAY.commitGroupStep,
          0,
          POC3_MOTION_DELAY.commitItemMax,
          reducedMotion,
        ),
      }}
      className="mb-1"
    >
      <div className="relative flex items-center py-2">
        <div className="absolute top-1/2 size-0 z-10" style={{ left: `${GROUP_DOT_X - 26}px` }}>
          <div
            className="flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
            ref={(el) => registerDot(groupFlatIndex, el)}
          >
            <DotIndicator isActive={false} reducedMotion={reducedMotion} />
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/38">
          {group.label}
        </span>
      </div>
      <div className="flex flex-col">
        {group.commits.map((commit, idx) => {
          const isActive = commit.role === 'active' || commit.role === 'head';
          return (
            <CommitRow
              key={`${commit.sha}-${idx}`}
              commit={commit}
              flatIndex={itemStartIndex + idx}
              isActive={isActive}
              onSelectRevision={onSelectRevision}
              registerDot={registerDot}
              reducedMotion={reducedMotion}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

interface CommitGraphProps {
  commits: RevisionCommitView[];
  onSelectRevision(revisionId: string): void;
}

export function CommitGraph({ commits, onSelectRevision }: CommitGraphProps) {
  const shouldReduceMotion = useReducedMotion();
  const reducedMotion = shouldReduceMotion === true;
  const [nodes, setNodes] = React.useState<TimelineNode[]>([]);
  const [containerHeight, setContainerHeight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dotRefs = React.useRef(new Map<number, HTMLElement>());

  const groups = React.useMemo(() => groupCommitsByDate(commits), [commits]);

  const registerDot = React.useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      dotRefs.current.set(index, el);
    } else {
      dotRefs.current.delete(index);
    }
  }, []);

  const measureNodes = React.useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const measured: TimelineNode[] = [];

    let flatIndex = 0;
    for (const group of groups) {
      const groupEl = dotRefs.current.get(flatIndex);
      if (groupEl) {
        const r = groupEl.getBoundingClientRect();
        measured.push({ x: GROUP_DOT_X, y: r.top - rect.top });
      } else {
        measured.push(measured[measured.length - 1] ?? { x: GROUP_DOT_X, y: 0 });
      }

      const itemStart = flatIndex + 1;
      for (let i = 0; i < group.commits.length; i++) {
        const el = dotRefs.current.get(itemStart + i);
        if (el) {
          const r = el.getBoundingClientRect();
          measured.push({ x: ITEM_DOT_X, y: r.top - rect.top });
        } else {
          measured.push(measured[measured.length - 1] ?? { x: ITEM_DOT_X, y: 0 });
        }
      }

      flatIndex += 1 + group.commits.length;
    }

    setNodes(measured);
    setContainerHeight(containerRef.current.scrollHeight);
  }, [groups]);

  React.useEffect(() => {
    const frameId = window.requestAnimationFrame(measureNodes);
    window.addEventListener('resize', measureNodes);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', measureNodes);
    };
  }, [measureNodes]);

  const activeIndex = React.useMemo(() => {
    let flatIndex = 0;
    for (const group of groups) {
      flatIndex++;
      for (let i = 0; i < group.commits.length; i++) {
        const commit = group.commits[i];
        if (commit && (commit.role === 'active' || commit.role === 'head')) {
          return flatIndex + i;
        }
      }
      flatIndex += group.commits.length;
    }
    return 0;
  }, [groups]);

  if (commits.length === 0) {
    return <div className="px-3 py-4 text-xs text-white/38">commit はまだ取得されていません</div>;
  }

  let flatCounter = 0;

  return (
    <div className="overflow-hidden">
      <div ref={containerRef} className="relative pl-9 pr-4 py-2">
        <CommitTimelineSVG
          nodes={nodes}
          activeIndex={activeIndex}
          containerHeight={containerHeight}
        />
        {groups.map((group) => {
          const gIdx = flatCounter;
          const iStart = flatCounter + 1;
          flatCounter += 1 + group.commits.length;
          return (
            <CommitGroupSection
              key={group.dateKey}
              group={group}
              groupFlatIndex={gIdx}
              itemStartIndex={iStart}
              onSelectRevision={onSelectRevision}
              registerDot={registerDot}
              reducedMotion={reducedMotion}
            />
          );
        })}
      </div>
    </div>
  );
}
