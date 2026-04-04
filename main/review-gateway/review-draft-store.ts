import type {
  ReviewDraftEnvelope,
  ReviewRunRecord,
  ReviewThreadDraft,
} from '../../shared/domain/review-draft';

interface SnapshotDraftState {
  envelopesByRunId: Map<string, ReviewDraftEnvelope>;
  runs: ReviewRunRecord[];
  latestEnvelope: ReviewDraftEnvelope | null;
  threads: ReviewThreadDraft[];
}

function upsertRun(runs: ReviewRunRecord[], run: ReviewRunRecord): ReviewRunRecord[] {
  const runIndex = runs.findIndex((candidate) => candidate.runId === run.runId);
  if (runIndex === -1) {
    return [...runs, run];
  }

  return runs.map((candidate) => (candidate.runId === run.runId ? run : candidate));
}

export class ReviewDraftStore {
  private readonly stateBySnapshotId = new Map<string, SnapshotDraftState>();

  saveEnvelope(snapshotId: string, envelope: ReviewDraftEnvelope): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? {
      envelopesByRunId: new Map<string, ReviewDraftEnvelope>(),
      runs: [],
      latestEnvelope: null,
      threads: [],
    };

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: new Map(current.envelopesByRunId).set(envelope.run.runId, envelope),
      runs: upsertRun(current.runs, envelope.run),
      latestEnvelope: envelope,
      threads: envelope.kind === 'structured' ? envelope.threads : [],
    });
  }

  saveFailedRun(snapshotId: string, run: ReviewRunRecord): void {
    const current = this.stateBySnapshotId.get(snapshotId) ?? {
      envelopesByRunId: new Map<string, ReviewDraftEnvelope>(),
      runs: [],
      latestEnvelope: null,
      threads: [],
    };

    this.stateBySnapshotId.set(snapshotId, {
      envelopesByRunId: current.envelopesByRunId,
      runs: upsertRun(current.runs, run),
      latestEnvelope: current.latestEnvelope,
      threads: current.threads,
    });
  }

  saveRun(snapshotId: string, run: ReviewRunRecord): void {
    this.saveFailedRun(snapshotId, run);
  }

  getRuns(snapshotId: string): ReviewRunRecord[] {
    return [...(this.stateBySnapshotId.get(snapshotId)?.runs ?? [])];
  }

  getLatestEnvelope(snapshotId: string): ReviewDraftEnvelope | null {
    return this.stateBySnapshotId.get(snapshotId)?.latestEnvelope ?? null;
  }

  getEnvelopeByRunId(runId: string): ReviewDraftEnvelope | null {
    for (const state of Array.from(this.stateBySnapshotId.values())) {
      const envelope = state.envelopesByRunId.get(runId);
      if (envelope) {
        return envelope;
      }
    }

    return null;
  }

  getThreads(snapshotId: string): ReviewThreadDraft[] {
    return [...(this.stateBySnapshotId.get(snapshotId)?.threads ?? [])];
  }
}
