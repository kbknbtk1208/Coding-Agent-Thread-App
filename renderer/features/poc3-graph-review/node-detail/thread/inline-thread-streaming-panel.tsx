'use client';

import { Loader2 } from 'lucide-react';
import {
  SessionIntermediateSegments,
  renderStreamingRichText,
  renderWaitingResponse,
} from '../../../../components/session-event-panel';
import { isBusyAgentStatus } from '../../../../components/session-event-state';
import type { AppSession, ConversationTurn } from '../../../../../shared/domain/agent';
import { useAgentThreadConversationContext } from '../../agent-review/agent-thread-conversation-context';
import { MarkdownBody } from './finding-messages-list';

function getFinalRichText(session: AppSession | null, latestTurn: ConversationTurn | null) {
  if (latestTurn?.result?.kind === 'richText') {
    return latestTurn.result.content.trim();
  }
  if (session?.finalResult?.kind === 'richText') {
    return session.finalResult.content.trim();
  }
  return '';
}

export function InlineThreadStreamingPanel({
  conversation,
}: {
  conversation:
    | ReturnType<typeof useAgentThreadConversationContext>['conversations'][string]
    | null;
}) {
  const session = conversation?.activeReplySession ?? null;
  const latestTurn = session?.turns.at(-1) ?? null;
  const finalMarkdown = getFinalRichText(session, latestTurn);
  const isActiveTurn = latestTurn
    ? !latestTurn.result && isBusyAgentStatus(latestTurn.status)
    : false;
  const hasVisibleIntermediateContent =
    latestTurn !== null &&
    (latestTurn.intermediateSegments.some((segment) => segment.kind === 'message') || isActiveTurn);
  const waitingText = latestTurn
    ? isActiveTurn
      ? (latestTurn.progressHint?.text ?? session?.progressHint?.text ?? 'Replying...')
      : undefined
    : (session?.progressHint?.text ?? 'Replying...');

  return (
    <div className="mt-3 rounded-[8px] border border-[#d8e071]/20 bg-[#d8e071]/8 px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f6ffc0]">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Agent Replying
      </div>
      {finalMarkdown ? (
        <MarkdownBody>{finalMarkdown}</MarkdownBody>
      ) : latestTurn && hasVisibleIntermediateContent ? (
        <SessionIntermediateSegments
          segments={latestTurn.intermediateSegments}
          isLatestTurn
          turn={latestTurn}
          className="space-y-2"
          chainClassName="rounded-[8px] border-white/[0.08] bg-white/[0.03]"
          chainContentClassName="space-y-1 px-3 pb-2.5"
          reasoningClassName="gap-2 py-1"
          reasoningContentClassName="text-[12px] leading-6"
          activeSegmentClassName="text-[12px] leading-6 text-[#d0d5db]"
          inactiveSegmentClassName="text-[#8b949e]"
          waitingClassName="text-[12px] leading-6 text-[#d0d5db]"
          waitingShimmerClassName="block font-medium"
        />
      ) : latestTurn?.response ? (
        renderStreamingRichText(
          latestTurn.response,
          'whitespace-pre-wrap text-[12px] leading-6 text-[#d0d5db]',
        )
      ) : waitingText ? (
        renderWaitingResponse(waitingText, 'text-[12px] leading-6 text-[#d0d5db]')
      ) : null}
    </div>
  );
}
