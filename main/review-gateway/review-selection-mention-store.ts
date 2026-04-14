import type {
  ReviewMentionBinding,
  ReviewMentionMessage,
  ReviewMentionThread,
} from '../../shared/domain/review-mention';

interface SnapshotMentionState {
  threads: ReviewMentionThread[];
}

function createEmptyState(): SnapshotMentionState {
  return {
    threads: [],
  };
}

function cloneThread(thread: ReviewMentionThread): ReviewMentionThread {
  return structuredClone(thread);
}

function cloneThreads(threads: ReviewMentionThread[]): ReviewMentionThread[] {
  return threads.map((thread) => cloneThread(thread));
}

export class ReviewSelectionMentionStore {
  private readonly stateBySnapshotId = new Map<string, SnapshotMentionState>();

  getThreads(snapshotId: string): ReviewMentionThread[] {
    return cloneThreads(this.stateBySnapshotId.get(snapshotId)?.threads ?? []);
  }

  getThread(snapshotId: string, mentionThreadId: string): ReviewMentionThread | null {
    const thread = this.stateBySnapshotId
      .get(snapshotId)
      ?.threads.find((candidate) => candidate.mentionThreadId === mentionThreadId);
    return thread ? cloneThread(thread) : null;
  }

  saveThread(snapshotId: string, thread: ReviewMentionThread): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? createEmptyState();
    const exists = current.threads.some(
      (candidate) => candidate.mentionThreadId === thread.mentionThreadId,
    );
    const threads = exists
      ? current.threads.map((candidate) =>
          candidate.mentionThreadId === thread.mentionThreadId
            ? cloneThread(thread)
            : cloneThread(candidate),
        )
      : [...cloneThreads(current.threads), cloneThread(thread)];

    this.stateBySnapshotId.set(snapshotId, {
      threads,
    });
  }

  saveThreads(snapshotId: string, threads: ReviewMentionThread[]): void {
    this.stateBySnapshotId.set(snapshotId, {
      threads: cloneThreads(threads),
    });
  }

  appendMessage(snapshotId: string, mentionThreadId: string, message: ReviewMentionMessage): void {
    this.updateThread(snapshotId, mentionThreadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, structuredClone(message)],
      updatedAt: message.createdAt,
    }));
  }

  setBinding(snapshotId: string, mentionThreadId: string, binding: ReviewMentionBinding): void {
    this.updateThread(snapshotId, mentionThreadId, (thread) => ({
      ...thread,
      binding: structuredClone(binding),
      updatedAt: binding.lastUsedAt,
    }));
  }

  setReplyState(
    snapshotId: string,
    mentionThreadId: string,
    state: Pick<
      ReviewMentionThread,
      'replyStatus' | 'lastError' | 'activeSessionId' | 'activeSession'
    >,
  ): void {
    this.updateThread(snapshotId, mentionThreadId, (thread) => ({
      ...thread,
      replyStatus: state.replyStatus,
      lastError: state.lastError,
      activeSessionId: state.activeSessionId,
      activeSession: state.activeSession ? structuredClone(state.activeSession) : null,
      updatedAt: new Date().toISOString(),
    }));
  }

  markPromoted(snapshotId: string, mentionThreadId: string, localDraftThreadId: string): void {
    this.updateThread(snapshotId, mentionThreadId, (thread) => ({
      ...thread,
      replyStatus: 'promoted',
      lastError: null,
      promotedDraftThreadId: localDraftThreadId,
      updatedAt: new Date().toISOString(),
    }));
  }

  private updateThread(
    snapshotId: string,
    mentionThreadId: string,
    updater: (thread: ReviewMentionThread) => ReviewMentionThread,
  ): void {
    const current = this.stateBySnapshotId.get(snapshotId);
    if (!current) {
      return;
    }

    const nextThreads = current.threads.map((thread) =>
      thread.mentionThreadId === mentionThreadId
        ? updater(cloneThread(thread))
        : cloneThread(thread),
    );

    this.stateBySnapshotId.set(snapshotId, {
      threads: nextThreads,
    });
  }
}
