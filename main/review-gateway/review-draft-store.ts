import {
  createLocalThread,
  type ReviewDraftEnvelope,
  type ReviewLocalThread,
  type ReviewRunRecord,
  type ReviewThreadBinding,
  type ReviewThreadDraft,
  type ReviewThreadMessage,
} from '../../shared/domain/review-draft';

interface SnapshotDraftState {
  envelopesByRunId: Map<string, ReviewDraftEnvelope>;
  runs: ReviewRunRecord[];
  latestEnvelope: ReviewDraftEnvelope | null;
  threads: ReviewThreadDraft[];
  localThreads: ReviewLocalThread[];
}

function upsertRun(runs: ReviewRunRecord[], run: ReviewRunRecord): ReviewRunRecord[] {
  const runIndex = runs.findIndex((candidate) => candidate.runId === run.runId);
  if (runIndex === -1) {
    return [...runs, structuredClone(run)];
  }

  return runs.map((candidate) =>
    candidate.runId === run.runId ? structuredClone(run) : structuredClone(candidate),
  );
}

function createEmptyState(): SnapshotDraftState {
  return {
    envelopesByRunId: new Map<string, ReviewDraftEnvelope>(),
    runs: [],
    latestEnvelope: null,
    threads: [],
    localThreads: [],
  };
}

function cloneEnvelope(envelope: ReviewDraftEnvelope): ReviewDraftEnvelope {
  return structuredClone(envelope);
}

function cloneThreads(threads: ReviewThreadDraft[]): ReviewThreadDraft[] {
  return threads.map((thread) => structuredClone(thread));
}

function cloneLocalThread(thread: ReviewLocalThread): ReviewLocalThread {
  return structuredClone(thread);
}

function cloneLocalThreads(threads: ReviewLocalThread[]): ReviewLocalThread[] {
  return threads.map((thread) => cloneLocalThread(thread));
}

function seedLocalThreads(
  currentLocalThreads: ReviewLocalThread[],
  envelope: ReviewDraftEnvelope,
): ReviewLocalThread[] {
  if (currentLocalThreads.length > 0 || envelope.kind !== 'structured') {
    return cloneLocalThreads(currentLocalThreads);
  }

  return envelope.threads.map((thread) => createLocalThread(structuredClone(thread)));
}

export class ReviewDraftStore {
  private readonly stateBySnapshotId = new Map<string, SnapshotDraftState>();

  saveEnvelope(snapshotId: string, envelope: ReviewDraftEnvelope): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? createEmptyState();
    const clonedEnvelope = cloneEnvelope(envelope);

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: new Map(current.envelopesByRunId).set(envelope.run.runId, clonedEnvelope),
      runs: upsertRun(current.runs, clonedEnvelope.run),
      latestEnvelope: clonedEnvelope,
      threads: clonedEnvelope.kind === 'structured' ? cloneThreads(clonedEnvelope.threads) : [],
      localThreads: seedLocalThreads(current.localThreads, clonedEnvelope),
    });
  }

  saveFailedRun(snapshotId: string, run: ReviewRunRecord): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? createEmptyState();

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: new Map(current.envelopesByRunId),
      runs: upsertRun(current.runs, run),
      latestEnvelope: current.latestEnvelope ? cloneEnvelope(current.latestEnvelope) : null,
      threads: cloneThreads(current.threads),
      localThreads: cloneLocalThreads(current.localThreads),
    });
  }

  saveRun(snapshotId: string, run: ReviewRunRecord): void {
    this.saveFailedRun(snapshotId, run);
  }

  getRuns(snapshotId: string): ReviewRunRecord[] {
    return (this.stateBySnapshotId.get(snapshotId)?.runs ?? []).map((run) => structuredClone(run));
  }

  getLatestEnvelope(snapshotId: string): ReviewDraftEnvelope | null {
    const envelope = this.stateBySnapshotId.get(snapshotId)?.latestEnvelope;
    return envelope ? cloneEnvelope(envelope) : null;
  }

  getEnvelopeByRunId(runId: string): ReviewDraftEnvelope | null {
    for (const state of Array.from(this.stateBySnapshotId.values())) {
      const envelope = state.envelopesByRunId.get(runId);
      if (envelope) {
        return cloneEnvelope(envelope);
      }
    }

    return null;
  }

  getThreads(snapshotId: string): ReviewThreadDraft[] {
    return cloneThreads(this.stateBySnapshotId.get(snapshotId)?.threads ?? []);
  }

  getLocalThreads(snapshotId: string): ReviewLocalThread[] {
    return cloneLocalThreads(this.stateBySnapshotId.get(snapshotId)?.localThreads ?? []);
  }

  getLocalThread(snapshotId: string, localThreadId: string): ReviewLocalThread | null {
    const thread = this.stateBySnapshotId
      .get(snapshotId)
      ?.localThreads.find((candidate) => candidate.localThreadId === localThreadId);
    return thread ? cloneLocalThread(thread) : null;
  }

  saveLocalThreads(snapshotId: string, localThreads: ReviewLocalThread[]): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? createEmptyState();

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: new Map(current.envelopesByRunId),
      runs: current.runs.map((run) => structuredClone(run)),
      latestEnvelope: current.latestEnvelope ? cloneEnvelope(current.latestEnvelope) : null,
      threads: cloneThreads(current.threads),
      localThreads: cloneLocalThreads(localThreads),
    });
  }

  setThreadBinding(snapshotId: string, localThreadId: string, binding: ReviewThreadBinding): void {
    this.updateLocalThread(snapshotId, localThreadId, (thread) => ({
      ...thread,
      binding: structuredClone(binding),
    }));
  }

  appendThreadMessage(
    snapshotId: string,
    localThreadId: string,
    message: ReviewThreadMessage,
  ): void {
    this.updateLocalThread(snapshotId, localThreadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, structuredClone(message)],
    }));
  }

  setThreadReplyState(
    snapshotId: string,
    localThreadId: string,
    state: Pick<
      ReviewLocalThread,
      'replyStatus' | 'lastError' | 'activeReplySessionId' | 'activeReplySession'
    >,
  ): void {
    this.updateLocalThread(snapshotId, localThreadId, (thread) => ({
      ...thread,
      replyStatus: state.replyStatus,
      lastError: state.lastError,
      activeReplySessionId: state.activeReplySessionId,
      activeReplySession: state.activeReplySession
        ? structuredClone(state.activeReplySession)
        : null,
    }));
  }

  private updateLocalThread(
    snapshotId: string,
    localThreadId: string,
    updater: (thread: ReviewLocalThread) => ReviewLocalThread,
  ): void {
    const snapshotState = this.stateBySnapshotId.get(snapshotId);
    if (!snapshotState) {
      return;
    }

    const nextLocalThreads = snapshotState.localThreads.map((thread) =>
      thread.localThreadId === localThreadId
        ? updater(cloneLocalThread(thread))
        : cloneLocalThread(thread),
    );
    const updatedThread = nextLocalThreads.find((thread) => thread.localThreadId === localThreadId);
    if (!updatedThread) {
      return;
    }

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: new Map(snapshotState.envelopesByRunId),
      runs: snapshotState.runs.map((run) => structuredClone(run)),
      latestEnvelope: snapshotState.latestEnvelope
        ? cloneEnvelope(snapshotState.latestEnvelope)
        : null,
      threads: cloneThreads(snapshotState.threads),
      localThreads: nextLocalThreads,
    });
  }
}
