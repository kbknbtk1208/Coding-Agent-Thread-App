'use client';

import type { GraphRenderNode } from '../../../../../shared/poc3-domain/graph';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function SignalsSection({
  detail,
  selectedNode,
}: {
  detail: NodeDetailSnapshot | null;
  selectedNode: GraphRenderNode;
}) {
  const remoteCount = detail?.threads.remote.length ?? selectedNode.badges.remoteThreadCount;
  const localCount = detail?.threads.local.length ?? 0;
  const agentCount = detail?.threads.agent.length ?? 0;
  const findingCount = detail?.findings.length ?? selectedNode.badges.findingCount;
  const topFindingSeverity = getTopFindingSeverity(detail?.findings ?? []);
  if (remoteCount + localCount + agentCount + findingCount === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2">
        {remoteCount > 0 ? (
          <SignalPill label="Remote threads" count={remoteCount} tone="info" />
        ) : null}
        {localCount > 0 ? (
          <SignalPill label="Local threads" count={localCount} tone="neutral" />
        ) : null}
        {agentCount > 0 ? (
          <SignalPill label="Agent threads" count={agentCount} tone="neutral" />
        ) : null}
        {findingCount > 0 ? (
          <SignalPill
            label="Findings"
            count={findingCount}
            tone={
              topFindingSeverity === 'high'
                ? 'danger'
                : topFindingSeverity === 'medium'
                  ? 'warning'
                  : 'info'
            }
          />
        ) : null}
      </ul>
    </section>
  );
}

function SignalPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'neutral' | 'info' | 'warning' | 'danger';
}) {
  const className =
    tone === 'danger'
      ? 'border-[#ff7d7d]/25 bg-[#ff7d7d]/10 text-[#ffd4d4]'
      : tone === 'warning'
        ? 'border-[#ffbf6b]/25 bg-[#ffbf6b]/10 text-[#ffe0b5]'
        : tone === 'info'
          ? 'border-[#58d7ff]/25 bg-[#58d7ff]/10 text-[#dff7ff]'
          : 'border-white/[0.08] bg-white/[0.04] text-white/68';
  return (
    <li
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {label} {count}
    </li>
  );
}

function getTopFindingSeverity(
  findings: NodeDetailSnapshot['findings'],
): 'low' | 'medium' | 'high' | null {
  if (findings.some((finding) => finding.severity === 'high')) {
    return 'high';
  }
  if (findings.some((finding) => finding.severity === 'medium')) {
    return 'medium';
  }
  if (findings.some((finding) => finding.severity === 'low')) {
    return 'low';
  }
  return null;
}
