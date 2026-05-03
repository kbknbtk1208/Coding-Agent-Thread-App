'use client';

import type {
  Poc3AgentThreadMessage,
  NodeDetailSnapshot,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';
import { MarkdownBody } from './markdown-body';
export { MarkdownBody } from './markdown-body';

function ThreadMessageBubble({ message }: { message: Poc3AgentThreadMessage }) {
  const indent = message.source === 'user-reply' || message.source === 'agent-reply' ? 'ml-4' : '';
  const textColor = message.source === 'user-reply' ? 'text-[#d7eaff]' : 'text-[#d0d5db]';
  return (
    <div className={`border-t border-fuchsia-400/10 pt-2 first:border-t-0 first:pt-0 ${indent}`}>
      <div className={`poc3-remote-comment-body text-[11px] leading-5 ${textColor}`}>
        <MarkdownBody>{message.body}</MarkdownBody>
      </div>
    </div>
  );
}

export function FindingMessagesList({
  finding,
  messages,
}: {
  finding: NodeDetailSnapshot['findings'][number];
  messages: Poc3AgentThreadMessage[] | null;
}) {
  const visibleMessages =
    messages && messages.length > 0
      ? messages
      : [
          {
            localMessageId: `${finding.localThreadId}:initial`,
            localThreadId: finding.localThreadId,
            role: 'assistant' as const,
            source: 'initial-finding' as const,
            body: finding.body,
            createdAt: '',
          },
        ];

  return (
    <div className="mt-2 space-y-0 border-t border-fuchsia-400/15 pt-2">
      {visibleMessages.map((message) => (
        <ThreadMessageBubble key={message.localMessageId} message={message} />
      ))}
    </div>
  );
}
