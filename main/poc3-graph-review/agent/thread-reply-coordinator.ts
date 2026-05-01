import { randomUUID } from 'crypto';
import type { AgentSessionSnapshot } from '../../../shared/contracts/agent-ipc';
import type {
  Poc3AgentReviewRun,
  Poc3AgentThreadBinding,
  Poc3AgentThreadConversation,
  Poc3AgentThreadMessage,
  Poc3AgentThreadReplyRecord,
} from '../../../shared/poc3-domain/agent-review';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { AgentGateway } from '../../agent-gateway/agent-gateway';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { Poc3AgentReviewStore } from './store';
import { Poc3AgentReviewThreadContextAssembler } from './thread-context-assembler';

export type Poc3ThreadReplyErrorCode =
  | 'EMPTY_BODY'
  | 'REPLY_IN_FLIGHT'
  | 'THREAD_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'FALLBACK_NOT_REPLYABLE'
  | 'REPLY_NOT_FOUND'
  | 'AGENT_FAILED';

export class Poc3ThreadReplyError extends Error {
  constructor(
    readonly code: Poc3ThreadReplyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'Poc3ThreadReplyError';
  }
}

interface Poc3AgentReviewThreadReplyCoordinatorDependencies {
  agentGateway: Pick<
    AgentGateway,
    'startSession' | 'continueConversation' | 'forkSession' | 'sendFollowUp' | 'awaitSettled'
  >;
  store: Poc3AgentReviewStore;
  contextAssembler?: Poc3AgentReviewThreadContextAssembler;
  now?: () => string;
}

export interface BeginPoc3ThreadReplyInput {
  reviewWorkspaceId: string;
  revisionId: string;
  localThreadId: string;
  body: string;
  cwd: string;
  record: WorkspaceGraphRecord;
  sourceSnapshot: ReviewSourceSnapshot | null;
}

export interface BegunPoc3ThreadReply {
  reply: Poc3AgentThreadReplyRecord;
  binding: Poc3AgentThreadBinding;
  session: AgentSessionSnapshot;
  userMessage: Poc3AgentThreadMessage;
  conversation: Poc3AgentThreadConversation;
}

export class Poc3AgentReviewThreadReplyCoordinator {
  private readonly contextAssembler: Poc3AgentReviewThreadContextAssembler;
  private readonly now: () => string;
  private readonly inFlightByThread = new Map<string, string>();
  private readonly overlayByThread = new Map<
    string,
    Pick<Poc3AgentThreadConversation, 'replyStatus' | 'lastError' | 'activeReplySessionId'>
  >();

  constructor(private readonly dependencies: Poc3AgentReviewThreadReplyCoordinatorDependencies) {
    this.contextAssembler =
      dependencies.contextAssembler ?? new Poc3AgentReviewThreadContextAssembler();
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async begin(input: BeginPoc3ThreadReplyInput): Promise<BegunPoc3ThreadReply> {
    const body = input.body.trim();
    if (!body) {
      throw new Poc3ThreadReplyError('EMPTY_BODY', '返信本文が空です。');
    }
    if (this.inFlightByThread.has(input.localThreadId)) {
      throw new Poc3ThreadReplyError('REPLY_IN_FLIGHT', 'この finding thread は返信中です。');
    }

    const thread = this.dependencies.store.getThreadDraft(input.localThreadId);
    if (!thread) {
      throw new Poc3ThreadReplyError('THREAD_NOT_FOUND', 'Finding thread が見つかりません。');
    }
    const run = this.dependencies.store.getRun(thread.runId);
    if (!run) {
      throw new Poc3ThreadReplyError('RUN_NOT_FOUND', 'Agent Review run が見つかりません。');
    }
    if (run.resultSource === 'richText') {
      throw new Poc3ThreadReplyError(
        'FALLBACK_NOT_REPLYABLE',
        'fallback richText run の finding には返信できません。',
      );
    }

    const existingBinding = this.dependencies.store.getThreadBinding(input.localThreadId);
    const history = this.dependencies.store.buildConversation(input.localThreadId)?.messages ?? [];
    const prompts = this.contextAssembler.build({
      run,
      thread,
      history,
      userReply: body,
      workspaceTitle: input.record.workspace.title,
      record: input.record,
      sourceSnapshot: input.sourceSnapshot,
    });
    const timestamp = this.now();

    let binding = existingBinding;
    let session: AgentSessionSnapshot;
    if (binding) {
      const continued = await this.dependencies.agentGateway.continueConversation({
        appSessionId: binding.discussionAppSessionId,
      });
      binding = { ...binding, lastUsedAt: timestamp };
      session = await this.dependencies.agentGateway.sendFollowUp({
        appSessionId: continued.appSessionId,
        prompt: prompts.followUpPrompt,
        responseMode: 'richText',
      });
    } else if (run.reviewAgent === 'codex') {
      const forked = await this.dependencies.agentGateway.forkSession({
        appSessionId: run.rootAppSessionId,
      });
      binding = buildBinding(
        run,
        input.localThreadId,
        forked.appSessionId,
        'codex-fork',
        timestamp,
      );
      session = await this.dependencies.agentGateway.sendFollowUp({
        appSessionId: forked.appSessionId,
        prompt: prompts.initialPrompt,
        responseMode: 'richText',
      });
    } else {
      session = await this.dependencies.agentGateway.startSession({
        agent: run.reviewAgent,
        cwd: input.cwd,
        prompt: prompts.initialPrompt,
        responseMode: 'richText',
      });
      binding = buildBinding(
        run,
        input.localThreadId,
        session.appSessionId,
        'app-side-rehydrate',
        timestamp,
      );
    }

    const reply: Poc3AgentThreadReplyRecord = {
      replyId: randomUUID(),
      reviewWorkspaceId: run.reviewWorkspaceId,
      revisionId: run.revisionId,
      localThreadId: input.localThreadId,
      appSessionId: binding.discussionAppSessionId,
      userMessageId: `${input.localThreadId}:user:${randomUUID()}`,
      createdAt: timestamp,
    };
    const userMessage: Poc3AgentThreadMessage = {
      localMessageId: reply.userMessageId,
      localThreadId: input.localThreadId,
      role: 'user',
      source: 'user-reply',
      body,
      createdAt: timestamp,
    };

    this.dependencies.store.saveThreadBinding(binding);
    this.dependencies.store.appendThreadMessage(userMessage, {
      reviewWorkspaceId: run.reviewWorkspaceId,
      revisionId: run.revisionId,
      runId: run.runId,
    });
    this.dependencies.store.saveReplyRecord(reply);
    this.inFlightByThread.set(input.localThreadId, reply.replyId);
    this.overlayByThread.set(input.localThreadId, {
      replyStatus: 'replying',
      lastError: null,
      activeReplySessionId: session.appSessionId,
    });

    return {
      reply,
      binding,
      session,
      userMessage,
      conversation: this.applyOverlay(
        this.dependencies.store.buildConversation(input.localThreadId),
      )!,
    };
  }

  async awaitResult(input: { replyId: string }): Promise<Poc3AgentThreadConversation> {
    const reply = this.dependencies.store.getReplyRecord(input.replyId);
    if (!reply) {
      throw new Poc3ThreadReplyError('REPLY_NOT_FOUND', '返信 record が見つかりません。');
    }
    let settled: AgentSessionSnapshot | null = null;
    try {
      settled = await this.dependencies.agentGateway.awaitSettled(reply.appSessionId);
      const assistantMessage = this.toAssistantMessage(reply, settled);
      if (!assistantMessage) {
        throw new Poc3ThreadReplyError(
          'AGENT_FAILED',
          settled.lastError?.message ?? 'Markdown 返信を取得できませんでした。',
        );
      }
      const binding = this.dependencies.store.getThreadBinding(reply.localThreadId);
      this.dependencies.store.appendThreadMessage(assistantMessage, {
        reviewWorkspaceId: reply.reviewWorkspaceId,
        revisionId: reply.revisionId,
        runId: binding?.runId ?? '',
      });
      this.inFlightByThread.delete(reply.localThreadId);
      this.overlayByThread.delete(reply.localThreadId);
      const conversation = this.dependencies.store.buildConversation(reply.localThreadId);
      if (!conversation) {
        throw new Poc3ThreadReplyError('THREAD_NOT_FOUND', 'Finding thread が見つかりません。');
      }
      return conversation;
    } catch (error: unknown) {
      this.inFlightByThread.delete(reply.localThreadId);
      this.overlayByThread.set(reply.localThreadId, {
        replyStatus: 'failed',
        lastError: error instanceof Error ? error.message : '返信の完了待機に失敗しました。',
        activeReplySessionId: null,
      });
      throw error;
    }
  }

  hasInFlight(localThreadId: string): boolean {
    return this.inFlightByThread.has(localThreadId);
  }

  getOverlay(localThreadId: string) {
    return (
      this.overlayByThread.get(localThreadId) ?? {
        replyStatus: 'idle' as const,
        lastError: null,
        activeReplySessionId: null,
      }
    );
  }

  applyOverlay(
    conversation: Poc3AgentThreadConversation | null,
  ): Poc3AgentThreadConversation | null {
    if (!conversation) {
      return null;
    }
    return {
      ...conversation,
      ...this.getOverlay(conversation.localThreadId),
    };
  }

  resolveLatestReplyId(localThreadId: string): string | null {
    return (
      this.inFlightByThread.get(localThreadId) ??
      this.dependencies.store.getLatestReplyForThread(localThreadId)?.replyId ??
      null
    );
  }

  private toAssistantMessage(
    reply: Poc3AgentThreadReplyRecord,
    session: AgentSessionSnapshot,
  ): Poc3AgentThreadMessage | null {
    const result = session.finalResult;
    if (!result || result.kind !== 'richText') {
      return null;
    }
    const body = result.content.trim();
    if (!body) {
      return null;
    }
    return {
      localMessageId: `${reply.localThreadId}:assistant:${reply.replyId}`,
      localThreadId: reply.localThreadId,
      role: 'assistant',
      source: 'agent-reply',
      body,
      createdAt: this.now(),
    };
  }
}

function buildBinding(
  run: Poc3AgentReviewRun,
  localThreadId: string,
  discussionAppSessionId: string,
  strategy: Poc3AgentThreadBinding['strategy'],
  timestamp: string,
): Poc3AgentThreadBinding {
  return {
    reviewWorkspaceId: run.reviewWorkspaceId,
    revisionId: run.revisionId,
    localThreadId,
    runId: run.runId,
    rootAppSessionId: run.rootAppSessionId,
    discussionAppSessionId,
    strategy,
    createdAt: timestamp,
    lastUsedAt: timestamp,
  };
}
