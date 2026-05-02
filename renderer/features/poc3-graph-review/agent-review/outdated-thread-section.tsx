'use client';

import { ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import type { Poc3OutdatedAgentThread } from '../../../../shared/poc3-contracts/graph-review-ipc';

export function OutdatedThreadSection({ threads }: { threads: Poc3OutdatedAgentThread[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (threads.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2">
      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase text-white/38">
        <History className="size-3" aria-hidden="true" />
        Outdated {threads.length}
      </div>
      {threads.map((item) => {
        const expanded = expandedId === item.thread.localThreadId;
        const location = formatLocation(item);
        return (
          <div
            key={`${item.thread.localThreadId}:${item.tracking.checkedRevisionId}`}
            className="rounded-[7px] border border-white/[0.06] bg-white/[0.02]"
          >
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left"
              onClick={() =>
                setExpandedId((current) =>
                  current === item.thread.localThreadId ? null : item.thread.localThreadId,
                )
              }
            >
              <ChevronDown
                className={`size-3.5 shrink-0 text-white/38 transition-transform duration-200 ease-in-out ${expanded ? 'rotate-0' : '-rotate-90'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/62">
                {item.thread.title}
              </span>
              <span className="shrink-0 rounded-[4px] border border-[#ffbf6b]/20 bg-[#ffbf6b]/10 px-1.5 py-0.5 text-[9px] text-[#ffe0b5]">
                {item.tracking.reason ?? item.tracking.status}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <div className="border-t border-white/[0.06] px-2.5 py-2">
                  <p className="mb-1 truncate font-mono text-[10px] text-white/34">
                    {item.sourceRevision.headSha.slice(0, 7)} {'->'}{' '}
                    {item.checkedRevision.headSha.slice(0, 7)}
                  </p>
                  {location ? <p className="mb-2 text-[10px] text-white/38">{location}</p> : null}
                  <p className="whitespace-pre-wrap text-[11px] leading-5 text-white/55">
                    {item.thread.draftBody}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatLocation(item: Poc3OutdatedAgentThread): string | null {
  const location = item.thread.location;
  if (location.kind === 'overview') {
    return null;
  }
  const line = location.startLine ? `:${location.startLine}` : '';
  return `${location.filePath ?? 'unknown'}${line}`;
}
