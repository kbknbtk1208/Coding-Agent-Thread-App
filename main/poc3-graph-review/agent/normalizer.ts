import { randomUUID } from 'crypto';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type {
  ReviewDraftStructuredResult,
  ReviewFindingDraft,
} from '../../../shared/domain/review-draft';
import { Poc3AgentReviewResolver } from './resolver';

export class Poc3AgentReviewNormalizer {
  constructor(private readonly resolver = new Poc3AgentReviewResolver()) {}

  normalize(input: {
    runId: string;
    reviewWorkspaceId: string;
    revisionId: string;
    graph: CodeGraphSnapshot;
    sourceSnapshot: ReviewSourceSnapshot;
    result: ReviewDraftStructuredResult;
    createdAt: string;
  }): Poc3AgentReviewThread[] {
    return input.result.findings.map((finding) =>
      this.toThread({
        ...input,
        finding,
      }),
    );
  }

  private toThread(input: {
    runId: string;
    reviewWorkspaceId: string;
    revisionId: string;
    graph: CodeGraphSnapshot;
    sourceSnapshot: ReviewSourceSnapshot;
    finding: ReviewFindingDraft;
    createdAt: string;
  }): Poc3AgentReviewThread {
    const resolved = this.resolver.resolve({
      finding: input.finding,
      graph: input.graph,
      sourceSnapshot: input.sourceSnapshot,
    });
    return {
      localThreadId: `poc3-agent-thread-${randomUUID()}`,
      runId: input.runId,
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.revisionId,
      findingId: input.finding.findingId,
      nodeId: resolved.nodeId,
      severity: input.finding.severity,
      category: input.finding.category,
      confidence: input.finding.confidence,
      title: input.finding.title,
      draftBody: input.finding.suggestion
        ? `${input.finding.body}\n\nSuggestion:\n${input.finding.suggestion}`
        : input.finding.body,
      suggestion: input.finding.suggestion,
      location: resolved.location,
      status: 'open',
      ...(resolved.debugDowngrade ? { debugDowngrade: resolved.debugDowngrade } : {}),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }
}
