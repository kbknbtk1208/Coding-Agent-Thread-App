'use client';

import { Streamdown } from 'streamdown';
import type {
  Poc3AgentThreadMessage,
  NodeDetailSnapshot,
} from '../../../../../shared/poc3-contracts/graph-review-ipc';

export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="text-[12px] leading-6 [&_code]:rounded-[4px] [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_li]:my-1 [&_ol]:my-1 [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[8px] [&_pre]:bg-black/35 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_ul]:my-1 [&_ul]:pl-5">
      <Streamdown>{children}</Streamdown>
    </div>
  );
}

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
