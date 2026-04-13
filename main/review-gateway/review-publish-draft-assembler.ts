import { randomUUID } from 'crypto';
import type { ReviewLocalThread } from '../../shared/domain/review-draft';
import type { ReviewPublishDraft } from '../../shared/domain/review-publish';

export class ReviewPublishDraftAssembler {
  seed(
    snapshotId: string,
    localThreads: ReviewLocalThread[],
    existingDrafts: ReviewPublishDraft[],
    now?: () => string,
  ): ReviewPublishDraft[] {
    const nowFn = now ?? (() => new Date().toISOString());
    const existingByLocalThreadId = new Map(existingDrafts.map((d) => [d.localThreadId, d]));

    return localThreads
      .filter((thread) => {
        const existing = existingByLocalThreadId.get(thread.localThreadId);
        return !existing || existing.state !== 'published';
      })
      .map((thread) => {
        const existing = existingByLocalThreadId.get(thread.localThreadId);
        if (existing) {
          return structuredClone(existing);
        }

        const draft = thread.draft;
        const body = draft.draftBody;

        return {
          publishDraftId: `publish-draft-${randomUUID()}`,
          snapshotId,
          runId: draft.runId,
          localThreadId: thread.localThreadId,
          sourceKind: 'ai-local-thread' as const,
          title: draft.title,
          severity: draft.severity,
          body,
          originalBody: body,
          location: structuredClone(draft.resolvedLocation),
          anchor: draft.anchor ? structuredClone(draft.anchor) : null,
          state: 'ready' as const,
          lastError: null,
          publishedRemote: null,
          updatedAt: nowFn(),
        };
      });
  }
}
