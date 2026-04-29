import type { RevisionCommitView } from '../../../../shared/poc3-domain/revision-commit';

export const COMMIT_LIST_INITIAL_VISIBLE_COUNT = 12;

export function visibleCommitRows(
  commits: RevisionCommitView[],
  showAll: boolean,
): RevisionCommitView[] {
  return showAll ? commits : commits.slice(0, COMMIT_LIST_INITIAL_VISIBLE_COUNT);
}

export function shortRevisionSha(value: string | null): string {
  return value ? value.slice(0, 7) : '-------';
}
