import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  AgentEvent,
  AgentKind,
  AgentStatus,
  AppSession,
  ConversationIntermediateSegment,
  ConversationResponseMode,
  ConversationTurn,
  RichTextResultSource,
  ResultEnvelope,
  StructuredOutputMode,
  StructuredResultSource,
} from '../../shared/domain/agent';
import {
  applyMessageDeltaToTurn,
  applyProgressHintToTurn,
  cloneIntermediateSegments,
} from '../../shared/domain/intermediate-segments';
import { ChainOfThought } from './ui/chain-of-thought';
import { Reasoning } from './ui/reasoning';
import { ShimmerText } from './ui/shimmer-text';
import { TextEffect } from './ui/text-effect';

const DEFAULT_CWD = '';
const DEFAULT_RICH_TEXT_PROMPT =
  'このリポジトリの目的、技術スタック、次に読むべきファイルを 5 項目以内で要約して';
const DEFAULT_STRUCTURED_PROMPT =
  'このリポジトリで新機能実装に着手する前のチェックリストを JSON で返して。各項目は id, title, reason, priority を含めて。priority は high / medium / low のいずれかにして。';
const DEFAULT_STRUCTURED_FALLBACK_PROMPT = [
  'このリポジトリで新機能実装に着手する前のチェックリストを返して。',
  'これは fallback 表示の検証なので、通常の Markdown 箇条書きだけで答えて。',
].join('\n');
const DEFAULT_FOLLOW_UP = '今の要約を前提に、このリポジトリで最初に実装すべきものを 3 つに絞って';
const DEFAULT_STRUCTURED_FOLLOW_UP =
  '今の会話を前提に、次の実装フェーズへ進む前のチェックリストを JSON で返して。各項目は id, title, reason, priority を含めて。priority は high / medium / low のいずれかにして。';
const DEFAULT_STRUCTURED_FALLBACK_FOLLOW_UP = [
  '今の会話を前提に、次の実装フェーズへ進む前のチェックリストを返して。',
  'これは fallback 表示の検証なので、通常の Markdown 箇条書きだけで答えて。',
].join('\n');

const STATUS_LABELS: Record<AgentStatus, string> = {
  completed: 'Completed / 次入力待ち',
  failed: 'Failed',
  idle: 'Idle',
  running: 'Running',
  starting: 'Starting',
  waiting_permission: 'Waiting Permission',
};

const STATUS_STYLES: Record<AgentStatus, string> = {
  completed: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50',
  failed: 'border-rose-300/30 bg-rose-300/10 text-rose-50',
  idle: 'border-slate-200/15 bg-white/6 text-slate-100',
  running: 'border-amber-200/25 bg-amber-300/12 text-amber-50',
  starting: 'border-cyan-200/25 bg-cyan-300/12 text-cyan-50',
  waiting_permission: 'border-fuchsia-200/25 bg-fuchsia-300/12 text-fuchsia-50',
};

const MODE_LABELS: Record<ConversationResponseMode, string> = {
  implementationChecklist: 'Structured Checklist',
  richText: 'Rich Text',
};

const MODE_STYLES: Record<ConversationResponseMode, string> = {
  implementationChecklist: 'border-emerald-200/30 bg-emerald-300/12 text-emerald-50',
  richText: 'border-slate-200/20 bg-white/8 text-slate-100',
};

const RESULT_SOURCE_LABELS: Record<StructuredResultSource, string> = {
  codexOutputSchema: 'Codex Output Schema',
  promptedJson: 'Prompted JSON',
} as const;

const RICH_TEXT_SOURCE_LABELS: Record<RichTextResultSource, string> = {
  richText: 'Rich Text',
  structuredParseFallback: 'Structured Parse Fallback',
} as const;

const MODEL_SELECTION_STYLES = {
  fallback: 'border-amber-200/20 bg-amber-300/10 text-amber-50',
  pinned: 'border-emerald-200/20 bg-emerald-300/10 text-emerald-50',
} as const;

const PRIORITY_STYLES = {
  high: 'border-rose-200/30 bg-rose-300/12 text-rose-50',
  low: 'border-slate-200/20 bg-white/6 text-slate-200',
  medium: 'border-amber-200/30 bg-amber-300/12 text-amber-50',
} as const;

function sortSessions(sessions: AppSession[]) {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function patchLatestTurn(
  turns: ConversationTurn[],
  updater: (turn: ConversationTurn) => ConversationTurn,
) {
  if (turns.length === 0) {
    return turns;
  }

  const latestTurnIndex = turns.length - 1;
  return turns.map((turn, index) => (index === latestTurnIndex ? updater(turn) : turn));
}

function upsertSession(sessions: AppSession[], nextSession: AppSession) {
  return sortSessions([
    nextSession,
    ...sessions.filter((session) => session.appSessionId !== nextSession.appSessionId),
  ]);
}

function upsertActiveSessionIds(activeSessionIds: string[], appSessionId: string) {
  return activeSessionIds.includes(appSessionId)
    ? activeSessionIds
    : [...activeSessionIds, appSessionId];
}

function normalizeTurn(turn: ConversationTurn): ConversationTurn {
  return {
    ...turn,
    intermediateSegments: turn.intermediateSegments ?? [],
  };
}

function normalizeSession(session: AppSession): AppSession {
  return {
    ...session,
    turns: session.turns.map(normalizeTurn),
  };
}

function mergeTurnSnapshots(
  existingTurn: ConversationTurn | undefined,
  nextTurn: ConversationTurn,
) {
  if (!existingTurn) {
    return normalizeTurn(nextTurn);
  }

  return {
    ...existingTurn,
    ...nextTurn,
    intermediateSegments:
      nextTurn.intermediateSegments?.length > 0
        ? cloneIntermediateSegments(nextTurn.intermediateSegments)
        : cloneIntermediateSegments(existingTurn.intermediateSegments ?? []),
  };
}

function mergeSessionSnapshot(existingSession: AppSession | undefined, nextSession: AppSession) {
  if (!existingSession) {
    return normalizeSession(nextSession);
  }

  const turnsById = new Map<string, ConversationTurn>();
  existingSession.turns.forEach((turn) => {
    turnsById.set(turn.turnId, turn);
    turnsById.set(turn.messageId, turn);
  });
  return {
    ...existingSession,
    ...nextSession,
    turns: nextSession.turns.map((turn, index) =>
      mergeTurnSnapshots(
        turnsById.get(turn.turnId) ?? turnsById.get(turn.messageId) ?? existingSession.turns[index],
        turn,
      ),
    ),
  };
}

function isBusyStatus(status: AgentStatus) {
  return status === 'starting' || status === 'running' || status === 'waiting_permission';
}

function isSessionActive(activeSessionIds: string[], appSessionId: string) {
  return activeSessionIds.includes(appSessionId);
}

function canSendPrompt(status: AgentStatus, sessionIsActive: boolean) {
  return sessionIsActive && !isBusyStatus(status);
}

function isSessionResumable(session: AppSession, activeSessionIds: string[]) {
  return session.status === 'completed' && !activeSessionIds.includes(session.appSessionId);
}

function getLatestMode(session: AppSession) {
  return session.turns.at(-1)?.responseMode ?? 'richText';
}

function getLatestStructuredOutputMode(session: AppSession): StructuredOutputMode {
  return session.turns.at(-1)?.structuredOutputMode ?? 'normal';
}

function toResultEnvelope(
  event: Extract<AgentEvent, { type: 'result.richText' | 'result.structured' }>,
) {
  return event.type === 'result.richText'
    ? {
        content: event.content,
        format: event.format,
        kind: 'richText' as const,
        source: event.source,
        structuredParseError: event.structuredParseError,
        structuredSchemaName: event.structuredSchemaName,
      }
    : {
        data: event.data,
        fallbackRichText: event.fallbackRichText,
        kind: 'structured' as const,
        schemaName: event.schemaName,
        source: event.source,
      };
}

function getResultSourceLabel(source: StructuredResultSource) {
  return RESULT_SOURCE_LABELS[source];
}

function getRichTextResultSourceLabel(source: RichTextResultSource) {
  return RICH_TEXT_SOURCE_LABELS[source];
}

function applyAgentEvent(session: AppSession, event: AgentEvent): AppSession {
  switch (event.type) {
    case 'session.capabilities':
      return {
        ...session,
        capabilities: [...event.capabilities],
        updatedAt: new Date().toISOString(),
      };
    case 'status.changed': {
      const latestTurn = session.turns.at(-1);
      const shouldFinalizeLatestTurn =
        (event.status === 'completed' || event.status === 'failed') && latestTurn
          ? isBusyStatus(latestTurn.status)
          : false;

      return {
        ...session,
        status: event.status,
        progressHint:
          event.status === 'completed' || event.status === 'failed'
            ? undefined
            : session.progressHint,
        streamBuffer:
          event.status === 'completed' || event.status === 'failed'
            ? { content: '', messageId: null }
            : session.streamBuffer,
        turns: shouldFinalizeLatestTurn
          ? patchLatestTurn(session.turns, (turn) => ({
              ...turn,
              completedAt: new Date().toISOString(),
              progressHint: undefined,
              status: event.status,
            }))
          : session.turns,
        updatedAt: new Date().toISOString(),
      };
    }
    case 'progress.updated':
      return {
        ...session,
        progressHint: { ...event.progressHint },
        status: 'running',
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? {
                ...applyProgressHintToTurn(turn, event.progressHint, event.progressHint.updatedAt),
                status: 'running',
              }
            : turn,
        ),
        updatedAt: new Date().toISOString(),
      };
    case 'message.delta':
      return {
        ...session,
        progressHint: undefined,
        status: 'running',
        streamBuffer: {
          content: session.streamBuffer.content + event.text,
          messageId: event.messageId,
        },
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? {
                ...applyMessageDeltaToTurn(turn, session.agent, event.text, event.updatedAt),
                status: 'running',
              }
            : turn,
        ),
        updatedAt: new Date().toISOString(),
      };
    case 'message.completed':
      return {
        ...session,
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? { ...turn, completedAt: new Date().toISOString(), status: 'completed' }
            : turn,
        ),
        updatedAt: new Date().toISOString(),
      };
    case 'result.richText':
    case 'result.structured': {
      const result = toResultEnvelope(event);
      return {
        ...session,
        finalResult: result,
        progressHint: undefined,
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          progressHint: undefined,
          result,
        })),
        updatedAt: new Date().toISOString(),
      };
    }
    case 'permission.requested':
      return {
        ...session,
        progressHint: undefined,
        status: 'waiting_permission',
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          progressHint: undefined,
          status: 'waiting_permission',
        })),
        updatedAt: new Date().toISOString(),
      };
    case 'error':
      return {
        ...session,
        progressHint: undefined,
        status: 'failed',
        streamBuffer: { content: '', messageId: null },
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          completedAt: new Date().toISOString(),
          progressHint: undefined,
          status: 'failed',
        })),
        updatedAt: new Date().toISOString(),
      };
    case 'session.started':
    default:
      return session;
  }
}

function ModeSelect(props: {
  label: string;
  value: ConversationResponseMode;
  onChange: (value: ConversationResponseMode) => void;
}) {
  return (
    <label className="block text-sm text-slate-200">
      <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
        {props.label}
      </span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as ConversationResponseMode)}
        className="w-full rounded-[1.15rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
      >
        <option value="richText">Rich Text</option>
        <option value="implementationChecklist">Structured Checklist</option>
      </select>
    </label>
  );
}

function renderResult(result?: ResultEnvelope) {
  if (!result) {
    return (
      <div className="rounded-[1.3rem] border border-dashed border-white/10 px-4 py-8 text-sm leading-7 text-slate-400">
        まだ最終結果はありません。streaming 中は下に `Streaming Buffer` が出て、完了後にここへ
        canonical な結果が表示されます。
      </div>
    );
  }

  if (result.kind === 'richText') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200/20 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-100">
            Rich Text
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
            {getRichTextResultSourceLabel(result.source)}
          </span>
          {result.structuredSchemaName ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
              schema: {result.structuredSchemaName}
            </span>
          ) : null}
        </div>
        {result.source === 'structuredParseFallback' ? (
          <div className="rounded-[1.1rem] border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-50">
            <p className="font-semibold">
              Structured 変換に失敗したため rich text へ fallback しました。
            </p>
            <p className="mt-1 text-amber-50/80">
              schema: `{result.structuredSchemaName ?? 'implementation-checklist'}`
            </p>
            {result.structuredParseError ? (
              <p className="mt-1 text-amber-50/80">{result.structuredParseError}</p>
            ) : null}
          </div>
        ) : null}
        {result.source === 'structuredParseFallback' ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-[1.2rem] border border-white/10 bg-black/40 p-4 text-sm leading-7 text-slate-100">
            {result.content || 'structured fallback の raw text が空です。'}
          </pre>
        ) : (
          <MarkdownRenderer content={result.content} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-200/30 bg-emerald-300/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-50">
          Structured Checklist
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
          {getResultSourceLabel(result.source)}
        </span>
      </div>

      <div className="space-y-3">
        {result.data.items.map((item) => (
          <article
            key={item.id}
            className="rounded-[1.3rem] border border-white/10 bg-slate-950/75 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.id}</p>
                <h5 className="mt-2 text-sm font-semibold text-white">{item.title}</h5>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${PRIORITY_STYLES[item.priority]}`}
              >
                {item.priority}
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{item.reason}</p>
          </article>
        ))}
      </div>

      {result.fallbackRichText ? (
        <details className="rounded-[1.3rem] border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Raw JSON Text
          </summary>
          <div className="mt-3">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[1.2rem] border border-white/10 bg-black/40 p-4 text-sm leading-7 text-slate-100">
              {result.fallbackRichText}
            </pre>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function renderModelSelection(session: AppSession) {
  if (!session.modelSelection) {
    return null;
  }

  const statusLabel = session.modelSelection.warning ? 'Fallback Active' : 'Pinned';
  const statusStyle = session.modelSelection.warning
    ? MODEL_SELECTION_STYLES.fallback
    : MODEL_SELECTION_STYLES.pinned;

  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-lg font-semibold text-white">Model Selection</h4>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm leading-7 text-slate-300">
        <p>
          requested model:{' '}
          <span className="font-medium text-white">
            {session.modelSelection.requestedModel ?? 'provider default'}
          </span>
        </p>
        <p>
          enforcement:{' '}
          <span className="font-medium text-white">
            {session.modelSelection.isRequestedModelEnforced ? 'enforced' : 'fallback to default'}
          </span>
        </p>
      </div>
      {session.modelSelection.warning ? (
        <div className="mt-4 rounded-[1.1rem] border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-50">
          {session.modelSelection.warning}
        </div>
      ) : null}
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a
            {...props}
            className="text-cyan-200 underline decoration-cyan-300/40 decoration-2 underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-cyan-200/40 pl-4 text-slate-300">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => (
          <code
            className={`${className ?? ''} rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-50`}
          >
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-white">{children}</h3>
        ),
        li: ({ children }) => <li className="leading-7 text-slate-200">{children}</li>,
        ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6">{children}</ol>,
        p: ({ children }) => <p className="text-sm leading-7 text-slate-200">{children}</p>,
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-[1.2rem] border border-white/10 bg-black/40 p-4 text-sm leading-7 text-slate-100">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="list-disc space-y-2 pl-6">{children}</ul>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function renderStreamingRichText(text: string, className: string) {
  return (
    <TextEffect
      as="p"
      text={text}
      layout="flow"
      preserveWhitespace
      staggerWindow={32}
      segmentDelay={0.018}
      className={className}
    />
  );
}

function renderWaitingResponse(text = '応答を待っています...') {
  return (
    <p className="text-sm leading-7">
      <ShimmerText text={text} className="block font-medium" />
    </p>
  );
}

function renderIntermediateSegments(
  segments: ConversationIntermediateSegment[],
  options: { isLatestTurn: boolean; turn: ConversationTurn },
) {
  const isActiveTurn =
    options.isLatestTurn &&
    !options.turn.result &&
    (options.turn.status === 'starting' || options.turn.status === 'running');

  const latestSegment = segments.at(-1);
  const messageSegments = segments.filter((s) => s.kind === 'message');

  // Determine the hint/running text to show below ChainOfThought
  const hintText: string | null = isActiveTurn
    ? latestSegment !== undefined && latestSegment.kind === 'progress'
      ? latestSegment.text
      : 'running'
    : null;

  // The segmentId of the currently streaming message segment (if any)
  const activeMessageSegmentId: string | null =
    isActiveTurn && latestSegment !== undefined && latestSegment.kind === 'message'
      ? latestSegment.segmentId
      : null;

  return (
    <div className="space-y-3">
      {messageSegments.length > 0 ? (
        <ChainOfThought>
          {messageSegments.map((segment) => {
            const isActiveSegment = segment.segmentId === activeMessageSegmentId;
            return (
              <Reasoning key={segment.segmentId} isActive={isActiveSegment}>
                {isActiveSegment ? (
                  renderStreamingRichText(segment.text, 'whitespace-pre-wrap text-sm leading-7')
                ) : (
                  <span className="whitespace-pre-wrap">{segment.text}</span>
                )}
              </Reasoning>
            );
          })}
        </ChainOfThought>
      ) : null}
      {hintText !== null ? renderWaitingResponse(hintText) : null}
    </div>
  );
}

export function SessionConsole() {
  const [agent, setAgent] = useState<AgentKind>('codex');
  const [cwd, setCwd] = useState(DEFAULT_CWD);
  const [prompt, setPrompt] = useState(DEFAULT_RICH_TEXT_PROMPT);
  const [startMode, setStartMode] = useState<ConversationResponseMode>('richText');
  const [startStructuredOutputMode, setStartStructuredOutputMode] =
    useState<StructuredOutputMode>('normal');
  const [followUpPrompt, setFollowUpPrompt] = useState(DEFAULT_FOLLOW_UP);
  const [followUpMode, setFollowUpMode] = useState<ConversationResponseMode>('richText');
  const [followUpStructuredOutputMode, setFollowUpStructuredOutputMode] =
    useState<StructuredOutputMode>('normal');
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    void window.agentApi
      .getDefaultCwd()
      .then((defaultCwd) => {
        if (!isCancelled) {
          setCwd((current) => current || defaultCwd);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : '初期 cwd の取得に失敗しました。',
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadSessions = async () => {
      try {
        const nextSessions = sortSessions(
          (await window.agentApi.listSessions()).map(normalizeSession),
        );
        if (!isCancelled) {
          setSessions(nextSessions);
          setActiveSessionIds(
            nextSessions
              .filter((session) => isBusyStatus(session.status))
              .map((session) => session.appSessionId),
          );
          setSelectedSessionId(nextSessions[0]?.appSessionId ?? null);
          if (nextSessions[0]) {
            setFollowUpMode(getLatestMode(nextSessions[0]));
            setFollowUpStructuredOutputMode(getLatestStructuredOutputMode(nextSessions[0]));
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'セッション一覧の取得に失敗しました。',
          );
        }
      }
    };

    void loadSessions();

    const unsubscribe = window.agentApi.onAgentEvent((event) => {
      if (event.type === 'session.started') {
        setActiveSessionIds((current) => upsertActiveSessionIds(current, event.appSessionId));
      }
      if (event.type === 'error') {
        setErrorMessage(event.error.message);
      }
      setSessions((current) =>
        sortSessions(
          current.map((session) =>
            session.appSessionId === event.appSessionId ? applyAgentEvent(session, event) : session,
          ),
        ),
      );
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  const selectedSession =
    sessions.find((session) => session.appSessionId === selectedSessionId) ?? null;
  const selectedSessionIsActive = selectedSession
    ? isSessionActive(activeSessionIds, selectedSession.appSessionId)
    : false;

  const handleStartSession = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await window.agentApi.startSession({
        agent,
        cwd,
        prompt,
        responseMode: startMode,
        structuredOutputMode:
          startMode === 'implementationChecklist' ? startStructuredOutputMode : undefined,
      });
      setSessions((current) => {
        const mergedSession = mergeSessionSnapshot(
          current.find((item) => item.appSessionId === session.appSessionId),
          session,
        );
        return upsertSession(current, mergedSession);
      });
      setSelectedSessionId(session.appSessionId);
      setActiveSessionIds((current) => upsertActiveSessionIds(current, session.appSessionId));
      setFollowUpMode(getLatestMode(session));
      setFollowUpStructuredOutputMode(getLatestStructuredOutputMode(session));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '新規セッションの開始に失敗しました。',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendFollowUp = async () => {
    if (!selectedSession) {
      return;
    }
    if (!selectedSessionIsActive) {
      setErrorMessage('follow-up を送信するには、先にセッションを再開してください。');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await window.agentApi.sendFollowUp({
        appSessionId: selectedSession.appSessionId,
        prompt: followUpPrompt,
        responseMode: followUpMode,
        structuredOutputMode:
          followUpMode === 'implementationChecklist' ? followUpStructuredOutputMode : undefined,
      });
      setSessions((current) => {
        const mergedSession = mergeSessionSnapshot(
          current.find((item) => item.appSessionId === session.appSessionId),
          session,
        );
        return upsertSession(current, mergedSession);
      });
      setSelectedSessionId(session.appSessionId);
      setFollowUpStructuredOutputMode(getLatestStructuredOutputMode(session));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'follow-up の送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueConversation = async (sessionToResume: AppSession) => {
    setErrorMessage(null);
    setResumingSessionId(sessionToResume.appSessionId);

    try {
      const session = await window.agentApi.continueConversation({
        appSessionId: sessionToResume.appSessionId,
      });
      setSessions((current) => {
        const mergedSession = mergeSessionSnapshot(
          current.find((item) => item.appSessionId === session.appSessionId),
          session,
        );
        return upsertSession(current, mergedSession);
      });
      setSelectedSessionId(session.appSessionId);
      setActiveSessionIds((current) => upsertActiveSessionIds(current, session.appSessionId));
      setFollowUpMode(getLatestMode(session));
      setFollowUpStructuredOutputMode(getLatestStructuredOutputMode(session));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'セッションの再開に失敗しました。');
    } finally {
      setResumingSessionId(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="glass-panel rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-cyan-100/70">
              Session Console
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              実 provider を正規化して扱う Session Gateway
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">
              `streamBuffer` は進行中断片、`finalResult` は完了後の canonical data
              として保持します。`result.richText` と `result.structured` を同じ UI で描き分けます。
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">
            状態モデル: `idle / starting / running / waiting_permission / completed / failed`
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">新規セッション</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    `cwd`、provider、結果モードを指定して session を開始します。
                  </p>
                </div>
                <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  S1 / S2 / S3
                </span>
              </div>

              <div className="space-y-4">
                <label className="block text-sm text-slate-200">
                  <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                    Agent
                  </span>
                  <select
                    value={agent}
                    onChange={(event) => setAgent(event.target.value as AgentKind)}
                    className="w-full rounded-[1.15rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
                  >
                    <option value="codex">Codex</option>
                    <option value="copilot">GitHub Copilot</option>
                  </select>
                </label>

                <label className="block text-sm text-slate-200">
                  <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                    Workspace CWD
                  </span>
                  <input
                    value={cwd}
                    onChange={(event) => setCwd(event.target.value)}
                    className="w-full rounded-[1.15rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
                  />
                </label>

                <ModeSelect
                  label="Response Mode"
                  value={startMode}
                  onChange={(value) => {
                    setStartMode(value);
                    setStartStructuredOutputMode('normal');
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStartMode('richText');
                      setStartStructuredOutputMode('normal');
                      setPrompt(DEFAULT_RICH_TEXT_PROMPT);
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    S1 サンプル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartMode('implementationChecklist');
                      setStartStructuredOutputMode('normal');
                      setPrompt(DEFAULT_STRUCTURED_PROMPT);
                    }}
                    className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-50 transition hover:bg-emerald-300/16"
                  >
                    S3 サンプル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartMode('implementationChecklist');
                      setStartStructuredOutputMode('forceFallback');
                      setPrompt(DEFAULT_STRUCTURED_FALLBACK_PROMPT);
                    }}
                    className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-50 transition hover:bg-amber-300/16"
                  >
                    S3 fallback 検証
                  </button>
                </div>

                {startMode === 'implementationChecklist' &&
                startStructuredOutputMode === 'forceFallback' ? (
                  <div className="rounded-[1.2rem] border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-50">
                    structured fallback 検証モードが有効です。provider には JSON ではなく Markdown
                    箇条書きを返す検証指示を送ります。
                  </div>
                ) : null}

                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  className="w-full rounded-[1.45rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-200/50"
                />

                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={isSubmitting}
                  className="w-full rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  新規セッション開始
                </button>
              </div>
            </div>

            <div className="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">セッション一覧</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  {sessions.length} sessions
                </span>
              </div>

              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="rounded-[1.3rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                    まだセッションはありません。
                  </div>
                ) : null}

                {sessions.map((session) => {
                  const isResuming = resumingSessionId === session.appSessionId;
                  const resumable = isSessionResumable(session, activeSessionIds);

                  return (
                    <div
                      key={session.appSessionId}
                      className={`w-full rounded-[1.5rem] border px-4 py-4 transition ${
                        selectedSessionId === session.appSessionId
                          ? 'border-cyan-200/40 bg-cyan-300/10'
                          : 'border-white/10 bg-slate-950/55 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSessionId(session.appSessionId);
                          setFollowUpMode(getLatestMode(session));
                          setFollowUpStructuredOutputMode(getLatestStructuredOutputMode(session));
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-100/80">
                              {session.agent}
                            </p>
                            <p className="text-sm text-white">{session.cwd}</p>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium ${MODE_STYLES[getLatestMode(session)]}`}
                            >
                              {MODE_LABELS[getLatestMode(session)]}
                            </span>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-medium ${STATUS_STYLES[session.status]}`}
                          >
                            {STATUS_LABELS[session.status]}
                          </span>
                        </div>
                        <p className="mt-4 text-xs text-slate-500">
                          最終更新: {new Date(session.updatedAt).toLocaleString('ja-JP')}
                        </p>
                      </button>
                      {resumable ? (
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              void handleContinueConversation(session);
                            }}
                            disabled={resumingSessionId !== null || isSubmitting}
                            className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-50 transition hover:border-cyan-100/40 hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                          >
                            {isResuming ? '再開中...' : 'セッションを再開'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Session Detail
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {selectedSession ? selectedSession.cwd : 'セッションを選択してください'}
                </h3>
              </div>
              {selectedSession ? (
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  {selectedSession.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-[1.2rem] border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
                {errorMessage}
              </div>
            ) : null}

            {!selectedSession ? (
              <div className="mt-6 rounded-[1.7rem] border border-dashed border-white/10 px-6 py-12 text-center text-sm leading-7 text-slate-400">
                左のフォームからセッションを開始すると、最終結果と会話履歴がここに表示されます。
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-white">Status Timeline</h4>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[selectedSession.status]}`}
                      >
                        {STATUS_LABELS[selectedSession.status]}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedSession.turns.map((turn, index) => (
                        <div
                          key={turn.turnId}
                          className="rounded-[1.4rem] border border-white/10 bg-slate-950/70 p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            Turn {index + 1}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-[11px] font-medium ${MODE_STYLES[turn.responseMode]}`}
                            >
                              {MODE_LABELS[turn.responseMode]}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-[11px] font-medium ${STATUS_STYLES[turn.status]}`}
                            >
                              {STATUS_LABELS[turn.status]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {renderModelSelection(selectedSession)}

                    <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                      <h4 className="text-lg font-semibold text-white">Final Result</h4>
                      <div className="mt-4">{renderResult(selectedSession.finalResult)}</div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                      <h4 className="text-lg font-semibold text-white">Follow-up</h4>
                      <ModeSelect
                        label="Follow-up Mode"
                        value={followUpMode}
                        onChange={(value) => {
                          setFollowUpMode(value);
                          setFollowUpStructuredOutputMode('normal');
                        }}
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFollowUpMode('richText');
                            setFollowUpStructuredOutputMode('normal');
                            setFollowUpPrompt(DEFAULT_FOLLOW_UP);
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          S2 サンプル
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFollowUpMode('implementationChecklist');
                            setFollowUpStructuredOutputMode('normal');
                            setFollowUpPrompt(DEFAULT_STRUCTURED_FOLLOW_UP);
                          }}
                          className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-50 transition hover:bg-emerald-300/16"
                        >
                          S3 サンプル
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFollowUpMode('implementationChecklist');
                            setFollowUpStructuredOutputMode('forceFallback');
                            setFollowUpPrompt(DEFAULT_STRUCTURED_FALLBACK_FOLLOW_UP);
                          }}
                          className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-50 transition hover:bg-amber-300/16"
                        >
                          S3 fallback 検証
                        </button>
                      </div>
                      {followUpMode === 'implementationChecklist' &&
                      followUpStructuredOutputMode === 'forceFallback' ? (
                        <div className="mt-4 rounded-[1.2rem] border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-50">
                          structured fallback 検証モードが有効です。follow-up でも JSON ではなく
                          Markdown 箇条書きを返す検証指示を送ります。
                        </div>
                      ) : null}
                      {!selectedSessionIsActive ? (
                        <div className="mt-4 rounded-[1.2rem] border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-sm leading-7 text-cyan-50">
                          follow-up
                          を送信するには、左のセッション一覧から「セッションを再開」を押してください。
                        </div>
                      ) : null}
                      <textarea
                        value={followUpPrompt}
                        onChange={(event) => setFollowUpPrompt(event.target.value)}
                        rows={6}
                        disabled={
                          !canSendPrompt(selectedSession.status, selectedSessionIsActive) ||
                          isSubmitting
                        }
                        className="mt-4 w-full rounded-[1.45rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-200/50 disabled:cursor-not-allowed disabled:bg-slate-900/60 disabled:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={handleSendFollowUp}
                        disabled={
                          !canSendPrompt(selectedSession.status, selectedSessionIsActive) ||
                          isSubmitting
                        }
                        className="mt-4 w-full rounded-full border border-cyan-200/30 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/40 hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                      >
                        follow-up を送信
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                  <h4 className="text-lg font-semibold text-white">Conversation</h4>
                  <div className="mt-4 space-y-5">
                    {selectedSession.turns.map((turn, index) => (
                      <article
                        key={turn.turnId}
                        className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5"
                      >
                        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/70">
                              User Prompt {index + 1}
                            </p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                              {turn.prompt}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${MODE_STYLES[turn.responseMode]}`}
                            >
                              {MODE_LABELS[turn.responseMode]}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[turn.status]}`}
                            >
                              {STATUS_LABELS[turn.status]}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                            Agent Response
                          </p>
                          <div className="mt-3">
                            {(() => {
                              const isLatestTurn = index === selectedSession.turns.length - 1;
                              const intermediateSegments = turn.intermediateSegments ?? [];
                              const isActiveTurn =
                                isLatestTurn &&
                                !turn.result &&
                                (turn.status === 'starting' || turn.status === 'running');
                              const hasVisibleIntermediateContent =
                                intermediateSegments.some(
                                  (segment) => segment.kind === 'message',
                                ) || isActiveTurn;
                              const waitingText = isActiveTurn
                                ? (turn.progressHint?.text ??
                                  selectedSession.progressHint?.text ??
                                  'running')
                                : undefined;

                              if (hasVisibleIntermediateContent || turn.result) {
                                return (
                                  <div className="space-y-5">
                                    {hasVisibleIntermediateContent
                                      ? renderIntermediateSegments(intermediateSegments, {
                                          isLatestTurn,
                                          turn,
                                        })
                                      : null}
                                    {turn.result ? (
                                      hasVisibleIntermediateContent ? (
                                        <div className="space-y-4 border-t border-white/10 pt-4">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                                            Final Output
                                          </p>
                                          {renderResult(turn.result)}
                                        </div>
                                      ) : (
                                        renderResult(turn.result)
                                      )
                                    ) : null}
                                  </div>
                                );
                              }

                              return turn.responseMode === 'richText' && turn.response ? (
                                renderStreamingRichText(
                                  turn.response,
                                  'text-sm leading-7 text-slate-200',
                                )
                              ) : !turn.response ? (
                                renderWaitingResponse(waitingText)
                              ) : (
                                <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-200">
                                  {turn.response}
                                </pre>
                              );
                            })()}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  {selectedSession.streamBuffer.content ? (
                    <div className="mt-5 rounded-[1.5rem] border border-amber-200/20 bg-amber-300/10 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-amber-50/80">
                        Streaming Buffer
                      </p>
                      <div className="mt-3">
                        {getLatestMode(selectedSession) === 'richText' ? (
                          renderStreamingRichText(
                            selectedSession.streamBuffer.content,
                            'text-sm leading-7 text-amber-50',
                          )
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm leading-7 text-amber-50">
                            {selectedSession.streamBuffer.content}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
