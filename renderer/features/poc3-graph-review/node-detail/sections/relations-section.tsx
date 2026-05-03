'use client';

import { GitBranch } from 'lucide-react';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function RelationsSection({
  detail,
  onSelectNode,
}: {
  detail: NodeDetailSnapshot;
  onSelectNode(nodeId: string): void;
}) {
  const incoming = detail.relations.incoming;
  const outgoing = detail.relations.outgoing;
  if (incoming.length + outgoing.length === 0) {
    return null;
  }
  return (
    <section className="border-t border-white/[0.08] pt-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/48">
        <GitBranch className="size-3.5" aria-hidden="true" />
        Relations
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RelationGroup title="Incoming" items={incoming} onSelectNode={onSelectNode} />
        <RelationGroup title="Outgoing" items={outgoing} onSelectNode={onSelectNode} />
      </div>
    </section>
  );
}

function RelationGroup({
  title,
  items,
  onSelectNode,
}: {
  title: string;
  items: NodeDetailSnapshot['relations']['incoming'];
  onSelectNode(nodeId: string): void;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] text-white/42">{title}</p>
      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <button
              key={`${item.edge.edgeId}:${item.nodeId}`}
              type="button"
              className="min-w-0 rounded-[7px] border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-left transition hover:border-[#58d7ff]/28 hover:bg-[#58d7ff]/10"
              onClick={() => onSelectNode(item.nodeId)}
            >
              <span className="block truncate text-[12px] font-semibold text-white/82">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.1em] text-white/38">
                {item.edge.kind} / {item.kind}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-[7px] border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[11px] text-white/34">
          None
        </p>
      )}
    </div>
  );
}
