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
  codexModel?: string;
  codexReasoningEffort?: string;
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
    }
  | {
      type: 'agent-review.thread-reply.started';
      binding: Poc3AgentThreadBinding;
      reply: Poc3AgentThreadReplyRecord;
      userMessage: Poc3AgentThreadMessage;
      conversation: Poc3AgentThreadConversation;
    }
  | {
      type: 'agent-review.thread-reply.session';
      reviewWorkspaceId: string;
      revisionId: string;
      localThreadId: string;
      replyId: string;
      session: import('../contracts/agent-ipc').AgentSessionSnapshot;
      agentEvent: import('../contracts/agent-ipc').AgentEventPayload;
    }
  | {
      type: 'agent-review.thread-reply.completed';
      reviewWorkspaceId: string;
      revisionId: string;
      localThreadId: string;
      replyId: string;
      conversation: Poc3AgentThreadConversation;
    }
  | {
      type: 'agent-review.thread-reply.failed';
      reviewWorkspaceId: string;
      revisionId: string;
      localThreadId: string;
      replyId: string;
      message: string;
    };

export type Poc3AgentThreadReplyStatus = 'idle' | 'replying' | 'failed';

export type Poc3AgentThreadMessageRole = 'assistant' | 'user';

export type Poc3AgentThreadMessageSource = 'initial-finding' | 'user-reply' | 'agent-reply';

export interface Poc3AgentThreadMessage {
  localMessageId: string;
  localThreadId: string;
  role: Poc3AgentThreadMessageRole;
  source: Poc3AgentThreadMessageSource;
  body: string;
  createdAt: string;
}

export type Poc3AgentThreadBindingStrategy = 'codex-fork' | 'app-side-rehydrate';

export interface Poc3AgentThreadBinding {
  reviewWorkspaceId: string;
  revisionId: string;
  localThreadId: string;
  runId: string;
  rootAppSessionId: string;
  discussionAppSessionId: string;
  strategy: Poc3AgentThreadBindingStrategy;
  createdAt: string;
  lastUsedAt: string;
}

export interface Poc3AgentThreadReplyRecord {
  replyId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  localThreadId: string;
  appSessionId: string;
  userMessageId: string;
  createdAt: string;
}

export interface Poc3AgentThreadConversation {
  localThreadId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  runId: string;
  binding: Poc3AgentThreadBinding | null;
  replyStatus: Poc3AgentThreadReplyStatus;
  lastError: string | null;
  activeReplySessionId: string | null;
  messages: Poc3AgentThreadMessage[];
}
