'use client';

import { Network } from 'lucide-react';

export function GraphEmptyState() {
  return (
    <section className="flex h-full min-h-[420px] items-center justify-center">
      <div className="flex items-center gap-3 rounded-[8px] border border-dashed border-white/[0.14] bg-white/[0.03] px-4 py-3 text-sm text-white/62">
        <Network className="size-5 text-[#d8e071]" aria-hidden="true" />
        <span>対象 TypeScript node はありません</span>
      </div>
    </section>
  );
}
