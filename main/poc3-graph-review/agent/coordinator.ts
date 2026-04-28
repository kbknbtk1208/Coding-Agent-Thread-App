import { randomUUID } from 'crypto';
import type { AgentKind } from '../../../shared/domain/agent';
import type { AgentSessionSnapshot } from '../../../shared/contracts/agent-ipc';
import type { ReviewDraftStructuredResult } from '../../../shared/domain/review-draft';
import type {
  Poc3AgentReviewEnvelope,
  Poc3AgentReviewRun,
} from '../../../shared/poc3-domain/agent-review';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { AgentGateway } from '../../agent-gateway/agent-gateway';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { Poc3AgentReviewNormalizer } from './normalizer';
import { Poc3AgentReviewStore } from './store';

interface Poc3AgentReviewCoordinatorDependencies {
  agentGateway: Pick<AgentGateway, 'startSession' | 'awaitSettled'>;
  store: Poc3AgentReviewStore;
  normalizer?: Poc3AgentReviewNormalizer;
  now?: () => string;
}

export interface BeginPoc3AgentReviewInput {
  reviewWorkspaceId: string;
  scopeKey: string;
  reviewAgent: AgentKind;
  instructions: string;
  lensId?: string;
  codexModel?: string;
  codexReasoningEffort?: string;
  cwd: string;
  record: WorkspaceGraphRecord;
}

export class Poc3AgentReviewCoordinator {
  private readonly normalizer: Poc3AgentReviewNormalizer;
  private readonly now: () => string;

  constructor(private readonly dependencies: Poc3AgentReviewCoordinatorDependencies) {
    this.normalizer = dependencies.normalizer ?? new Poc3AgentReviewNormalizer();
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async begin(input: BeginPoc3AgentReviewInput): Promise<{
    run: Poc3AgentReviewRun;
    session: AgentSessionSnapshot;
  }> {
    if (!input.record.activeRevision || !input.record.graph) {
      throw new Error('Agent Review を開始できる graph がありません。');
    }
    const createdAt = this.now();
    const prompt = buildPrompt({
      title: input.record.workspace.title,
      instructions: input.instructions,
      graphSummary: summarizeGraph(input.record.graph),
      changedFiles: input.record.graph.nodes
        .filter((node) => node.isDiffNode && node.filePath)
        .map((node) => `${node.filePath}:${node.label}`)
        .slice(0, 40),
    });
    const session = await this.dependencies.agentGateway.startSession({
      agent: input.reviewAgent,
      cwd: input.cwd,
      prompt,
      responseMode: 'structured',
      structuredSchemaName: 'review-draft',
      codexModel: input.reviewAgent === 'codex' ? input.codexModel : undefined,
      codexReasoningEffort: input.reviewAgent === 'codex' ? input.codexReasoningEffort : undefined,
    });
    const run: Poc3AgentReviewRun = {
      runId: randomUUID(),
      reviewWorkspaceId: input.reviewWorkspaceId,
      revisionId: input.record.activeRevision.revisionId,
      scopeKey: input.scopeKey,
      reviewAgent: input.reviewAgent,
      lensId: input.lensId?.trim() || 'general',
      instructions: input.instructions,
      codexModel: input.reviewAgent === 'codex' ? input.codexModel?.trim() || undefined : undefined,
      codexReasoningEffort:
        input.reviewAgent === 'codex' ? input.codexReasoningEffort?.trim() || undefined : undefined,
      rootAppSessionId: session.appSessionId,
      status: 'starting',
      resultSource: 'richText',
      createdAt,
      completedAt: null,
    };
    this.dependencies.store.saveRun(run);
    return { run, session };
  }

  async awaitResult(input: {
    run: Poc3AgentReviewRun;
    record: WorkspaceGraphRecord;
    sourceSnapshot: ReviewSourceSnapshot;
  }): Promise<Poc3AgentReviewEnvelope> {
    const settled = await this.dependencies.agentGateway.awaitSettled(input.run.rootAppSessionId);
    const result = settled.finalResult;
    const completedAt = this.now();
    if (!result) {
      const failedRun = this.completeRun(input.run, 'failed', 'richText', completedAt);
      this.dependencies.store.saveRun(failedRun);
      throw new Error(settled.lastError?.message ?? 'Agent Review の結果が返されませんでした。');
    }

    if (
      result.kind === 'structured' &&
      result.schemaName === 'review-draft' &&
      input.record.graph &&
      input.record.activeRevision
    ) {
      const structuredResult = result.data as ReviewDraftStructuredResult;
      const run = this.completeRun(input.run, 'completed', result.source, completedAt);
      const envelope: Poc3AgentReviewEnvelope = {
        kind: 'structured',
        run,
        summary: structuredResult.summary,
        threads: this.normalizer.normalize({
          runId: run.runId,
          reviewWorkspaceId: run.reviewWorkspaceId,
          revisionId: run.revisionId,
          graph: input.record.graph,
          sourceSnapshot: input.sourceSnapshot,
          result: structuredResult,
          createdAt: completedAt,
        }),
      };
      return this.dependencies.store.saveEnvelope(envelope);
    }

    if (
      result.kind === 'richText' &&
      result.source === 'structuredParseFallback' &&
      result.structuredSchemaName === 'review-draft'
    ) {
      const envelope: Poc3AgentReviewEnvelope = {
        kind: 'fallback-richText',
        run: this.completeRun(input.run, 'fallback_rich_text', 'richText', completedAt),
        content: result.content,
        reason:
          result.structuredParseFailureReason === 'emptyResponse' ||
          result.structuredParseFailureReason === 'schemaValidationFailed'
            ? result.structuredParseFailureReason
            : 'structuredParseFailed',
      };
      return this.dependencies.store.saveEnvelope(envelope);
    }

    const failedRun = this.completeRun(
      input.run,
      'failed',
      result.kind === 'structured' ? result.source : 'richText',
      completedAt,
    );
    this.dependencies.store.saveRun(failedRun);
    throw new Error('review-draft structured result を取得できませんでした。');
  }

  private completeRun(
    run: Poc3AgentReviewRun,
    status: Poc3AgentReviewRun['status'],
    resultSource: Poc3AgentReviewRun['resultSource'],
    completedAt: string,
  ): Poc3AgentReviewRun {
    return {
      ...run,
      status,
      resultSource,
      completedAt,
    };
  }
}

function summarizeGraph(graph: WorkspaceGraphRecord['graph']): string {
  if (!graph) {
    return 'Graph is unavailable.';
  }
  return [
    `nodes=${graph.nodes.length}`,
    `edges=${graph.edges.length}`,
    `diffNodes=${graph.nodes.filter((node) => node.isDiffNode).length}`,
    `diagnostics=${graph.diagnostics.length}`,
  ].join(', ');
}

function buildPrompt(input: {
  title: string;
  instructions: string;
  graphSummary: string;
  changedFiles: string[];
}): string {
  return [
    'You are reviewing a pull request / merge request from a dependency graph view.',
    `Review title: ${input.title}`,
    `Graph summary: ${input.graphSummary}`,
    '',
    'Changed graph nodes:',
    ...input.changedFiles.map((line) => `- ${line}`),
    '',
    'Reviewer instructions:',
    input.instructions.trim() || 'Prioritize correctness, tests, and maintainability.',
    '',
    'Return findings using the review-draft structured schema.',
    'Use diff locations only when the file path and line are clear; otherwise use overview.',
  ].join('\n');
}
