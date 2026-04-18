import React from 'react';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { reviewTheme } from './review-ui';

export interface DraftThreadComposerProps {
  replyBody: string;
  thread: ReviewLocalThread;
  onReplyBodyChange: (localThreadId: string, body: string) => void;
  onSubmitReply: (localThreadId: string, body: string) => void;
}

export function DraftThreadComposer({
  replyBody,
  thread,
  onReplyBodyChange,
  onSubmitReply,
}: DraftThreadComposerProps) {
  const [localReplyBody, setLocalReplyBody] = React.useState(replyBody);
  const isComposingRef = React.useRef(false);

  React.useEffect(() => {
    if (isComposingRef.current) {
      return;
    }

    setLocalReplyBody((current) => (current === replyBody ? current : replyBody));
  }, [replyBody]);

  const syncReplyBody = React.useCallback(
    (body: string) => {
      onReplyBodyChange(thread.localThreadId, body);
    },
    [onReplyBodyChange, thread.localThreadId],
  );

  return (
    <div className="border-t border-white/10 pt-4">
      <label
        htmlFor={`reply-${thread.localThreadId}`}
        className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8b949e]"
      >
        Reply in thread
      </label>
      <textarea
        id={`reply-${thread.localThreadId}`}
        value={localReplyBody}
        onChange={(event) => {
          const nextBody = event.target.value;
          setLocalReplyBody(nextBody);

          if (!isComposingRef.current) {
            syncReplyBody(nextBody);
          }
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
          const nextBody = event.currentTarget.value;
          setLocalReplyBody(nextBody);
          syncReplyBody(nextBody);
        }}
        onBlur={(event) => {
          if (isComposingRef.current) {
            return;
          }

          syncReplyBody(event.currentTarget.value);
        }}
        placeholder="この finding に対する補足質問や確認事項を入力します。"
        disabled={thread.replyStatus === 'replying'}
        className={`mt-3 h-28 w-full ${reviewTheme.textarea}`}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[#8b949e]">
          他 thread の文脈は送らず、この finding の履歴だけで会話を継続します。
        </p>
        <button
          type="button"
          onClick={() => {
            if (!localReplyBody.trim()) {
              return;
            }

            syncReplyBody(localReplyBody);
            onSubmitReply(thread.localThreadId, localReplyBody);
          }}
          disabled={thread.replyStatus === 'replying' || localReplyBody.trim().length === 0}
          className="rounded-full border border-[#479FFA]/20 bg-[#479FFA]/10 px-4 py-2 text-xs font-semibold text-[#dcecff] transition hover:bg-[#479FFA]/15 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#8b949e]"
        >
          {thread.replyStatus === 'replying' ? 'Replying…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
