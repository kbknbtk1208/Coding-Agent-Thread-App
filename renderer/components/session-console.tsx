import React, { useEffect, useState } from 'react';
import type {
  AgentEvent,
  AgentKind,
  AgentStatus,
  AppSession,
  ConversationTurn,
} from '../../shared/domain/agent';

const DEFAULT_CWD = 'C:\\Users\\nkubo\\Dev\\Coding-Agent-Thread-App';
const DEFAULT_PROMPT =
  'このリポジトリの目的、技術スタック、次に読むべきファイルを 5 項目以内で要約して';
const DEFAULT_FOLLOW_UP = '今の要約を前提に、このリポジトリで最初に実装すべきものを 3 つに絞って';

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

function sortSessions(sessions: AppSession[]) {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertSession(sessions: AppSession[], nextSession: AppSession) {
  return sortSessions([
    nextSession,
    ...sessions.filter((session) => session.appSessionId !== nextSession.appSessionId),
  ]);
}

function canSendPrompt(status: AgentStatus) {
  return status === 'idle' || status === 'completed' || status === 'failed';
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

function applyAgentEvent(session: AppSession, event: AgentEvent): AppSession {
  switch (event.type) {
    case 'session.capabilities':
      return {
        ...session,
        capabilities: [...event.capabilities],
        updatedAt: new Date().toISOString(),
      };
    case 'status.changed': {
      const completedAt = event.status === 'completed' ? new Date().toISOString() : undefined;
      return {
        ...session,
        status: event.status,
        streamBuffer:
          event.status === 'completed' || event.status === 'failed'
            ? { content: '', messageId: null }
            : session.streamBuffer,
        turns:
          completedAt && session.turns.length > 0
            ? patchLatestTurn(session.turns, (turn) => ({
                ...turn,
                completedAt,
                status: event.status,
              }))
            : session.turns,
        updatedAt: new Date().toISOString(),
      };
    }
    case 'message.delta':
      return {
        ...session,
        streamBuffer: {
          content: session.streamBuffer.content + event.text,
          messageId: event.messageId,
        },
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? {
                ...turn,
                response: turn.response + event.text,
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
            ? {
                ...turn,
                completedAt: new Date().toISOString(),
                status: 'completed',
              }
            : turn,
        ),
        updatedAt: new Date().toISOString(),
      };
    case 'result.richText':
      return {
        ...session,
        finalResult: {
          content: event.content,
          format: event.format,
          kind: 'richText',
        },
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          response: event.content,
          result: {
            content: event.content,
            format: event.format,
            kind: 'richText',
          },
        })),
        updatedAt: new Date().toISOString(),
      };
    case 'error':
      return {
        ...session,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      };
    case 'permission.requested':
    case 'session.started':
      return session;
    default:
      return session;
  }
}

export function SessionConsole() {
  const [agent, setAgent] = useState<AgentKind>('codex');
  const [cwd, setCwd] = useState(DEFAULT_CWD);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [followUpPrompt, setFollowUpPrompt] = useState(DEFAULT_FOLLOW_UP);
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadSessions = async () => {
      try {
        const nextSessions = await window.agentApi.listSessions();
        if (!isCancelled) {
          setSessions(sortSessions(nextSessions));
          setSelectedSessionId((current) => current ?? nextSessions[0]?.appSessionId ?? null);
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
      if (event.type === 'error') {
        setErrorMessage(event.error.message);
      }
      setSessions((currentSessions) =>
        sortSessions(
          currentSessions.map((session) =>
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
  const selectedCopilotModelSelection =
    selectedSession?.agent === 'copilot' ? selectedSession.modelSelection : undefined;

  const handleStartSession = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await window.agentApi.startSession({ agent, cwd, prompt });
      setSessions((currentSessions) => upsertSession(currentSessions, session));
      setSelectedSessionId(session.appSessionId);
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

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await window.agentApi.sendFollowUp({
        appSessionId: selectedSession.appSessionId,
        prompt: followUpPrompt,
      });
      setSessions((currentSessions) => upsertSession(currentSessions, session));
      setSelectedSessionId(session.appSessionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'follow-up の送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
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
              `awaiting_input` は持たず、ターン完了後も `completed` のまま follow-up
              を受け付けます。 `codex app-server` と `copilot --acp --stdio` の差分を main
              側で吸収し、UI には正規化イベントだけを流します。
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
                    `cwd` と provider を指定して実 session を開始します。
                  </p>
                </div>
                <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  S1 / S2
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

                <label className="block text-sm text-slate-200">
                  <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                    Prompt
                  </span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={5}
                    className="w-full rounded-[1.45rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-200/50"
                  />
                </label>

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
                <div>
                  <h3 className="text-lg font-semibold text-white">セッション一覧</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    provider session を保持したまま follow-up 送信が可能です。
                  </p>
                </div>
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

                {sessions.map((session) => (
                  <button
                    key={session.appSessionId}
                    type="button"
                    onClick={() => setSelectedSessionId(session.appSessionId)}
                    className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      selectedSessionId === session.appSessionId
                        ? 'border-cyan-200/40 bg-cyan-300/10'
                        : 'border-white/10 bg-slate-950/55 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-100/80">
                          {session.agent}
                        </p>
                        <p className="mt-2 text-sm text-white">{session.cwd}</p>
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
                ))}
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
                左のフォームからセッションを開始すると、status timeline
                と会話履歴がここに表示されます。
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {selectedCopilotModelSelection?.warning ? (
                  <div className="rounded-[1.4rem] border border-amber-200/30 bg-amber-300/10 px-4 py-4 text-sm leading-7 text-amber-50">
                    {selectedCopilotModelSelection.warning}
                  </div>
                ) : null}

                {selectedCopilotModelSelection?.requestedModel &&
                selectedCopilotModelSelection.isRequestedModelEnforced ? (
                  <div className="rounded-[1.4rem] border border-cyan-200/20 bg-cyan-300/10 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/75">
                      Copilot Model
                    </p>
                    <p className="mt-2 text-sm text-cyan-50">
                      Model: {selectedCopilotModelSelection.requestedModel} (fixed)
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-white">Status Timeline</h4>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[selectedSession.status]}`}
                      >
                        {STATUS_LABELS[selectedSession.status]}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {selectedSession.turns.map((turn, index) => (
                        <div
                          key={turn.turnId}
                          className="rounded-[1.4rem] border border-white/10 bg-slate-950/70 p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            Turn {index + 1}
                          </p>
                          <p className="mt-3 text-sm font-medium text-white">
                            {STATUS_LABELS[turn.status]}
                          </p>
                          <p className="mt-4 text-xs leading-6 text-slate-400">
                            開始: {new Date(turn.startedAt).toLocaleString('ja-JP')}
                          </p>
                          {turn.completedAt ? (
                            <p className="text-xs leading-6 text-slate-400">
                              完了: {new Date(turn.completedAt).toLocaleString('ja-JP')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                    <div className="mb-4">
                      <h4 className="text-lg font-semibold text-white">Follow-up</h4>
                      <p className="mt-1 text-sm text-slate-400">
                        同じ provider session を継続利用して follow-up を送れます。
                      </p>
                    </div>

                    <textarea
                      value={followUpPrompt}
                      onChange={(event) => setFollowUpPrompt(event.target.value)}
                      rows={6}
                      disabled={!canSendPrompt(selectedSession.status) || isSubmitting}
                      className="w-full rounded-[1.45rem] border border-white/10 bg-slate-950/75 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-200/50 disabled:cursor-not-allowed disabled:bg-slate-900/60 disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleSendFollowUp}
                      disabled={!canSendPrompt(selectedSession.status) || isSubmitting}
                      className="mt-4 w-full rounded-full border border-cyan-200/30 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/40 hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      follow-up を送信
                    </button>
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
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[turn.status]}`}
                          >
                            {STATUS_LABELS[turn.status]}
                          </span>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                            Agent Response
                          </p>
                          <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                            {turn.response || '応答を待っています...'}
                          </pre>
                        </div>
                      </article>
                    ))}
                  </div>

                  {selectedSession.streamBuffer.content ? (
                    <div className="mt-5 rounded-[1.5rem] border border-amber-200/20 bg-amber-300/10 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-amber-50/80">
                        Streaming Buffer
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-amber-50">
                        {selectedSession.streamBuffer.content}
                      </pre>
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
