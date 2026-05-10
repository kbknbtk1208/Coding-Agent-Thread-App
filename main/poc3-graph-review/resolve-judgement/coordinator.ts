import { randomUUID } from 'crypto';
import type { AgentKind } from '../../../shared/domain/agent';
import type { AgentSessionSnapshot } from '../../../shared/contracts/agent-ipc';
import type {
  ResolveJudgementCommentKey,
  ResolveJudgementCommentType,
  ResolveJudgementResult,
  ResolveJudgementRun,
  ResolveJudgementTarget,
} from '../../../shared/poc3-domain/resolve-judgement';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { AgentGateway } from '../../agent-gateway/agent-gateway';
import type { Poc3AgentReviewStore } from '../agent/store';
import type { GraphReviewStore, WorkspaceGraphRecord } from '../store/graph-review-store';
import type { PublishedAgentThreadLinkStore } from '../published-agent-thread/store';
import { ResolveJudgementContextAssembler } from './context-assembler';
import { parseResolveJudgementOutput } from './output-parser';
import type { ResolveJudgementStore } from './store';

export interface ResolveJudgementCoordinatorDependencies {
  graphStore: GraphReviewStore;
  agentReviewStore: Poc3AgentReviewStore;
  agentGateway: Pick<AgentGateway, 'startSession' | 'awaitSettled'>;
  resultStore: ResolveJudgementStore;
  publishedAgentThreadLinkStore?: PublishedAgentThreadLinkStore;
  contextAssembler?: ResolveJudgementContextAssembler;
  now?: () => string;
}

export interface StartResolveJudgementCoordinatorInput {
  reviewWorkspaceId: string;
  scopeKey?: string;
  agent: AgentKind;
  codexModel?: string;
  codexReasoningEffort?: string;
}

export type StartResolveJudgementCoordinatorResult =
  | {
      ok: true;
      run: ResolveJudgementRun;
      reusedRunningRun: boolean;
    }
  | {
      ok: false;
      reason: 'agentUnavailable' | 'workspaceNotFound' | 'revisionNotFound' | 'graphNotReady';
      message: string;
      run: null;
    };

export interface AwaitResolveJudgementCoordinatorInput {
  runId: string;
}

export type AwaitResolveJudgementCoordinatorResult =
  | {
      ok: true;
      run: ResolveJudgementRun;
      results: ResolveJudgementResult[];
    }
  | {
      ok: false;
      reason: 'runNotFound' | 'agentFailed' | 'schemaValidationFailed';
      message: string;
      run: ResolveJudgementRun | null;
      results: ResolveJudgementResult[];
    };

interface PendingRun {
  promise: Promise<AwaitResolveJudgementCoordinatorResult>;
}

export class ResolveJudgementCoordinator {
  private readonly contextAssembler: ResolveJudgementContextAssembler;
  private readonly now: () => string;
  private readonly pending = new Map<string, PendingRun>();

  constructor(private readonly deps: ResolveJudgementCoordinatorDependencies) {
    this.contextAssembler = deps.contextAssembler ?? new ResolveJudgementContextAssembler();
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  start(input: StartResolveJudgementCoordinatorInput): StartResolveJudgementCoordinatorResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.deps.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        run: null,
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        run: null,
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        run: null,
      };
    }
    const revisionId = record.activeRevision.revisionId;

    const existing = this.deps.resultStore.findRunningRun({ reviewWorkspaceId, revisionId });
    if (existing) {
      return { ok: true, run: existing, reusedRunningRun: true };
    }

    const sourceSnapshot = this.deps.graphStore.getSourceSnapshotByRevision(revisionId);
    const { targets } = this.contextAssembler.collect({
      reviewWorkspaceId,
      revisionId,
      record,
      sourceSnapshot,
      agentReviewStore: this.deps.agentReviewStore,
      publishedAgentThreadLinks:
        this.deps.publishedAgentThreadLinkStore?.listLinksForWorkspace(reviewWorkspaceId) ?? [],
    });

    const createdAt = this.now();
    const runId = randomUUID();

    if (targets.length === 0) {
      const completedRun: ResolveJudgementRun = {
        runId,
        reviewWorkspaceId,
        revisionId,
        scopeKey,
        agent: input.agent,
        status: 'completed',
        targetCount: 0,
        rootAppSessionId: null,
        createdAt,
        completedAt: createdAt,
        errorMessage: null,
      };
      this.deps.resultStore.saveRun(completedRun);
      return { ok: true, run: completedRun, reusedRunningRun: false };
    }

    const startingRun: ResolveJudgementRun = {
      runId,
      reviewWorkspaceId,
      revisionId,
      scopeKey,
      agent: input.agent,
      status: 'starting',
      targetCount: targets.length,
      rootAppSessionId: null,
      createdAt,
      completedAt: null,
      errorMessage: null,
    };
    this.deps.resultStore.saveRun(startingRun);

    const promise = this.runAgentSession({
      run: startingRun,
      record,
      targets,
      sourceSnapshot,
      input,
    });
    this.pending.set(runId, { promise });
    promise.finally(() => {
      this.pending.delete(runId);
    });
    return { ok: true, run: startingRun, reusedRunningRun: false };
  }

  async awaitResult(
    input: AwaitResolveJudgementCoordinatorInput,
  ): Promise<AwaitResolveJudgementCoordinatorResult> {
    const runId = input.runId.trim();
    const pending = this.pending.get(runId);
    if (pending) {
      return pending.promise;
    }
    const stored = this.deps.resultStore.getRun(runId);
    if (!stored) {
      return {
        ok: false,
        reason: 'runNotFound',
        message: 'Resolve Judgement run が見つかりません。',
        run: null,
        results: [],
      };
    }
    if (stored.status === 'failed') {
      return {
        ok: false,
        reason: 'agentFailed',
        message: stored.errorMessage ?? 'Resolve Judgement が失敗しました。',
        run: stored,
        results: [],
      };
    }
    const results = this.deps.resultStore.listResults({
      reviewWorkspaceId: stored.reviewWorkspaceId,
      revisionId: stored.revisionId,
    });
    return { ok: true, run: stored, results };
  }

  listResults(input: { reviewWorkspaceId: string; revisionId: string }): {
    results: ResolveJudgementResult[];
    runningRun: ResolveJudgementRun | null;
  } {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const revisionId = input.revisionId.trim();
    return {
      results: this.deps.resultStore.listResults({ reviewWorkspaceId, revisionId }),
      runningRun: this.deps.resultStore.findRunningRun({ reviewWorkspaceId, revisionId }),
    };
  }

  private async runAgentSession(args: {
    run: ResolveJudgementRun;
    record: WorkspaceGraphRecord;
    targets: ResolveJudgementTarget[];
    sourceSnapshot: ReviewSourceSnapshot | null;
    input: StartResolveJudgementCoordinatorInput;
  }): Promise<AwaitResolveJudgementCoordinatorResult> {
    const { run, record, targets, sourceSnapshot, input } = args;
    const prompt = buildPrompt({
      title: record.workspace.title,
      sourceSnapshot,
      targets,
    });
    let session: AgentSessionSnapshot;
    try {
      session = await this.deps.agentGateway.startSession({
        agent: input.agent,
        cwd: record.workspace.worktreePath,
        prompt,
        responseMode: 'richText',
        codexModel: input.agent === 'codex' ? input.codexModel : undefined,
        codexReasoningEffort: input.agent === 'codex' ? input.codexReasoningEffort : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Agent セッションの開始に失敗しました。';
      return this.markFailed(run, message);
    }

    const runningRun: ResolveJudgementRun = {
      ...run,
      status: 'running',
      rootAppSessionId: session.appSessionId,
    };
    this.deps.resultStore.saveRun(runningRun);

    return this.finalize(runningRun, targets);
  }

  private async finalize(
    run: ResolveJudgementRun,
    targets: ResolveJudgementTarget[],
  ): Promise<AwaitResolveJudgementCoordinatorResult> {
    if (!run.rootAppSessionId) {
      return this.markFailed(run, 'Agent セッションが確立されていません。');
    }
    let settled: AgentSessionSnapshot;
    try {
      settled = await this.deps.agentGateway.awaitSettled(run.rootAppSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent 実行に失敗しました。';
      return this.markFailed(run, message);
    }
    const text = extractRichTextContent(settled);
    if (text === null) {
      return this.markFailed(run, 'Agent からテキスト応答を取得できませんでした。');
    }
    const parsed = parseResolveJudgementOutput(text);
    if (!parsed.ok) {
      const reasonMessage =
        parsed.reason === 'emptyResponse'
          ? 'Agent の応答が空でした。'
          : parsed.reason === 'jsonParseFailed'
            ? 'Agent の応答を JSON として解釈できませんでした。'
            : 'Agent の応答が schema に合致しませんでした。';
      const failedAt = this.now();
      const failedRun: ResolveJudgementRun = {
        ...run,
        status: 'failed',
        completedAt: failedAt,
        errorMessage: reasonMessage,
      };
      this.deps.resultStore.saveRun(failedRun);
      return {
        ok: false,
        reason: 'schemaValidationFailed',
        message: reasonMessage,
        run: failedRun,
        results: [],
      };
    }

    const resolvedAt = this.now();
    const targetByKey = new Map<string, ResolveJudgementTarget>();
    for (const target of targets) {
      targetByKey.set(targetKey(target.key.commentType, target.key.commentId), target);
    }
    const seenKeys = new Set<string>();
    const results: ResolveJudgementResult[] = [];
    for (const item of parsed.output.results) {
      const key = targetKey(item.commentType, item.commentId);
      const target = targetByKey.get(key);
      if (!target) continue;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push({
        key: target.key,
        runId: run.runId,
        decision: item.decision,
        reasonMarkdown: item.reasonMarkdown,
        evidence: item.evidence,
        checkedAt: resolvedAt,
      });
    }
    for (const target of targets) {
      const key = targetKey(target.key.commentType, target.key.commentId);
      if (seenKeys.has(key)) continue;
      results.push({
        key: target.key,
        runId: run.runId,
        decision: 'unresolvable',
        reasonMarkdown: 'Agent が判定結果を返さなかったため、Resolve 不可として扱いました。',
        evidence: [],
        checkedAt: resolvedAt,
      });
    }

    this.deps.resultStore.saveResults(results);
    const completedRun: ResolveJudgementRun = {
      ...run,
      status: 'completed',
      completedAt: resolvedAt,
    };
    this.deps.resultStore.saveRun(completedRun);
    return { ok: true, run: completedRun, results };
  }

  private markFailed(
    run: ResolveJudgementRun,
    message: string,
  ): AwaitResolveJudgementCoordinatorResult {
    const failedAt = this.now();
    const failedRun: ResolveJudgementRun = {
      ...run,
      status: 'failed',
      completedAt: failedAt,
      errorMessage: message,
    };
    this.deps.resultStore.saveRun(failedRun);
    return {
      ok: false,
      reason: 'agentFailed',
      message,
      run: failedRun,
      results: [],
    };
  }
}

function targetKey(commentType: ResolveJudgementCommentType, commentId: string): string {
  return `${commentType}:${commentId}`;
}

function extractRichTextContent(session: AgentSessionSnapshot): string | null {
  if (session.finalResult?.kind === 'richText') {
    return session.finalResult.content;
  }
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const turn = session.turns[i];
    if (turn.result?.kind === 'richText') return turn.result.content;
    if (turn.response.trim().length > 0) return turn.response;
  }
  return null;
}

function buildPrompt(input: {
  title: string;
  sourceSnapshot: ReviewSourceSnapshot | null;
  targets: ResolveJudgementTarget[];
}): string {
  const lines: string[] = [];
  lines.push(
    'You are auditing review comments to decide if each one is already resolved by the current code.',
  );
  lines.push(`Pull Request title: ${input.title}`);
  if (input.sourceSnapshot) {
    lines.push(`base SHA: ${input.sourceSnapshot.baseSha}`);
    lines.push(`head SHA: ${input.sourceSnapshot.headSha}`);
    if (input.sourceSnapshot.startSha) {
      lines.push(`start SHA: ${input.sourceSnapshot.startSha}`);
    }
    if (input.sourceSnapshot.description) {
      lines.push(`description: ${truncate(input.sourceSnapshot.description, 800)}`);
    }
  }
  lines.push('');
  lines.push('Judgement rules:');
  lines.push(
    '- Mark a comment as `resolvable` only if the issue it raises is genuinely fixed in the current code.',
  );
  lines.push(
    '- Code deletion, line movement, or being marked outdated alone is NOT enough to mark resolvable.',
  );
  lines.push('- If the same kind of issue still exists elsewhere, mark `unresolvable`.');
  lines.push('- If you do not have enough information to be certain, mark `unresolvable`.');
  lines.push('');
  lines.push('Comments to evaluate:');
  for (let i = 0; i < input.targets.length; i++) {
    const target = input.targets[i];
    lines.push('');
    lines.push(`### Comment ${String(i + 1)}`);
    lines.push(`- commentType: ${target.key.commentType}`);
    lines.push(`- commentId: ${target.key.commentId}`);
    lines.push(`- title: ${truncate(target.title, 200)}`);
    if (target.location.kind === 'diff') {
      lines.push(
        `- location: diff ${target.location.filePath}:${formatLineRange(target.location.startLine, target.location.endLine)} (side=${target.location.side})`,
      );
    } else if (target.location.kind === 'node') {
      lines.push(
        `- location: node ${target.location.nodeId} ${target.location.filePath ?? ''}:${formatLineRange(target.location.startLine, target.location.endLine)}`,
      );
    } else {
      lines.push('- location: overview');
    }
    lines.push(
      `- sourceState: status=${target.sourceState.status} isResolved=${formatNullable(target.sourceState.isResolved)} isOutdated=${formatNullable(target.sourceState.isOutdated)}`,
    );
    lines.push(`- body: ${truncate(target.primaryBody, 1200)}`);
    if (target.replies.length > 0) {
      lines.push('- replies:');
      for (const reply of target.replies) {
        lines.push(`  - [${reply.role}] ${truncate(reply.body, 600)}`);
      }
    }
    if (target.linkedRemoteThreads && target.linkedRemoteThreads.length > 0) {
      lines.push('- linked remote threads:');
      for (const remoteThread of target.linkedRemoteThreads) {
        lines.push(
          `  - providerThreadId=${remoteThread.providerThreadId} isResolved=${formatNullable(remoteThread.isResolved)} isOutdated=${formatNullable(remoteThread.isOutdated)}`,
        );
        for (const comment of remoteThread.comments) {
          lines.push(`    - [${comment.role}] ${truncate(comment.body, 600)}`);
        }
      }
    }
    if (target.currentCodeContext.diffPatch) {
      lines.push('- diff (truncated):');
      lines.push('```diff');
      lines.push(truncate(target.currentCodeContext.diffPatch, 4000));
      lines.push('```');
    }
  }
  lines.push('');
  lines.push('Return ONLY a JSON object with the schema below. No prose, no markdown fences.');
  lines.push('{');
  lines.push('  "results": [');
  lines.push('    {');
  lines.push('      "commentType": "agent-thread" | "remote-thread",');
  lines.push('      "commentId": "<commentId from input>",');
  lines.push('      "decision": "resolvable" | "unresolvable",');
  lines.push('      "reasonMarkdown": "Markdown explaining why",');
  lines.push('      "evidence": ["short evidence strings"]');
  lines.push('    }');
  lines.push('  ]');
  lines.push('}');
  lines.push('Every input comment must appear exactly once in `results`.');
  return lines.join('\n');
}

function formatLineRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return '';
  if (start !== null && end !== null && start !== end) return `${String(start)}-${String(end)}`;
  return String(start ?? end ?? '');
}

function formatNullable(value: boolean | null): string {
  if (value === null) return 'null';
  return value ? 'true' : 'false';
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export type ResolveJudgementCommentKeyHelper = ResolveJudgementCommentKey;
