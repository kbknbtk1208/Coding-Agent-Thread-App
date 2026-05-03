'use client';

import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';

const LONG_BODY_CHAR_LIMIT = 2000;
const LONG_BODY_LINE_LIMIT = 40;
const PREVIEW_CHAR_LIMIT = 1200;
const PREVIEW_LINE_LIMIT = 20;

export interface MarkdownBodyProps {
  body?: string;
  children?: string;
  compactLongBody?: boolean;
  variant?: 'default' | 'compact';
}

export const MarkdownBody = memo(function MarkdownBody({
  body,
  children,
  compactLongBody = true,
  variant = 'default',
}: MarkdownBodyProps) {
  const rawBody = body ?? children ?? '';
  const [expanded, setExpanded] = useState(false);
  const deferredBody = useDeferredValue(rawBody);
  const bodyState = useMemo(() => createMarkdownBodyState(deferredBody), [deferredBody]);
  const shouldCollapse = compactLongBody && bodyState.longBody && !expanded;
  const renderedBody = shouldCollapse ? bodyState.preview : deferredBody;
  const densityClass =
    variant === 'compact'
      ? 'text-[11px] leading-5 [&_code]:rounded-[4px] [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px] [&_li]:my-0.5 [&_ol]:my-0.5 [&_ol]:pl-4 [&_p]:my-0.5 [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:bg-black/35 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_ul]:my-0.5 [&_ul]:pl-4'
      : 'text-[12px] leading-6 [&_code]:rounded-[4px] [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_li]:my-1 [&_ol]:my-1 [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[8px] [&_pre]:bg-black/35 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_ul]:my-1 [&_ul]:pl-5';

  return (
    <div className={densityClass}>
      <Streamdown>{renderedBody}</Streamdown>
      {shouldCollapse ? (
        <button
          type="button"
          className="mt-1 cursor-pointer rounded-[5px] border border-white/[0.08] px-2 py-1 text-[11px] font-semibold text-white/58 transition hover:bg-white/[0.06] hover:text-white/78"
          onClick={() => setExpanded(true)}
        >
          全文を表示
        </button>
      ) : null}
    </div>
  );
});

export function createMarkdownBodyState(body: string): {
  longBody: boolean;
  preview: string;
} {
  const lines = body.split(/\r?\n/);
  const longBody = body.length > LONG_BODY_CHAR_LIMIT || lines.length > LONG_BODY_LINE_LIMIT;

  if (!longBody) {
    return { longBody: false, preview: body };
  }

  const linePreview = lines.slice(0, PREVIEW_LINE_LIMIT).join('\n');
  const preview =
    linePreview.length > PREVIEW_CHAR_LIMIT
      ? `${linePreview.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}\n\n...`
      : `${linePreview.trimEnd()}\n\n...`;

  return { longBody: true, preview };
}
