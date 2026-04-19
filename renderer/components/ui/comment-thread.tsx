'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CornerDownRight,
  MoreHorizontal,
  MessageSquareMore,
  SendHorizontal,
  ThumbsUp,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type CommentNode = {
  id: string;
  author: string;
  role: string;
  avatar: string;
  time: string;
  content: string;
  likes: number;
  liked: boolean;
  replies?: CommentNode[];
};

const initialComments: CommentNode[] = [
  {
    id: 'c-1',
    author: 'Aiko Nakamura',
    role: 'Reviewer',
    avatar: 'AN',
    time: '2m',
    content: 'Thread summary の先頭に決定事項を固定すると、追跡がかなり楽になります。',
    likes: 8,
    liked: true,
    replies: [
      {
        id: 'c-1-1',
        author: 'Codex',
        role: 'Agent',
        avatar: 'CX',
        time: 'now',
        content: '差分の要点、保留、次アクションを分離して並べる形に寄せます。',
        likes: 2,
        liked: false,
      },
    ],
  },
  {
    id: 'c-2',
    author: 'Kenji Sato',
    role: 'Owner',
    avatar: 'KS',
    time: '7m',
    content: '意味色は action と risk だけに絞ったほうが、レビュー画面の密度に合います。',
    likes: 5,
    liked: false,
  },
];

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.12] bg-[linear-gradient(176.83deg,#1d1d1d_24.95%,#0d0d0d_50.08%,#050505_88.5%)] text-[11px] font-semibold text-white">
      {initials}
    </div>
  );
}

function CommentInput({
  placeholder = '返信を入力',
  onSubmit,
}: {
  placeholder?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <form
      className="space-y-3 rounded-lg border border-white/[0.12] bg-white/[0.05] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue('');
      }}
    >
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-[88px] w-full resize-none rounded-lg border border-white/[0.08] bg-black/[0.28] px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-[#868F97] focus:border-white/[0.18]"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#FFA16C] px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110"
        >
          投稿
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function CommentCard({
  comment,
  depth = 0,
  onReply,
}: {
  comment: CommentNode;
  depth?: number;
  onReply: (parentId: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [replying, setReplying] = useState(false);
  const [likes, setLikes] = useState(comment.likes);
  const [liked, setLiked] = useState(comment.liked);

  return (
    <motion.article
      layout
      className={cn(
        'rounded-lg border border-white/[0.12] bg-[linear-gradient(176.83deg,#171717_24.95%,#0d0d0d_50.08%,#050505_88.5%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        depth > 0 && 'ml-6 border-l-[#FFA16C]/40',
      )}
    >
      <div className="flex gap-3">
        <Avatar initials={comment.avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">{comment.author}</p>
                <span className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#868F97]">
                  {comment.role}
                </span>
                <span className="text-xs text-[#868F97]">{comment.time}</span>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] p-2 text-[#868F97] transition hover:bg-white/[0.08] hover:text-white"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-7 text-[#d7d7d7]">{comment.content}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLiked((current) => {
                  setLikes((likesCurrent) => likesCurrent + (current ? -1 : 1));
                  return !current;
                });
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                liked
                  ? 'border-[#4EBE96]/30 bg-[#4EBE96]/15 text-[#4EBE96]'
                  : 'border-white/[0.08] bg-white/[0.05] text-[#868F97] hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {likes}
            </button>
            <button
              type="button"
              onClick={() => setReplying((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-[#868F97] transition hover:bg-white/[0.08] hover:text-white"
            >
              <MessageSquareMore className="h-3.5 w-3.5" />
              Reply
            </button>
            {comment.replies?.length ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-[#FFA16C] transition hover:bg-white/[0.08]"
              >
                <CornerDownRight
                  className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-90')}
                />
                {expanded ? 'Hide replies' : `Show ${comment.replies.length}`}
              </button>
            ) : null}
          </div>

          <AnimatePresence>
            {replying ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden pt-4"
              >
                <CommentInput
                  placeholder={`Reply to ${comment.author}`}
                  onSubmit={(value) => {
                    onReply(comment.id, value);
                    setReplying(false);
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && comment.replies?.length ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-4 space-y-4"
          >
            {comment.replies.map((reply) => (
              <CommentCard key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function addReply(tree: CommentNode[], parentId: string, reply: CommentNode): CommentNode[] {
  return tree.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replies: [...(comment.replies ?? []), reply],
      };
    }

    if (comment.replies?.length) {
      return {
        ...comment,
        replies: addReply(comment.replies, parentId, reply),
      };
    }

    return comment;
  });
}

export function CommentThread() {
  const [comments, setComments] = useState<CommentNode[]>(initialComments);

  const totals = useMemo(() => {
    const walk = (nodes: CommentNode[]): number =>
      nodes.reduce((sum, node) => sum + 1 + (node.replies ? walk(node.replies) : 0), 0);
    return walk(comments);
  }, [comments]);

  const handleAddReply = (parentId: string, value: string) => {
    const reply: CommentNode = {
      id: `${Date.now()}`,
      author: 'You',
      role: 'Guest',
      avatar: 'YO',
      time: 'now',
      content: value,
      likes: 0,
      liked: false,
    };

    setComments((current) => addReply(current, parentId, reply));
  };

  const handleAddComment = (value: string) => {
    const comment: CommentNode = {
      id: `${Date.now()}`,
      author: 'You',
      role: 'Guest',
      avatar: 'YO',
      time: 'now',
      content: value,
      likes: 0,
      liked: false,
    };

    setComments((current) => [comment, ...current]);
  };

  return (
    <section className="rounded-lg border border-white/[0.12] bg-[linear-gradient(176.83deg,#141414_24.95%,#0b0b0b_50.08%,#030303_88.5%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#FFA16C]">comment thread</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Review Notes</h3>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#868F97]">total</p>
          <p className="mt-1 text-xl font-semibold text-white">{totals}</p>
        </div>
      </div>

      <div className="mt-5">
        <CommentInput onSubmit={handleAddComment} placeholder="新しい指摘や要約を投稿" />
      </div>

      <div className="mt-5 space-y-4">
        <AnimatePresence initial={false}>
          {comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} onReply={handleAddReply} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default CommentThread;
