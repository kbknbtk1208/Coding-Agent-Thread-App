import {
  deriveAnchorKind,
  isDiffLocation,
  type ReviewSnapshot,
  type ReviewSnapshotFile,
} from '../../shared/domain/review';
import type { AgentKind } from '../../shared/domain/agent';
import type { ReviewSummaryDraft, ReviewLocalThread } from '../../shared/domain/review-draft';
import type { ReviewSelectionContext } from '../../shared/domain/review-mention';

const MAX_SELECTION_LINES = 30;
const CONTEXT_RADIUS = 10;
const MAX_SELECTED_EXCERPT_CHARS = 1200;
const MAX_NEARBY_ITEMS = 4;

export interface ReviewSelectionContextAssemblerInput {
  snapshot: ReviewSnapshot;
  reviewAgent: AgentKind;
  fileId: string;
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  question: string;
  latestSummary?: ReviewSummaryDraft | null;
  localDraftThreads?: ReviewLocalThread[];
  hydrateFile?: (fileId: string) => Promise<ReviewSnapshotFile>;
}

export interface ReviewSelectionContextAssembly {
  selection: ReviewSelectionContext;
  initialPrompt: string;
  followUpPrompt: string;
}

interface ResolvedRange {
  startLine: number;
  endLine: number;
}

export class ReviewSelectionContextAssembler {
  async build(
    input: ReviewSelectionContextAssemblerInput,
  ): Promise<ReviewSelectionContextAssembly> {
    const question = input.question.trim();
    if (!question) {
      throw new Error('Selection mention question is required.');
    }

    const file = await this.resolveFile(input);
    const range = this.normalizeAndValidateRange(input.startLine, input.endLine);
    this.validateFile(file, input.side);

    const lines = splitLines(input.side === 'old' ? file.oldContent : file.newContent);
    if (range.endLine > lines.length) {
      throw new Error('Selection range is outside the loaded file content.');
    }

    const selectedExcerpt = truncateText(
      formatLineExcerpt(lines, range.startLine, range.endLine),
      MAX_SELECTED_EXCERPT_CHARS,
    );
    const surroundingStart = Math.max(1, range.startLine - CONTEXT_RADIUS);
    const surroundingEnd = Math.min(lines.length, range.endLine + CONTEXT_RADIUS);
    const surroundingExcerpt =
      surroundingStart < range.startLine || surroundingEnd > range.endLine
        ? formatLineExcerpt(lines, surroundingStart, surroundingEnd)
        : null;

    const anchor = {
      fileId: file.fileId,
      filePath: file.filePath,
      startLine: range.startLine,
      endLine: range.endLine,
      side: input.side,
      kind: deriveAnchorKind(range.startLine, range.endLine),
    };

    const nearbyRemoteThreadIds = input.snapshot.discussions
      .filter((thread) => {
        if (!isDiffLocation(thread.location)) {
          return false;
        }
        return (
          thread.location.fileId === file.fileId &&
          thread.location.side === input.side &&
          rangesOverlap(
            normalizeNullableRange(thread.location.startLine, thread.location.endLine),
            range,
          )
        );
      })
      .slice(0, MAX_NEARBY_ITEMS)
      .map((thread) => thread.threadId);

    const nearbyDraftThreadIds = (input.localDraftThreads ?? [])
      .filter((thread) => {
        const draftAnchor = thread.draft.anchor;
        if (!draftAnchor) {
          return false;
        }
        return (
          draftAnchor.fileId === file.fileId &&
          draftAnchor.side === input.side &&
          rangesOverlap(normalizeNullableRange(draftAnchor.startLine, draftAnchor.endLine), range)
        );
      })
      .slice(0, MAX_NEARBY_ITEMS)
      .map((thread) => thread.localThreadId);

    const selection: ReviewSelectionContext = {
      snapshotId: input.snapshot.snapshotId,
      fileId: file.fileId,
      filePath: file.filePath,
      side: input.side,
      startLine: range.startLine,
      endLine: range.endLine,
      anchor,
      selectedExcerpt,
      surroundingExcerpt,
      nearbyRemoteThreadIds,
      nearbyDraftThreadIds,
    };

    return {
      selection,
      initialPrompt: buildPrompt({
        snapshot: input.snapshot,
        selection,
        question,
        latestSummary: input.latestSummary ?? null,
        reviewAgent: input.reviewAgent,
        isFollowUp: false,
      }),
      followUpPrompt: buildPrompt({
        snapshot: input.snapshot,
        selection,
        question,
        latestSummary: input.latestSummary ?? null,
        reviewAgent: input.reviewAgent,
        isFollowUp: true,
      }),
    };
  }

  assemble(input: ReviewSelectionContextAssemblerInput): Promise<ReviewSelectionContextAssembly> {
    return this.build(input);
  }

  private async resolveFile(
    input: ReviewSelectionContextAssemblerInput,
  ): Promise<ReviewSnapshotFile> {
    const file = input.snapshot.files.find((candidate) => candidate.fileId === input.fileId);
    if (!file) {
      throw new Error(`File not found: ${input.fileId}`);
    }
    if (file.contentStatus === 'loaded') {
      return file;
    }
    if (!input.hydrateFile) {
      throw new Error('Selection mention requires loaded file content.');
    }
    const hydrated = await input.hydrateFile(file.fileId);
    if (hydrated.contentStatus !== 'loaded') {
      throw new Error('Selection mention requires loaded file content.');
    }
    return hydrated;
  }

  private normalizeAndValidateRange(startLine: number, endLine: number): ResolvedRange {
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < 1
    ) {
      throw new Error('Selection range must use positive line numbers.');
    }

    const range =
      startLine <= endLine ? { startLine, endLine } : { startLine: endLine, endLine: startLine };
    if (range.endLine - range.startLine + 1 > MAX_SELECTION_LINES) {
      throw new Error('Selection range is too large. Please select 30 lines or fewer.');
    }
    return range;
  }

  private validateFile(file: ReviewSnapshotFile, side: 'old' | 'new'): void {
    if (file.isBinary) {
      throw new Error('Binary files cannot be used for selection mention.');
    }
    if (file.isLargeDiff) {
      throw new Error('Large diff files cannot be used for selection mention.');
    }
    if (file.changeType === 'added' && side === 'old') {
      throw new Error('Added files only support the new side.');
    }
    if (file.changeType === 'deleted' && side === 'new') {
      throw new Error('Deleted files only support the old side.');
    }
  }
}

function buildPrompt(input: {
  snapshot: ReviewSnapshot;
  selection: ReviewSelectionContext;
  question: string;
  latestSummary: ReviewSummaryDraft | null;
  reviewAgent: AgentKind;
  isFollowUp: boolean;
}): string {
  const lineLabel =
    input.selection.startLine === input.selection.endLine
      ? `L${String(input.selection.endLine)}`
      : `L${String(input.selection.startLine)}-L${String(input.selection.endLine)}`;

  return [
    input.isFollowUp
      ? 'あなたは選択範囲に紐づくレビュー相談 thread の続きに回答します。'
      : 'あなたは pull request / merge request の選択範囲に限定して回答する reviewer です。',
    '',
    '## Review Target',
    `- snapshotId: ${input.snapshot.snapshotId}`,
    `- title: ${input.snapshot.title}`,
    `- baseSha: ${input.snapshot.baseSha}`,
    `- headSha: ${input.snapshot.headSha}`,
    `- agent: ${input.reviewAgent}`,
    '',
    '## Selected Range',
    `- file: ${input.selection.filePath}`,
    `- side: ${input.selection.side}`,
    `- lines: ${lineLabel}`,
    '',
    '## Selected Excerpt',
    '```',
    input.selection.selectedExcerpt,
    '```',
    '',
    '## Surrounding Excerpt',
    input.selection.surroundingExcerpt
      ? ['```', input.selection.surroundingExcerpt, '```'].join('\n')
      : '(no surrounding excerpt)',
    '',
    '## Nearby Thread Ids',
    `- remote: ${formatIdList(input.selection.nearbyRemoteThreadIds)}`,
    `- draft: ${formatIdList(input.selection.nearbyDraftThreadIds)}`,
    '',
    '## Latest Review Summary',
    input.latestSummary
      ? [
          `- headline: ${input.latestSummary.headline}`,
          `- overview: ${input.latestSummary.overview}`,
        ].join('\n')
      : '(no review summary)',
    '',
    '## User Question',
    input.question,
    '',
    '## Reply Rules',
    '- この選択範囲と直接の影響範囲だけに答えること。',
    '- 存在しない file / line を捏造しないこと。',
    '- broader なコードベース探索を行った場合は、その旨を簡潔に明示すること。',
    '- コメント投稿用 payload や JSON ではなく自然な Markdown で返すこと。',
    '- 必要なら「指摘草案へ昇格した方がよい」と提案してよいが、自動投稿前提にしないこと。',
  ].join('\n');
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n');
}

function formatLineExcerpt(lines: string[], startLine: number, endLine: number): string {
  return lines
    .slice(startLine - 1, endLine)
    .map((line, index) => `L${String(startLine + index)}: ${line}`)
    .join('\n');
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}\n[truncated]`;
}

function normalizeNullableRange(
  startLine: number | null,
  endLine: number | null,
): ResolvedRange | null {
  const start = startLine ?? endLine;
  const end = endLine ?? startLine;
  if (!start || !end) {
    return null;
  }
  return start <= end ? { startLine: start, endLine: end } : { startLine: end, endLine: start };
}

function rangesOverlap(left: ResolvedRange | null, right: ResolvedRange): boolean {
  if (!left) {
    return false;
  }
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}

function formatIdList(ids: string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}
