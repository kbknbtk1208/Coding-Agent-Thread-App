import { randomUUID } from 'crypto';
import type { AgentSessionSnapshot, StartSessionInput } from '../../shared/contracts/agent-ipc';
import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import type { ReviewDraftEnvelope, ReviewRunRecord } from '../../shared/domain/review-draft';
import type { AgentGateway } from '../agent-gateway/agent-gateway';
import { ReviewContextAssembler } from './review-context-assembler';
import { ReviewDraftStore } from './review-draft-store';
import { ReviewResultNormalizer } from './review-result-normalizer';

interface ReviewRunCoordinatorDependencies {
  agentGateway: Pick<AgentGateway, 'startSession' | 'awaitSettled'>;
  contextAssembler?: ReviewContextAssembler;
  resultNormalizer?: ReviewResultNormalizer;
  draftStore?: ReviewDraftStore;
  now?: () => string;
  cwdResolver?: () => string;
}

export interface DraftReviewRequest {
  snapshot: ReviewSnapshot;
  reviewAgent: StartSessionInput['agent'];
  instructions: string;
  lensId?: string;
  cwd?: string;
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
}

export interface BegunDraftReview {
  run: ReviewRunRecord;
  session: AgentSessionSnapshot;
}

export class ReviewRunCoordinator {
  private readonly contextAssembler: ReviewContextAssembler;
  private readonly resultNormalizer: ReviewResultNormalizer;
  private readonly draftStore: ReviewDraftStore;
  private readonly now: () => string;
  private readonly cwdResolver: () => string;

  constructor(private readonly dependencies: ReviewRunCoordinatorDependencies) {
    this.contextAssembler = dependencies.contextAssembler ?? new ReviewContextAssembler();
    this.resultNormalizer = dependencies.resultNormalizer ?? new ReviewResultNormalizer();
    this.draftStore = dependencies.draftStore ?? new ReviewDraftStore();
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.cwdResolver = dependencies.cwdResolver ?? (() => process.cwd());
  }

  async beginDraftReview(input: DraftReviewRequest): Promise<BegunDraftReview> {
    const createdAt = this.now();
    const lensId = input.lensId?.trim() || 'general';
    const reviewContext = this.contextAssembler.build({
      snapshot: input.snapshot,
      instructions: input.instructions,
      lensId,
    });

    const session = await this.dependencies.agentGateway.startSession({
      agent: input.reviewAgent,
      cwd: input.cwd?.trim() || this.cwdResolver(),
      prompt: reviewContext.prompt,
      responseMode: 'structured',
      structuredSchemaName: 'review-draft',
    });

    const run = this.createRunRecord({
      snapshotId: input.snapshot.snapshotId,
      reviewAgent: input.reviewAgent,
      instructions: input.instructions,
      lensId,
      rootAppSessionId: session.appSessionId,
      createdAt,
    });
    this.draftStore.saveRun(input.snapshot.snapshotId, run);

    return { run, session };
  }

  async awaitDraftReviewResult(input: {
    snapshot: ReviewSnapshot;
    run: ReviewRunRecord;
    hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
  }): Promise<ReviewDraftEnvelope> {
    const settled = await this.dependencies.agentGateway.awaitSettled(input.run.rootAppSessionId);
    const result = settled.finalResult;
    if (!result) {
      const failedRun: ReviewRunRecord = {
        ...input.run,
        status: 'failed',
        resultSource: 'richText',
        completedAt: this.now(),
      };
      this.draftStore.saveFailedRun(input.snapshot.snapshotId, failedRun);
      throw new Error(settled.lastError?.message ?? 'レビュー結果が返されませんでした。');
    }

    if (result.kind === 'structured' && result.schemaName === 'review-draft') {
      const structuredResult =
        result.data as import('../../shared/domain/review-draft').ReviewDraftStructuredResult;
      const threads = await this.resultNormalizer.normalize({
        snapshot: input.snapshot,
        runId: input.run.runId,
        structuredResult,
        hydrateFile: input.hydrateFile,
      });
      const envelope: ReviewDraftEnvelope = {
        kind: 'structured',
        run: {
          ...input.run,
          status: 'completed',
          resultSource: result.source,
          completedAt: this.now(),
        },
        summary: structuredResult.summary,
        threads,
      };
      this.draftStore.saveEnvelope(input.snapshot.snapshotId, envelope);
      return envelope;
    }

    if (
      result.kind === 'richText' &&
      result.source === 'structuredParseFallback' &&
      result.structuredSchemaName === 'review-draft'
    ) {
      const envelope: ReviewDraftEnvelope = {
        kind: 'fallback-richText',
        run: {
          ...input.run,
          status: 'fallback_rich_text',
          resultSource: 'richText',
          completedAt: this.now(),
        },
        content: result.content,
        reason:
          result.structuredParseFailureReason === 'emptyResponse' ||
          result.structuredParseFailureReason === 'schemaValidationFailed'
            ? result.structuredParseFailureReason
            : 'structuredParseFailed',
      };
      this.draftStore.saveEnvelope(input.snapshot.snapshotId, envelope);
      return envelope;
    }

    const failedRun: ReviewRunRecord = {
      ...input.run,
      status: 'failed',
      resultSource: result.kind === 'structured' ? result.source : 'richText',
      completedAt: this.now(),
    };
    this.draftStore.saveFailedRun(input.snapshot.snapshotId, failedRun);
    throw new Error('review-draft structured result を取得できませんでした。');
  }

  getDraftStore(): ReviewDraftStore {
    return this.draftStore;
  }

  private createRunRecord(args: {
    snapshotId: string;
    reviewAgent: StartSessionInput['agent'];
    instructions: string;
    lensId: string;
    rootAppSessionId: string;
    createdAt: string;
  }): ReviewRunRecord {
    return {
      runId: randomUUID(),
      snapshotId: args.snapshotId,
      reviewAgent: args.reviewAgent,
      lensId: args.lensId,
      instructions: args.instructions,
      rootAppSessionId: args.rootAppSessionId,
      status: 'drafting_review',
      resultSource: 'richText',
      createdAt: args.createdAt,
    };
  }
}
