import { describe, expect, it } from 'vitest';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';
import { buildDiffSourceVirtualItems, hasOverviewFindings } from './diff-source-virtual-items';

describe('buildDiffSourceVirtualItems', () => {
  const lines: DiffAwareSourceLine[] = [
    line({ key: 'removed:1', side: 'LEFT', oldLineNumber: 10, newLineNumber: null }),
    line({ key: 'context:1', side: 'RIGHT', oldLineNumber: 11, newLineNumber: 20 }),
    line({ key: 'unchanged:21', side: null, oldLineNumber: null, newLineNumber: 21 }),
    line({ key: 'added:1', side: 'RIGHT', oldLineNumber: null, newLineNumber: 22 }),
  ];

  it('keeps source-line indexes stable with optional expand and overview items', () => {
    const model = buildDiffSourceVirtualItems({
      lines,
      canExpandUp: true,
      canExpandDown: true,
      includeOverviewFindings: true,
    });

    expect(model.items.map((item) => item.kind)).toEqual([
      'expand-up',
      'overview-findings',
      'source-line',
      'source-line',
      'source-line',
      'source-line',
      'expand-down',
    ]);
    expect(model.sourceItemIndexByLineKey.get('removed:1')).toBe(2);
    expect(model.sourceItemIndexByLineKey.get('added:1')).toBe(5);
  });

  it('maps provider locations by LEFT and RIGHT line numbers', () => {
    const model = buildDiffSourceVirtualItems({
      lines,
      canExpandUp: false,
      canExpandDown: false,
      includeOverviewFindings: false,
    });

    expect(model.sourceItemIndexByProviderLocation.get('LEFT:10')).toBe(0);
    expect(model.sourceItemIndexByProviderLocation.get('RIGHT:20')).toBe(1);
    expect(model.sourceItemIndexByProviderLocation.get('RIGHT:22')).toBe(3);
    expect(model.sourceItemIndexByProviderLocation.has('LINE:21')).toBe(false);
  });

  it('maps first new-line occurrence for function-start scrolling', () => {
    const model = buildDiffSourceVirtualItems({
      lines,
      canExpandUp: true,
      canExpandDown: false,
      includeOverviewFindings: false,
    });

    expect(model.firstNewLineItemIndexByLineNumber.get(20)).toBe(2);
    expect(model.firstNewLineItemIndexByLineNumber.get(21)).toBe(3);
    expect(model.firstNewLineItemIndexByLineNumber.has(10)).toBe(false);
  });
});

describe('hasOverviewFindings', () => {
  it('ignores line-scoped findings', () => {
    expect(
      hasOverviewFindings([{ findingId: 'line-finding', line: 42 }] as Parameters<
        typeof hasOverviewFindings
      >[0]),
    ).toBe(false);
  });

  it('detects overview findings without a line anchor', () => {
    expect(
      hasOverviewFindings([{ findingId: 'overview-finding', line: null }] as Parameters<
        typeof hasOverviewFindings
      >[0]),
    ).toBe(true);
  });
});

function line(
  overrides: Pick<DiffAwareSourceLine, 'key' | 'side' | 'oldLineNumber' | 'newLineNumber'>,
): DiffAwareSourceLine {
  return {
    key: overrides.key,
    kind: overrides.side === 'LEFT' ? 'removed' : 'context',
    filePath: 'src/example.ts',
    oldLineNumber: overrides.oldLineNumber,
    newLineNumber: overrides.newLineNumber,
    displayLineNumber: overrides.newLineNumber ?? overrides.oldLineNumber,
    side: overrides.side,
    text: 'const value = 1;',
    selectableForProviderComment: overrides.side !== null,
    selectableForAgentMention: true,
    inSourceRange: true,
    inDiffHunk: true,
  };
}
