import type { AgentKind, AppSession } from './agent';
import type { ReviewAnchor } from './review';

export type DiffInteractionMode = 'comment' | 'mention';

export interface ReviewSelectionContext {
  snapshotId: string;
  fileId: string;
  filePath: string;
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  anchor: ReviewAnchor;
  selectedExcerpt: string;
  surroundingExcerpt: string | null;
  nearbyRemoteThreadIds: string[];
  nearbyDraftThreadIds: string[];
}

export interface ReviewMentionMessage {
  localMessageId: string;
  mentionThreadId: string;
  role: 'assistant' | 'user';
  source: 'initial-question' | 'user-reply' | 'agent-reply';
  body: string;
  createdAt: string;
}

export interface ReviewMentionBinding {
  snapshotId: string;
  mentionThreadId: string;
  reviewAgent: AgentKind;
  discussionAppSessionId: string;
  strategy: 'selection-context-session';
  createdAt: string;
  lastUsedAt: string;
}

export interface ReviewMentionThread {
  mentionThreadId: string;
  snapshotId: string;
  reviewAgent: AgentKind;
  selection: ReviewSelectionContext;
  messages: ReviewMentionMessage[];
  binding: ReviewMentionBinding | null;
  replyStatus: 'idle' | 'replying' | 'failed' | 'promoted';
  lastError: string | null;
  activeSessionId: string | null;
  activeSession: AppSession | null;
  promotedDraftThreadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewMentionRecord {
  mentionId: string;
  snapshotId: string;
  mentionThreadId: string;
  appSessionId: string;
  userMessageId: string;
  createdAt: string;
}
