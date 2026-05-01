import fs from 'fs';
import path from 'path';
import type {
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
  Poc3AgentThreadMessage,
} from '../../../shared/poc3-domain/agent-review';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';

const DEFAULT_EXCERPT_RADIUS = 10;

export interface Poc3AgentReviewThreadContextInput {
  run: Poc3AgentReviewRun;
  thread: Poc3AgentReviewThread;
  history: Poc3AgentThreadMessage[];
  userReply: string;
  workspaceTitle: string;
  record: WorkspaceGraphRecord;
  sourceSnapshot: ReviewSourceSnapshot | null;
}

export interface Poc3AgentReviewThreadContextAssembly {
  initialPrompt: string;
  followUpPrompt: string;
}

export class Poc3AgentReviewThreadContextAssembler {
  build(input: Poc3AgentReviewThreadContextInput): Poc3AgentReviewThreadContextAssembly {
    const excerpt = buildFileExcerpt(input.thread, input.record);
    const history = input.history.length
      ? input.history.map((message, index) => formatMessage(index + 1, message.role, message.body))
      : ['- No prior thread history'];
    const location = formatLocation(input.thread);
    const baseSections = [
      'You are continuing a discussion about one specific finding from a graph-based automated review.',
      '',
      '## Review workspace',
      `- title: ${input.workspaceTitle}`,
      `- reviewWorkspaceId: ${input.run.reviewWorkspaceId}`,
      `- revisionId: ${input.run.revisionId}`,
      `- runId: ${input.run.runId}`,
      '',
      '## Review instructions',
      input.run.instructions.trim() || 'Prioritize correctness, tests, and maintainability.',
      '',
      '## Target finding',
      `- title: ${input.thread.title}`,
      `- severity: ${input.thread.severity}`,
      `- category: ${input.thread.category}`,
      `- confidence: ${input.thread.confidence}`,
      `- location: ${location}`,
      '',
      '### Finding body',
      input.thread.draftBody,
      '',
      '### Suggested fix',
      input.thread.suggestion?.trim() || '(no explicit suggestion)',
      '',
      '## Thread history',
      ...history,
      '',
      ...(excerpt ? ['## File excerpt', excerpt, ''] : []),
      '## New user reply',
      input.userReply.trim(),
      '',
      '## Reply rules',
      '- Answer only about this finding and this thread.',
      '- Do not introduce other findings or the full review context.',
      '- If you change your prior assessment, explain why.',
      '- Return natural Markdown reply text only.',
      '- Do not re-infer or invent locations.',
    ];

    return {
      initialPrompt: [
        'This is the first reply in this finding thread. 最初の finding thread reply です。',
        '',
        ...baseSections,
      ].join('\n'),
      followUpPrompt: [
        'Continue the same finding discussion. 同じ finding thread の会話を継続してください。',
        '',
        ...baseSections,
      ].join('\n'),
    };
  }
}

function buildFileExcerpt(
  thread: Poc3AgentReviewThread,
  record: WorkspaceGraphRecord,
): string | null {
  if (thread.location.kind !== 'diff' && thread.location.kind !== 'node') {
    return null;
  }
  const filePath = thread.location.filePath;
  if (!filePath) {
    return null;
  }
  const anchorLine = thread.location.startLine ?? thread.location.endLine;
  if (anchorLine === null) {
    return null;
  }
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(record.workspace.worktreePath, filePath);
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  const startLine = Math.max(1, anchorLine - DEFAULT_EXCERPT_RADIUS);
  const endLine = Math.min(lines.length, anchorLine + DEFAULT_EXCERPT_RADIUS);
  const excerptLines = lines.slice(startLine - 1, endLine).map((line, index) => {
    const lineNumber = String(startLine + index).padStart(4, ' ');
    return `${lineNumber} | ${line}`;
  });

  return [`file: ${filePath}`, '```text', ...excerptLines, '```'].join('\n');
}

function formatLocation(thread: Poc3AgentReviewThread): string {
  const location = thread.location;
  if (location.kind === 'overview') {
    return 'overview';
  }
  const lineLabel =
    location.startLine !== null &&
    location.endLine !== null &&
    location.startLine !== location.endLine
      ? `L${String(location.startLine)}-L${String(location.endLine)}`
      : `L${String(location.endLine ?? location.startLine ?? '?')}`;
  return `${location.filePath ?? '(unknown file)'} ${lineLabel}${
    location.kind === 'diff' ? ` [${location.side}]` : ''
  }`;
}

function formatMessage(index: number, role: 'assistant' | 'user', body: string): string {
  return `${String(index)}. ${role}: ${body}`;
}
