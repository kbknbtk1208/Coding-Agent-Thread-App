'use client';

import { ChevronDown, History, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { Streamdown } from 'streamdown';
import type { Poc3ArchivedRemoteThread } from '../../../../shared/poc3-contracts/graph-review-ipc';

export function ArchivedRemoteThreadSection({ threads }: { threads: Poc3ArchivedRemoteThread[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (threads.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2">
      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase text-white/38">
        <History className="size-3" aria-hidden="true" />
        Remote archive {threads.length}
      </div>
      {threads.map((item) => {
        const expanded = expandedId === item.thread.providerThreadId;
        const first = item.thread.comments[0] ?? null;
        return (
          <div
            key={`${item.revisionId}:${item.thread.providerThreadId}`}
            className="rounded-[7px] border border-[#58d7ff]/12 bg-[#58d7ff]/[0.035]"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              onClick={() =>
                setExpandedId((current) =>
                  current === item.thread.providerThreadId ? null : item.thread.providerThreadId,
                )
              }
            >
              <ChevronDown
                className={`size-3.5 shrink-0 text-white/38 transition-transform duration-200 ease-in-out ${expanded ? 'rotate-0' : '-rotate-90'}`}
                aria-hidden="true"
              />
              <MessageSquareText
                className="size-3.5 shrink-0 text-[#58d7ff]/70"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/62">
                {first?.body.trim() || item.thread.providerThreadId}
              </span>
              <span className="shrink-0 rounded-[4px] border border-[#58d7ff]/20 bg-[#58d7ff]/10 px-1.5 py-0.5 text-[9px] text-[#dff7ff]">
                {item.thread.anchorStatus}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <div className="border-t border-[#58d7ff]/10 px-2.5 py-2">
                  <p className="mb-1 truncate font-mono text-[10px] text-white/34">
                    {item.headSha.slice(0, 7)}
                  </p>
                  <p className="mb-2 text-[10px] text-white/38">{formatLocation(item)}</p>
                  <div className="space-y-2">
                    {item.thread.comments.map((comment) => (
                      <div
                        key={comment.providerCommentId}
                        className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-white/42">
                          <span className="font-semibold text-[#dff7ff]/78">
                            {comment.author.login}
                          </span>
                          <span>{formatShortDate(comment.createdAt)}</span>
                        </div>
                        <div className="text-[11px] leading-5 text-white/58">
                          <Streamdown>{comment.body}</Streamdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatLocation(item: Poc3ArchivedRemoteThread): string {
  const location = item.thread.location;
  if (location.kind === 'overview') {
    return 'overview';
  }
  const line = location.endLine ?? location.startLine;
  const lineLabel = line === null ? '' : `:${line}`;
  return `${location.filePath}${lineLabel}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
