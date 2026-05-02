'use client';

import React from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

export interface TimelineItem {
  id: string;
  text: string;
}

export interface TimelineGroup {
  id: string;
  label: string;
  items: TimelineItem[];
}

interface TimelineNode {
  x: number;
  y: number;
}

const CURVE_RADIUS = 10;
const CURVE_RATIO = 0.46;
const CURVE_ITERATIONS = 12;
const GROUP_DOT_X = 10;
const ITEM_DOT_X = 30;

function computeRadii(nodes: TimelineNode[]): number[] {
  const radii = nodes.map(() => CURVE_RADIUS);
  for (let iter = 0; iter < CURVE_ITERATIONS; iter++) {
    let adjusted = false;
    for (let i = 0; i < nodes.length - 1; i++) {
      const maxRadius = Math.abs(nodes[i + 1].y - nodes[i].y) * CURVE_RATIO;
      const total = radii[i] + radii[i + 1];
      if (total <= maxRadius || total === 0) continue;
      const scale = maxRadius / total;
      radii[i] *= scale;
      radii[i + 1] *= scale;
      adjusted = true;
    }
    if (!adjusted) break;
  }
  return radii;
}

function buildPath(nodes: TimelineNode[]): string {
  if (nodes.length < 2) return '';
  const radii = computeRadii(nodes);
  let path = `M ${nodes[0].x} ${nodes[0].y}`;

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    const dx = curr.x - prev.x;
    const absDx = Math.abs(dx);

    if (absDx < 2) {
      path += ` L ${curr.x} ${curr.y}`;
    } else {
      const dirY = curr.y - prev.y >= 0 ? 1 : -1;
      const dirX = dx > 0 ? 1 : -1;
      const r1 = radii[i - 1];
      const r2 = radii[i];
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
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function DotIndicator({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <div className="relative flex items-center justify-center z-10 size-2.5">
        <motion.div
          className="absolute rounded-full bg-rose-400/60 z-10"
          initial={{ width: 14, height: 14, opacity: 0.6 }}
          animate={{ width: 18, height: 18, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
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

interface TimelineSVGProps {
  nodes: TimelineNode[];
  activeIndex: number;
  containerHeight: number;
}

function TimelineSVG({ nodes, activeIndex, containerHeight }: TimelineSVGProps) {
  const [pathD, setPathD] = React.useState('');
  const stop1Ref = React.useRef<SVGStopElement>(null);
  const stop2Ref = React.useRef<SVGStopElement>(null);
  const progress = useMotionValue(0);

  React.useEffect(() => {
    setPathD(buildPath(nodes));
  }, [nodes]);

  React.useEffect(() => {
    if (nodes.length < 2) return;
    const activeY = nodes[activeIndex]?.y ?? nodes[0].y;
    const firstY = nodes[0].y;
    const lastY = nodes[nodes.length - 1].y - firstY;
    if (lastY === 0) return;
    const ratio = (activeY - firstY) / lastY;
    animate(progress, ratio, { duration: 0.2, ease: 'easeOut' });
  }, [activeIndex, nodes, progress]);

  React.useEffect(
    () =>
      progress.on('change', (val) => {
        const pct = val * 100;
        const p1 = Math.max(0, pct);
        const p2 = Math.min(100, pct + 4);
        stop1Ref.current?.setAttribute('offset', `${p1}%`);
        stop2Ref.current?.setAttribute('offset', `${p2}%`);
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
          id="tl-curved-grad"
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
        stroke="url(#tl-curved-grad)"
        strokeWidth={2}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TimelineItemRowProps {
  item: TimelineItem;
  flatIndex: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  registerDot: (index: number, el: HTMLElement | null) => void;
}

function TimelineItemRow({
  item,
  flatIndex,
  isActive,
  onSelect,
  registerDot,
}: TimelineItemRowProps) {
  return (
    <motion.button
      onClick={() => onSelect(item.id)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: flatIndex * 0.02 }}
      className={`group relative flex w-full cursor-pointer items-center rounded-xl py-3.5 pr-4 text-left transition-colors duration-200 ${
        isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
      }`}
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
          <DotIndicator isActive={isActive} />
        </div>
      </div>
      <span
        className={`text-[15px] leading-relaxed transition-colors font-medium truncate ${
          isActive ? 'text-white/90' : 'text-white/40 group-hover:text-white/60'
        }`}
      >
        {item.text}
      </span>
    </motion.button>
  );
}

interface TimelineGroupSectionProps {
  group: TimelineGroup;
  groupFlatIndex: number;
  itemStartIndex: number;
  activeId: string;
  onSelect: (id: string) => void;
  registerDot: (index: number, el: HTMLElement | null) => void;
}

function TimelineGroupSection({
  group,
  groupFlatIndex,
  itemStartIndex,
  activeId,
  onSelect,
  registerDot,
}: TimelineGroupSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: groupFlatIndex * 0.03 }}
      className="mb-1"
    >
      <div className="relative flex items-center py-3.5">
        <div className="absolute top-1/2 size-0 z-10" style={{ left: `${GROUP_DOT_X - 26}px` }}>
          <div
            className="flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
            ref={(el) => registerDot(groupFlatIndex, el)}
          >
            <DotIndicator isActive={false} />
          </div>
        </div>
        <h2 className="text-sm font-bold leading-5 text-white/60">{group.label}</h2>
      </div>
      <div className="flex flex-col">
        {group.items.map((item, idx) => (
          <TimelineItemRow
            key={item.id}
            item={item}
            flatIndex={itemStartIndex + idx}
            isActive={item.id === activeId}
            onSelect={onSelect}
            registerDot={registerDot}
          />
        ))}
      </div>
    </motion.div>
  );
}

const TABS = ['Day', 'Week', 'Month'] as const;
type Tab = (typeof TABS)[number];

export interface AnimatedCurvedTimelineProps {
  groups?: TimelineGroup[];
  className?: string;
}

const DEFAULT_GROUPS: TimelineGroup[] = [
  {
    id: 'today',
    label: 'Today',
    items: [
      { id: '1', text: 'Ingested diff for PR #128' },
      { id: '2', text: 'Generated review summary' },
      { id: '3', text: 'Promoted thread candidates' },
    ],
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    items: [
      { id: '4', text: 'Resolved inline comments' },
      { id: '5', text: 'Drafted polite reply to reviewer' },
      { id: '6', text: 'Compared Codex vs Copilot output' },
      { id: '7', text: 'Synced with main branch' },
    ],
  },
  {
    id: 'may1',
    label: 'May 1, 2026',
    items: [
      { id: '8', text: 'Scaffold review-gateway module' },
      { id: '9', text: 'Added thought chain to summary' },
      { id: '10', text: 'Fixed TypeScript generic error' },
      { id: '11', text: 'Opened follow-up PR' },
    ],
  },
  {
    id: 'apr30',
    label: 'Apr 30, 2026',
    items: [
      { id: '12', text: 'Seed review assistant playground' },
      { id: '13', text: 'Reviewed pull request feedback' },
    ],
  },
];

export function AnimatedCurvedTimeline({
  groups = DEFAULT_GROUPS,
  className = '',
}: AnimatedCurvedTimelineProps) {
  const [activeId, setActiveId] = React.useState('5');
  const [activeTab, setActiveTab] = React.useState<Tab>('Day');
  const [nodes, setNodes] = React.useState<TimelineNode[]>([]);
  const [containerHeight, setContainerHeight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dotRefs = React.useRef(new Map<number, HTMLElement | null>());

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
      const totalItems = group.items.length;
      const totalFlat = groups.reduce((acc, g) => acc + 1 + g.items.length, 0);
      void totalItems;
      void totalFlat;

      const groupEl = dotRefs.current.get(flatIndex);
      if (groupEl) {
        const r = groupEl.getBoundingClientRect();
        measured.push({ x: GROUP_DOT_X, y: r.top - rect.top });
      } else {
        measured.push(measured[measured.length - 1] ?? { x: GROUP_DOT_X, y: 0 });
      }

      const itemStart = flatIndex + 1;
      for (let i = 0; i < group.items.length; i++) {
        const el = dotRefs.current.get(itemStart + i);
        if (el) {
          const r = el.getBoundingClientRect();
          measured.push({ x: ITEM_DOT_X, y: r.top - rect.top });
        } else {
          const prev = measured[measured.length - 1];
          measured.push(prev ?? { x: ITEM_DOT_X, y: 0 });
        }
      }

      flatIndex += 1 + group.items.length;
    }

    setNodes(measured);
    setContainerHeight(containerRef.current.scrollHeight);
  }, [groups]);

  React.useEffect(() => {
    const id = setTimeout(measureNodes, 200);
    window.addEventListener('resize', measureNodes);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measureNodes);
    };
  }, [measureNodes]);

  const allNodes = React.useMemo(() => {
    const flat: Array<{ type: 'group'; groupId: string } | { type: 'item'; itemId: string }> = [];
    for (const g of groups) {
      flat.push({ type: 'group', groupId: g.id });
      for (const item of g.items) {
        flat.push({ type: 'item', itemId: item.id });
      }
    }
    return flat;
  }, [groups]);

  const activeIndex = React.useMemo(() => {
    const idx = allNodes.findIndex((n) => n.type === 'item' && n.itemId === activeId);
    return idx >= 0 ? idx : 0;
  }, [allNodes, activeId]);

  let flatCounter = 0;

  return (
    <div
      className={`flex h-full w-full flex-col rounded-2xl border border-white/[0.08] bg-[linear-gradient(176.83deg,#141414_24.95%,#0b0b0b_50.08%,#030303_88.5%)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-white/90">Timeline</h1>
        <div className="flex items-center rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer"
            >
              {activeTab === tab && (
                <div className="absolute inset-0 rounded-lg bg-white/[0.07] border border-white/[0.08]" />
              )}
              <span
                className={`relative z-10 ${
                  activeTab === tab ? 'text-white/90' : 'text-white/30 hover:text-white/50'
                }`}
              >
                {tab}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div ref={containerRef} className="relative pl-9">
          <TimelineSVG nodes={nodes} activeIndex={activeIndex} containerHeight={containerHeight} />

          {groups.map((group) => {
            const gIdx = flatCounter;
            const iStart = flatCounter + 1;
            flatCounter += 1 + group.items.length;

            return (
              <TimelineGroupSection
                key={group.id}
                group={group}
                groupFlatIndex={gIdx}
                itemStartIndex={iStart}
                activeId={activeId}
                onSelect={setActiveId}
                registerDot={registerDot}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
