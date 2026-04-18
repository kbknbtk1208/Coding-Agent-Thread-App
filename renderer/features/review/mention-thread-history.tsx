import React from 'react';
import type {
  ReviewMentionMessage,
  ReviewMentionThread,
} from '../../../shared/domain/review-mention';
import { reviewTheme } from './review-ui';

function getMessageAuthorLabel(role: ReviewMentionMessage['role']): string {
  return role === 'assistant' ? 'Assistant' : 'You';
}

export function MentionThreadHistory({ thread }: { thread: ReviewMentionThread }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h4 className={reviewTheme.title}>Mention history</h4>
        <span className="text-xs text-[#8b949e]">{thread.messages.length} messages</span>
      </div>
      <div className="mt-3 space-y-3">
        {thread.messages.map((message) => (
          <div
            key={message.localMessageId}
            className={`rounded-[12px] border px-3 py-3 ${
              message.role === 'assistant'
                ? 'border-[#4EBE96]/20 bg-[#4EBE96]/10'
                : 'border-[#479FFA]/20 bg-[#479FFA]/10'
            }`}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#8b949e]">
              <span>{getMessageAuthorLabel(message.role)}</span>
              <span>{message.source}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#f4f1ea]">
              {message.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
