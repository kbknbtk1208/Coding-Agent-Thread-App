import { randomUUID } from 'crypto';
import type { AgentSessionSnapshot } from '../../shared/contracts/agent-ipc';
import type { AgentGateway } from '../agent-gateway/agent-gateway';
import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import type { AgentKind } from '../../shared/domain/agent';
import type { ReviewSummaryDraft } from '../../shared/domain/review-draft';
import type {
  ReviewMentionBinding,
  ReviewMentionMessage,
  ReviewMentionRecord,
  ReviewMentionThread,
} from '../../shared/domain/review-mention';
import type { ReviewDraftStore } from './review-draft-store';
import { ReviewSelectionContextAssembler } from './review-selection-context-assembler';
import type { ReviewSelectionMentionStore } from './review-selection-mention-store';
import { ReviewGatewayError } from './review-gateway-error';

export interface SelectionMentionRequest {
  snapshot: ReviewSnapshot;
  reviewAgent: AgentKind;
  fileId: string;
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  body: string;
  cwd: string;
  mentionThreadId?: string;
  latestSummary?: ReviewSummaryDraft | null;
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
}

export interface BegunSelectionMention {
  mention: ReviewMentionRecord;
  thread: ReviewMentionThread;
  session: AgentSessionSnapshot;
}

interface ReviewSelectionMentionCoordinatorDependencies {
  agentGateway: Pick<
    AgentGateway,
    'startSession' | 'continueConversation' | 'sendFollowUp' | 'awaitSettled'
  >;
  contextAssembler?: ReviewSelectionContextAssembler;
  mentionStore: ReviewSelectionMentionStore;
  draftStore: ReviewDraftStore;
  now?: () => string;
  cwdResolver?: () => string;
}

export class ReviewSelectionMentionCoordinator {
  private readonly contextAssembler: ReviewSelectionContextAssembler;
  private readonly now: () => string;
  private readonly cwdResolver: () => string;

  constructor(private readonly dependencies: ReviewSelectionMentionCoordinatorDependencies) {
    this.contextAssembler = dependencies.contextAssembler ?? new ReviewSelectionContextAssembler();
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.cwdResolver = dependencies.cwdResolver ?? (() => process.cwd());
  }

  async beginSelectionMention(input: SelectionMentionRequest): Promise<BegunSelectionMention> {
    const body = input.body.trim();
    if (!body) {
      throw new Error('Selection mention body is required.');
    }

    if (input.mentionThreadId) {
      return this.beginFollowUp(input, body);
    }

    return this.beginInitialMention(input, body);
  }

  async awaitSelectionMentionResult(input: {
    mentionId: string;
    snapshotId: string;
    mentionThreadId: string;
    appSessionId: string;
  }): Promise<ReviewMentionThread> {
    let settled: AgentSessionSnapshot | null = null;

    try {
      settled = await this.dependencies.agentGateway.awaitSettled(input.appSessionId);
      const assistantMessage = this.toAssistantMessage(input, settled);
      if (!assistantMessage) {
        throw new Error(
          settled.lastError?.message ??
            'The selection mention did not produce a Markdown response.',
        );
      }

      this.dependencies.mentionStore.appendMessage(
        input.snapshotId,
        input.mentionThreadId,
        assistantMessage,
      );
      this.dependencies.mentionStore.setReplyState(input.snapshotId, input.mentionThreadId, {
        replyStatus: 'idle',
        lastError: null,
        activeSessionId: null,
        activeSession: settled,
      });
    } catch (error: unknown) {
      this.dependencies.mentionStore.setReplyState(input.snapshotId, input.mentionThreadId, {
        replyStatus: 'failed',
        lastError:
          error instanceof Error ? error.message : 'Failed to await the selection mention reply.',
        activeSessionId: null,
        activeSession: settled,
      });
      throw error;
    }

    return this.requireThread(input.snapshotId, input.mentionThreadId);
  }

  private async beginInitialMention(
    input: SelectionMentionRequest,
    body: string,
  ): Promise<BegunSelectionMention> {
    const now = this.now();
    const mentionThreadId = `selection-mention-${randomUUID()}`;
    const assembly = await this.contextAssembler.build({
      snapshot: input.snapshot,
      reviewAgent: input.reviewAgent,
      fileId: input.fileId,
      side: input.side,
      startLine: input.startLine,
      endLine: input.endLine,
      question: body,
      latestSummary: input.latestSummary,
      localDraftThreads: this.dependencies.draftStore.getLocalThreads(input.snapshot.snapshotId),
      hydrateFile: input.hydrateFile,
    });
    const session = await this.dependencies.agentGateway.startSession({
      agent: input.reviewAgent,
      cwd: input.cwd.trim() || this.cwdResolver(),
      prompt: assembly.initialPrompt,
      responseMode: 'richText',
    });
    const binding: ReviewMentionBinding = {
      snapshotId: input.snapshot.snapshotId,
      mentionThreadId,
      reviewAgent: input.reviewAgent,
      discussionAppSessionId: session.appSessionId,
      strategy: 'selection-context-session',
      createdAt: now,
      lastUsedAt: now,
    };
    const mention: ReviewMentionRecord = {
      mentionId: randomUUID(),
      snapshotId: input.snapshot.snapshotId,
      mentionThreadId,
      appSessionId: session.appSessionId,
      userMessageId: `${mentionThreadId}:user:${randomUUID()}`,
      createdAt: now,
    };
    const userMessage: ReviewMentionMessage = {
      localMessageId: mention.userMessageId,
      mentionThreadId,
      role: 'user',
      source: 'initial-question',
      body,
      createdAt: now,
    };
    const thread: ReviewMentionThread = {
      mentionThreadId,
      snapshotId: input.snapshot.snapshotId,
      reviewAgent: input.reviewAgent,
      selection: assembly.selection,
      messages: [userMessage],
      binding,
      replyStatus: 'replying',
      lastError: null,
      activeSessionId: session.appSessionId,
      activeSession: session,
      promotedDraftThreadId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.dependencies.mentionStore.saveThread(input.snapshot.snapshotId, thread);

    return {
      mention,
      thread,
      session,
    };
  }

  private async beginFollowUp(
    input: SelectionMentionRequest,
    body: string,
  ): Promise<BegunSelectionMention> {
    const mentionThreadId = input.mentionThreadId!;
    const thread = this.requireThread(input.snapshot.snapshotId, mentionThreadId);
    if (thread.replyStatus === 'replying') {
      throw new Error('This selection mention already has a reply in progress.');
    }
    if (!thread.binding) {
      throw new Error('Selection mention session binding was not found.');
    }

    const now = this.now();
    const assembly = await this.contextAssembler.build({
      snapshot: input.snapshot,
      reviewAgent: thread.reviewAgent,
      fileId: thread.selection.fileId,
      side: thread.selection.side,
      startLine: thread.selection.startLine,
      endLine: thread.selection.endLine,
      question: body,
      latestSummary: input.latestSummary,
      localDraftThreads: this.dependencies.draftStore.getLocalThreads(input.snapshot.snapshotId),
      hydrateFile: input.hydrateFile,
    });

    const continued = await this.dependencies.agentGateway.continueConversation({
      appSessionId: thread.binding.discussionAppSessionId,
    });
    const session = await this.dependencies.agentGateway.sendFollowUp({
      appSessionId: continued.appSessionId,
      prompt: assembly.followUpPrompt,
      responseMode: 'richText',
    });
    const binding: ReviewMentionBinding = {
      ...thread.binding,
      lastUsedAt: now,
    };
    const mention: ReviewMentionRecord = {
      mentionId: randomUUID(),
      snapshotId: input.snapshot.snapshotId,
      mentionThreadId,
      appSessionId: binding.discussionAppSessionId,
      userMessageId: `${mentionThreadId}:user:${randomUUID()}`,
      createdAt: now,
    };
    const userMessage: ReviewMentionMessage = {
      localMessageId: mention.userMessageId,
      mentionThreadId,
      role: 'user',
      source: 'user-reply',
      body,
      createdAt: now,
    };

    this.dependencies.mentionStore.setBinding(input.snapshot.snapshotId, mentionThreadId, binding);
    this.dependencies.mentionStore.appendMessage(
      input.snapshot.snapshotId,
      mentionThreadId,
      userMessage,
    );
    this.dependencies.mentionStore.setReplyState(input.snapshot.snapshotId, mentionThreadId, {
      replyStatus: 'replying',
      lastError: null,
      activeSessionId: session.appSessionId,
      activeSession: session,
    });

    return {
      mention,
      thread: this.requireThread(input.snapshot.snapshotId, mentionThreadId),
      session,
    };
  }

  private requireThread(snapshotId: string, mentionThreadId: string): ReviewMentionThread {
    const thread = this.dependencies.mentionStore.getThread(snapshotId, mentionThreadId);
    if (!thread) {
      throw new ReviewGatewayError(
        'THREAD_NOT_FOUND',
        `Selection mention thread not found: ${mentionThreadId}`,
      );
    }
    return thread;
  }

  private toAssistantMessage(
    mention: {
      mentionId: string;
      mentionThreadId: string;
    },
    session: AgentSessionSnapshot,
  ): ReviewMentionMessage | null {
    const result = session.finalResult;
    if (!result || result.kind !== 'richText') {
      return null;
    }

    const body = result.content.trim();
    if (!body) {
      return null;
    }

    return {
      localMessageId: `${mention.mentionThreadId}:assistant:${mention.mentionId}`,
      mentionThreadId: mention.mentionThreadId,
      role: 'assistant',
      source: 'agent-reply',
      body,
      createdAt: this.now(),
    };
  }
}
