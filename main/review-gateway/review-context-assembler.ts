import type { ReviewSnapshot } from '../../shared/domain/review';
import { REVIEW_DRAFT_EXCERPT_PROMPT } from '../../shared/domain/review-draft';

const DEFAULT_MAX_PROMPT_CHARS = 14000;
const DEFAULT_MAX_PATCH_SECTION_CHARS = 6500;
const DEFAULT_MAX_DISCUSSION_ITEMS = 6;

export interface ReviewContextAssemblerInput {
  snapshot: ReviewSnapshot;
  instructions: string;
  lensId: string;
}

export interface ReviewContextAssembly {
  prompt: string;
  omittedFiles: string[];
}

interface ReviewContextAssemblerOptions {
  maxPromptChars?: number;
  maxPatchSectionChars?: number;
  maxDiscussionItems?: number;
}

export class ReviewContextAssembler {
  constructor(private readonly options: ReviewContextAssemblerOptions = {}) {}

  build(input: ReviewContextAssemblerInput): ReviewContextAssembly {
    const fileSummaries = input.snapshot.files.map((file) =>
      [
        `- ${file.filePath}`,
        `change=${file.changeType}`,
        `+${String(file.additions)}/-${String(file.deletions)}`,
        `largeDiff=${String(file.isLargeDiff)}`,
        `binary=${String(file.isBinary)}`,
      ].join(' | '),
    );

    const sortedPatchFiles = [...input.snapshot.files].sort(
      (left, right) => right.additions + right.deletions - (left.additions + left.deletions),
    );

    const patchSections: Array<{ filePath: string; section: string }> = [];
    const omittedFiles: string[] = [];
    let patchChars = 0;
    const maxPatchSectionChars =
      this.options.maxPatchSectionChars ?? DEFAULT_MAX_PATCH_SECTION_CHARS;

    for (const file of sortedPatchFiles) {
      if (file.isBinary || file.isLargeDiff || !file.patch) {
        omittedFiles.push(file.filePath);
        continue;
      }

      const nextSection = [`## File: ${file.filePath}`, '```diff', file.patch.trim(), '```'].join(
        '\n',
      );

      if (patchChars + nextSection.length > maxPatchSectionChars) {
        omittedFiles.push(file.filePath);
        continue;
      }

      patchSections.push({
        filePath: file.filePath,
        section: nextSection,
      });
      patchChars += nextSection.length;
    }

    const discussionSummary = input.snapshot.discussions
      .slice(0, this.options.maxDiscussionItems ?? DEFAULT_MAX_DISCUSSION_ITEMS)
      .map((thread, index) => {
        const firstComment = thread.comments[0];
        const scope =
          thread.location.kind === 'diff'
            ? `${thread.location.filePath}:${thread.location.startLine ?? '-'}`
            : 'overview';
        return `${String(index + 1)}. [${scope}] ${firstComment?.body ?? '(empty)'}`;
      });

    const sections = [
      'あなたは pull request / merge request のレビュー草案を作成する reviewer です。',
      'Structured schema: review-draft',
      '',
      '## Review Target',
      `- snapshotId: ${input.snapshot.snapshotId}`,
      `- title: ${input.snapshot.title}`,
      `- baseSha: ${input.snapshot.baseSha}`,
      `- headSha: ${input.snapshot.headSha}`,
      `- lensId: ${input.lensId}`,
      '',
      '## Description',
      input.snapshot.description || '(no description)',
      '',
      '## Changed Files',
      ...fileSummaries,
      '',
      '## Existing Discussion Summary',
      ...(discussionSummary.length > 0
        ? discussionSummary
        : ['- existing discussion はありません']),
      '',
      '## User Instructions',
      input.instructions.trim() || '一般的なレビュー観点でレビューしてください。',
      '',
      '## Review Rules',
      '- If line or filePath is uncertain, use location.kind = overview.',
      '- 存在しない filePath を作らないこと',
      '- Files marked large-diff or binary may only receive overview findings.',
      '- omitted files may only receive overview findings.',
      '- 同じ論点を重複して分割しすぎないこと',
      '- diff finding の startLine/endLine は該当 file の changed-side (new or old) における 1-based line number を使うこと',
      `- ${REVIEW_DRAFT_EXCERPT_PROMPT}`,
      '',
      '## Patch Excerpts',
      ...(patchSections.length > 0
        ? patchSections.map((item) => item.section)
        : ['- patch excerpt は含めていません']),
      '',
      '## Omitted files due to prompt budget:',
      ...(omittedFiles.length > 0 ? omittedFiles.map((filePath) => `- ${filePath}`) : ['- なし']),
    ];

    let prompt = sections.join('\n');
    const maxPromptChars = this.options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;
    while (prompt.length > maxPromptChars && patchSections.length > 0) {
      const removed = patchSections.pop();
      if (removed) {
        omittedFiles.unshift(removed.filePath);
      }

      const nextSections = [
        'あなたは pull request / merge request のレビュー草案を作成する reviewer です。',
        'Structured schema: review-draft',
        '',
        '## Review Target',
        `- snapshotId: ${input.snapshot.snapshotId}`,
        `- title: ${input.snapshot.title}`,
        `- baseSha: ${input.snapshot.baseSha}`,
        `- headSha: ${input.snapshot.headSha}`,
        `- lensId: ${input.lensId}`,
        '',
        '## Description',
        input.snapshot.description || '(no description)',
        '',
        '## Changed Files',
        ...fileSummaries,
        '',
        '## Existing Discussion Summary',
        ...(discussionSummary.length > 0
          ? discussionSummary
          : ['- existing discussion はありません']),
        '',
        '## User Instructions',
        input.instructions.trim() || '一般的なレビュー観点でレビューしてください。',
        '',
        '## Review Rules',
        '- If line or filePath is uncertain, use location.kind = overview.',
        '- 存在しない filePath を作らないこと',
        '- Files marked large-diff or binary may only receive overview findings.',
        '- omitted files may only receive overview findings.',
        '- 同じ論点を重複して分割しすぎないこと',
        '- diff finding の startLine/endLine は該当 file の changed-side (new or old) における 1-based line number を使うこと',
        `- ${REVIEW_DRAFT_EXCERPT_PROMPT}`,
        '',
        '## Patch Excerpts',
        ...(patchSections.length > 0
          ? patchSections.map((item) => item.section)
          : ['- patch excerpt は含めていません']),
        '',
        '## Omitted files due to prompt budget:',
        ...(omittedFiles.length > 0 ? omittedFiles.map((filePath) => `- ${filePath}`) : ['- なし']),
      ];
      prompt = nextSections.join('\n');
    }

    if (prompt.length > maxPromptChars) {
      prompt = [
        'あなたは pull request / merge request のレビュー草案を作成する reviewer です。',
        'Structured schema: review-draft',
        '',
        '## Review Target',
        `- snapshotId: ${input.snapshot.snapshotId}`,
        `- title: ${input.snapshot.title}`,
        `- lensId: ${input.lensId}`,
        '',
        '## User Instructions',
        input.instructions.trim() || '一般的なレビュー観点でレビューしてください。',
        '',
        '## Omitted files due to prompt budget:',
        ...(omittedFiles.length > 0 ? omittedFiles.map((filePath) => `- ${filePath}`) : ['- なし']),
        '',
        '[truncated to fit prompt budget]',
      ].join('\n');
    }

    return {
      prompt,
      omittedFiles,
    };
  }

  assemble(input: ReviewContextAssemblerInput): ReviewContextAssembly {
    return this.build(input);
  }
}
