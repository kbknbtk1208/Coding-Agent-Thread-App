import { randomUUID } from 'crypto';
import type { AgentSessionSnapshot } from '../../shared/contracts/agent-ipc';
import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import type {
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewSummaryDraft,
  ReviewThreadBinding,
  ReviewThreadMessage,
  ReviewThreadReplyRecord,
} from '../../shared/domain/review-draft';
import type { AgentGateway } from '../agent-gateway/agent-gateway';
import type { ReviewDraftStore } from './review-draft-store';
import { ReviewGatewayError } from './review-gateway-error';
import { ReviewThreadContextAssembler } from './review-thread-context-assembler';

interface ReviewThreadReplyCoordinatorDependencies {
  agentGateway: Pick<
    AgentGateway,
    'startSession' | 'continueConversation' | 'forkSession' | 'sendFollowUp' | 'awaitSettled'
  >;
  contextAssembler?: ReviewThreadContextAssembler;
  draftStore: ReviewDraftStore;
  now?: () => string;
  cwdResolver?: () => string;
}

export interface DraftThreadReplyRequest {
  snapshot: ReviewSnapshot;
  run: ReviewRunRecord;
  summary: ReviewSummaryDraft | null;
  localThreadId: string;
  body: string;
  cwd: string;
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
}

export interface BegunDraftThreadReply {
  reply: ReviewThreadReplyRecord;
  binding: ReviewThreadBinding;
  session: AgentSessionSnapshot;
}

export class ReviewThreadReplyCoordinator {
  private readonly contextAssembler: ReviewThreadContextAssembler;
  private readonly now: () => string;
  private readonly cwdResolver: () => string;

  constructor(private readonly dependencies: ReviewThreadReplyCoordinatorDependencies) {
    this.contextAssembler = dependencies.contextAssembler ?? new ReviewThreadContextAssembler();
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.cwdResolver = dependencies.cwdResolver ?? (() => process.cwd());
  }

  async beginDraftThreadReply(input: DraftThreadReplyRequest): Promise<BegunDraftThreadReply> {
    const body = input.body.trim();
    if (!body) {
      throw new Error('Reply body is required.');
    }

    const thread = this.requireLocalThread(input.snapshot.snapshotId, input.localThreadId);
    if (thread.replyStatus === 'replying') {
      throw new Error('This draft thread already has a reply in progress.');
    }

    const prompts = await this.contextAssembler.build({
      snapshot: input.snapshot,
      run: input.run,
      summary: input.summary,
      thread,
      userReply: body,
      hydrateFile: input.hydrateFile,
    });
    const cwd = input.cwd.trim() || this.cwdResolver();
    const now = this.now();

    let binding = thread.binding;
    let session: AgentSessionSnapshot;

    if (binding) {
      const continued = await this.dependencies.agentGateway.continueConversation({
        appSessionId: binding.discussionAppSessionId,
      });
      binding = {
        ...binding,
        lastUsedAt: now,
      };
      session = await this.dependencies.agentGateway.sendFollowUp({
        appSessionId: continued.appSessionId,
        prompt: prompts.followUpPrompt,
        responseMode: 'richText',
      });
    } else if (input.run.reviewAgent === 'codex') {
      const forked = await this.dependencies.agentGateway.forkSession({
        appSessionId: input.run.rootAppSessionId,
      });
      binding = {
        snapshotId: input.snapshot.snapshotId,
        localThreadId: input.localThreadId,
        runId: input.run.runId,
        rootAppSessionId: input.run.rootAppSessionId,
        discussionAppSessionId: forked.appSessionId,
        strategy: 'codex-fork',
        createdAt: now,
        lastUsedAt: now,
      };
      session = await this.dependencies.agentGateway.sendFollowUp({
        appSessionId: forked.appSessionId,
        prompt: prompts.initialPrompt,
        responseMode: 'richText',
      });
    } else {
      session = await this.dependencies.agentGateway.startSession({
        agent: input.run.reviewAgent,
        cwd,
        prompt: prompts.initialPrompt,
        responseMode: 'richText',
      });
      binding = {
        snapshotId: input.snapshot.snapshotId,
        localThreadId: input.localThreadId,
        runId: input.run.runId,
        rootAppSessionId: input.run.rootAppSessionId,
        discussionAppSessionId: session.appSessionId,
        strategy: 'app-side-rehydrate',
        createdAt: now,
        lastUsedAt: now,
      };
    }

    const reply: ReviewThreadReplyRecord = {
      replyId: randomUUID(),
      snapshotId: input.snapshot.snapshotId,
      localThreadId: input.localThreadId,
      appSessionId: binding.discussionAppSessionId,
      userMessageId: `${input.localThreadId}:user:${randomUUID()}`,
      createdAt: now,
    };
    const userMessage: ReviewThreadMessage = {
      localMessageId: reply.userMessageId,
      localThreadId: input.localThreadId,
      role: 'user',
      source: 'user-reply',
      body,
      createdAt: now,
    };

    this.dependencies.draftStore.setThreadBinding(
      input.snapshot.snapshotId,
      input.localThreadId,
      binding,
    );
    this.dependencies.draftStore.appendThreadMessage(
      input.snapshot.snapshotId,
      input.localThreadId,
      userMessage,
    );
    this.dependencies.draftStore.setThreadReplyState(
      input.snapshot.snapshotId,
      input.localThreadId,
      {
        replyStatus: 'replying',
        lastError: null,
        activeReplySessionId: session.appSessionId,
        activeReplySession: session,
      },
    );

    return {
      reply,
      binding,
      session,
    };
  }

  async awaitDraftThreadReplyResult(input: {
    replyId: string;
    snapshotId: string;
    localThreadId: string;
    appSessionId: string;
  }): Promise<ReviewLocalThread> {
    let settled: AgentSessionSnapshot | null = null;

    try {
      settled = await this.dependencies.agentGateway.awaitSettled(input.appSessionId);
      const assistantMessage = this.toAssistantMessage(input, settled);
      if (!assistantMessage) {
        throw new Error(
          settled.lastError?.message ??
            'The draft thread reply did not produce a Markdown response.',
        );
      }

      this.dependencies.draftStore.appendThreadMessage(
        input.snapshotId,
        input.localThreadId,
        assistantMessage,
      );
      this.dependencies.draftStore.setThreadReplyState(input.snapshotId, input.localThreadId, {
        replyStatus: 'idle',
        lastError: null,
        activeReplySessionId: null,
        activeReplySession: settled,
      });
    } catch (error: unknown) {
      this.dependencies.draftStore.setThreadReplyState(input.snapshotId, input.localThreadId, {
        replyStatus: 'failed',
        lastError:
          error instanceof Error ? error.message : 'Failed to await the draft thread reply.',
        activeReplySessionId: null,
        activeReplySession: settled,
      });
      throw error;
    }

    return this.requireLocalThread(input.snapshotId, input.localThreadId);
  }

  private requireLocalThread(snapshotId: string, localThreadId: string): ReviewLocalThread {
    const thread = this.dependencies.draftStore.getLocalThread(snapshotId, localThreadId);
    if (!thread) {
      throw new ReviewGatewayError('THREAD_NOT_FOUND', `Draft thread not found: ${localThreadId}`);
    }
    return thread;
  }

  private toAssistantMessage(
    reply: {
      replyId: string;
      localThreadId: string;
    },
    session: AgentSessionSnapshot,
  ): ReviewThreadMessage | null {
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
