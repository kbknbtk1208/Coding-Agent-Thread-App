import type { ReviewSnapshot, ReviewSnapshotFile } from '../../shared/domain/review';
import type {
  ReviewLocalThread,
  ReviewRunRecord,
  ReviewSummaryDraft,
} from '../../shared/domain/review-draft';

const DEFAULT_EXCERPT_RADIUS = 10;

export interface ReviewThreadContextInput {
  snapshot: ReviewSnapshot;
  run: ReviewRunRecord;
  summary: ReviewSummaryDraft | null;
  thread: ReviewLocalThread;
  userReply: string;
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
}

export interface ReviewThreadContextAssembly {
  initialPrompt: string;
  followUpPrompt: string;
}

export class ReviewThreadContextAssembler {
  async build(input: ReviewThreadContextInput): Promise<ReviewThreadContextAssembly> {
    const finding = input.thread.draft;
    const location = formatLocation(input.thread);
    const excerpt = await this.buildExcerpt(input);
    const summaryLines = input.summary
      ? [`- headline: ${input.summary.headline}`, `- overview: ${input.summary.overview}`]
      : ['- summary unavailable'];
    const history = input.thread.messages.length
      ? input.thread.messages.map((message, index) =>
          formatMessage(index + 1, message.role, message.body),
        )
      : ['- No prior thread history'];
    const suggestion = finding.suggestion ? finding.suggestion : '(no explicit suggestion)';
    const baseSections = [
      'You are continuing a discussion about one specific finding from an automated PR review.',
      '',
      '## Review',
      `- title: ${input.snapshot.title}`,
      `- reviewId: ${input.snapshot.reviewId}`,
      `- provider: ${input.snapshot.provider}`,
      `- runId: ${input.run.runId}`,
      '',
      '## Summary',
      ...summaryLines,
      '',
      '## Target Finding',
      `- title: ${finding.title}`,
      `- severity: ${finding.severity}`,
      `- category: ${finding.category}`,
      `- confidence: ${finding.confidence}`,
      `- location: ${location}`,
      '',
      '### Finding body',
      finding.draftBody,
      '',
      '### Suggested fix',
      suggestion,
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
        'This is the first thread reply for this finding. 最初の finding thread reply です。',
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

  private async buildExcerpt(input: ReviewThreadContextInput): Promise<string | null> {
    if (input.thread.draft.resolvedLocation.kind !== 'diff') {
      return null;
    }

    const resolvedLocation = input.thread.draft.resolvedLocation;
    let file =
      input.snapshot.files.find((candidate) => candidate.fileId === resolvedLocation.fileId) ??
      null;
    if (!file) {
      return null;
    }

    if (file.contentStatus !== 'loaded' && input.hydrateFile) {
      try {
        file = await input.hydrateFile(file.fileId);
      } catch {
        return null;
      }
    }

    if (file.contentStatus !== 'loaded' || file.isBinary || file.isLargeDiff) {
      return null;
    }

    const anchorLine = resolvedLocation.startLine ?? resolvedLocation.endLine;
    if (anchorLine === null) {
      return null;
    }

    const content = resolvedLocation.side === 'old' ? file.oldContent : file.newContent;
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) {
      return null;
    }

    const startLine = Math.max(1, anchorLine - DEFAULT_EXCERPT_RADIUS);
    const endLine = Math.min(lines.length, anchorLine + DEFAULT_EXCERPT_RADIUS);
    const excerptLines = lines.slice(startLine - 1, endLine).map((line, index) => {
      const lineNumber = String(startLine + index).padStart(4, ' ');
      return `${lineNumber} | ${line}`;
    });

    return [
      `file: ${file.filePath}`,
      `side: ${resolvedLocation.side}`,
      '```text',
      ...excerptLines,
      '```',
    ].join('\n');
  }
}

function formatLocation(thread: ReviewLocalThread): string {
  const location = thread.draft.resolvedLocation;
  if (location.kind === 'overview') {
    return 'overview';
  }

  const lineLabel =
    location.startLine !== null &&
    location.endLine !== null &&
    location.startLine !== location.endLine
      ? `L${String(location.startLine)}-L${String(location.endLine)}`
      : `L${String(location.endLine ?? location.startLine ?? '?')}`;
  return `${location.filePath} ${lineLabel} [${location.side}]`;
}

function formatMessage(index: number, role: 'assistant' | 'user', body: string): string {
  return `${String(index)}. ${role === 'assistant' ? 'assistant' : 'user'}: ${body}`;
}
