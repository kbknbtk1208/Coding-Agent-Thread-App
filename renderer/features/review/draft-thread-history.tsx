import React from 'react';
import type { ReviewLocalThread, ReviewThreadMessage } from '../../../shared/domain/review-draft';

function getMessageAuthorLabel(role: ReviewThreadMessage['role']): string {
  return role === 'assistant' ? 'Assistant' : 'You';
}

export interface DraftThreadHistoryProps {
  thread: ReviewLocalThread;
}

export function DraftThreadHistory({ thread }: DraftThreadHistoryProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Thread history</h4>
        <span className="text-xs text-slate-500">{thread.messages.length} messages</span>
      </div>
      <div className="mt-3 space-y-3">
        {thread.messages.map((message) => (
          <div
            key={message.localMessageId}
            className={`rounded-2xl border px-3 py-3 ${
              message.role === 'assistant'
                ? 'border-fuchsia-400/20 bg-fuchsia-400/10'
                : 'border-cyan-400/20 bg-cyan-400/10'
            }`}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <span>{getMessageAuthorLabel(message.role)}</span>
              <span>{message.source}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
              {message.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
