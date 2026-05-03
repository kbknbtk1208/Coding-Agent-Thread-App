'use client';

import type { GraphRenderNode } from '../../../../../shared/poc3-domain/graph';
import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function UnavailableSection({
  selectedNode,
  detail,
}: {
  selectedNode: GraphRenderNode;
  detail?: NodeDetailSnapshot;
}) {
  const message =
    selectedNode.kind === 'external'
      ? '外部モジュールのためコード本文は表示しません。'
      : detail?.status === 'partial'
        ? '表示できる diff または code excerpt が一部だけ取得できました。'
        : '表示できる diff または code excerpt がありません。';

  return (
    <section className="rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-[12px] leading-6 text-white/68">{message}</p>
    </section>
  );
}
