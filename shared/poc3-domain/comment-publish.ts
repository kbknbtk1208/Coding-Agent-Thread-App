export type Poc3CommentPublishSourceKind = 'agent-finding' | 'manual-selection';

export type Poc3CommentReplySourceKind = 'remote-thread';

export interface Poc3InlineCommentAnchor {
  kind: 'diff';
  filePath: string;
  oldPath: string | null;
  side: 'LEFT' | 'RIGHT';
  startLine: number | null;
  endLine: number;
}

export interface Poc3PublishCommentSource {
  kind: Poc3CommentPublishSourceKind;
  localThreadId?: string;
  findingId?: string;
}

export interface Poc3PublishedCommentRecord {
  localPublishId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  source: Poc3PublishCommentSource | { kind: Poc3CommentReplySourceKind; providerThreadId: string };
  providerThreadId: string;
  providerCommentIds: string[];
  body: string;
  anchor: Poc3InlineCommentAnchor | null;
  createdAt: string;
}
