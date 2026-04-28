import type { AgentKind, StructuredResultSource } from '../domain/agent';
import type {
  DiffDowngradeReason,
  ReviewFindingCategory,
  ReviewFindingConfidence,
  ReviewFindingSeverity,
  ReviewSummaryDraft,
} from '../domain/review-draft';

export type Poc3AgentReviewRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'fallback_rich_text'
  | 'failed';

export interface Poc3AgentReviewRun {
  runId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  scopeKey: string;
  reviewAgent: AgentKind;
  lensId: string;
  instructions: string;
  rootAppSessionId: string;
  status: Poc3AgentReviewRunStatus;
  resultSource: StructuredResultSource | 'richText';
  createdAt: string;
  completedAt: string | null;
}

export type Poc3AgentReviewLocation =
  | {
      kind: 'diff';
      filePath: string;
      startLine: number | null;
      endLine: number | null;
      side: 'old' | 'new';
    }
  | {
      kind: 'node';
      nodeId: string;
      filePath: string | null;
      startLine: number | null;
      endLine: number | null;
    }
  | {
      kind: 'overview';
    };

export interface Poc3AgentReviewDebugDowngrade {
  reason: DiffDowngradeReason | 'nodeNotFound';
  requestedFilePath: string | null;
  requestedSide: 'old' | 'new' | null;
  requestedStartLine: number | null;
  requestedEndLine: number | null;
}

export interface Poc3AgentReviewThread {
  localThreadId: string;
  runId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  findingId: string;
  nodeId: string | null;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  title: string;
  draftBody: string;
  suggestion?: string;
  location: Poc3AgentReviewLocation;
  status: 'open' | 'dismissed';
  debugDowngrade?: Poc3AgentReviewDebugDowngrade;
  createdAt: string;
  updatedAt: string;
}

export type Poc3AgentReviewEnvelope =
  | {
      kind: 'structured';
      run: Poc3AgentReviewRun;
      summary: ReviewSummaryDraft;
      threads: Poc3AgentReviewThread[];
    }
  | {
      kind: 'fallback-richText';
      run: Poc3AgentReviewRun;
      content: string;
      reason: 'structuredParseFailed' | 'schemaValidationFailed' | 'emptyResponse';
    };

export type Poc3AgentReviewEvent =
  | {
      type: 'agent-review.started';
      run: Poc3AgentReviewRun;
      session: import('../contracts/agent-ipc').AgentSessionSnapshot;
    }
  | {
      type: 'agent-review.session';
      run: Poc3AgentReviewRun;
      session: import('../contracts/agent-ipc').AgentSessionSnapshot;
      agentEvent: import('../contracts/agent-ipc').AgentEventPayload;
    }
  | {
      type: 'agent-review.completed';
      envelope: Poc3AgentReviewEnvelope;
    }
  | {
      type: 'agent-review.failed';
      run: Poc3AgentReviewRun;
      message: string;
    };
