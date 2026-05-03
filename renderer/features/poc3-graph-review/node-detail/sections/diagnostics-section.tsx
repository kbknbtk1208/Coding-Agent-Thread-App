'use client';

import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function DiagnosticsSection({ detail }: { detail: NodeDetailSnapshot }) {
  const diagnostics = detail.diagnostics.filter((diagnostic) => diagnostic.severity !== 'info');
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <section className="border-t border-white/[0.08] pt-3">
      <div className="flex flex-col gap-1.5">
        {diagnostics.map((diagnostic) => (
          <p
            key={`${diagnostic.code}:${diagnostic.message}`}
            className="rounded-[7px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/8 px-2.5 py-2 text-[11px] leading-5 text-[#ffd79a]"
          >
            {diagnostic.message}
          </p>
        ))}
      </div>
    </section>
  );
}
