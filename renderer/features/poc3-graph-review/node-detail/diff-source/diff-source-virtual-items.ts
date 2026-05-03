import type { NodeDetailSnapshot } from '../../../../../shared/poc3-contracts/graph-review-ipc';
import type { DiffAwareSourceLine } from '../diff-aware-source-model';
import { awareLineLookupKey, providerLineNumberForAwareLine } from '../utils/aware-line-lookup';

export type DiffSourceVirtualItem =
  | { kind: 'expand-up'; key: 'expand-up' }
  | { kind: 'overview-findings'; key: 'overview-findings' }
  | { kind: 'source-line'; key: string; line: DiffAwareSourceLine }
  | { kind: 'expand-down'; key: 'expand-down' };

export interface DiffSourceLineMeta {
  lookupKey: string;
  providerLineNumber: number | null;
  findings: NodeDetailSnapshot['findings'];
  remoteThreads: NodeDetailSnapshot['threads']['remote'];
}

export interface BuildDiffSourceVirtualItemsInput {
  lines: DiffAwareSourceLine[];
  canExpandUp: boolean;
  canExpandDown: boolean;
  includeOverviewFindings: boolean;
}

export interface DiffSourceVirtualItemsModel {
  items: DiffSourceVirtualItem[];
  sourceItemIndexByLineKey: Map<string, number>;
  sourceItemIndexByProviderLocation: Map<string, number>;
  firstNewLineItemIndexByLineNumber: Map<number, number>;
}

export function buildDiffSourceVirtualItems({
  lines,
  canExpandUp,
  canExpandDown,
  includeOverviewFindings,
}: BuildDiffSourceVirtualItemsInput): DiffSourceVirtualItemsModel {
  const items: DiffSourceVirtualItem[] = [];
  const sourceItemIndexByLineKey = new Map<string, number>();
  const sourceItemIndexByProviderLocation = new Map<string, number>();
  const firstNewLineItemIndexByLineNumber = new Map<number, number>();

  if (canExpandUp) {
    items.push({ kind: 'expand-up', key: 'expand-up' });
  }
  if (includeOverviewFindings) {
    items.push({ kind: 'overview-findings', key: 'overview-findings' });
  }

  for (const line of lines) {
    const index = items.length;
    items.push({ kind: 'source-line', key: line.key, line });
    sourceItemIndexByLineKey.set(line.key, index);

    const providerLineNumber = providerLineNumberForAwareLine(line);
    if (line.side !== null && providerLineNumber !== null) {
      sourceItemIndexByProviderLocation.set(`${line.side}:${providerLineNumber}`, index);
    }
    if (line.newLineNumber !== null && !firstNewLineItemIndexByLineNumber.has(line.newLineNumber)) {
      firstNewLineItemIndexByLineNumber.set(line.newLineNumber, index);
    }
  }

  if (canExpandDown) {
    items.push({ kind: 'expand-down', key: 'expand-down' });
  }

  return {
    items,
    sourceItemIndexByLineKey,
    sourceItemIndexByProviderLocation,
    firstNewLineItemIndexByLineNumber,
  };
}

export function buildLineMetaByKey({
  lines,
  findingsByLine,
  remoteByLine,
}: {
  lines: DiffAwareSourceLine[];
  findingsByLine: Map<string, NodeDetailSnapshot['findings']>;
  remoteByLine: Map<string, NodeDetailSnapshot['threads']['remote']>;
}): Map<string, DiffSourceLineMeta> {
  const metaByKey = new Map<string, DiffSourceLineMeta>();
  for (const line of lines) {
    const lookupKey = awareLineLookupKey(line);
    metaByKey.set(line.key, {
      lookupKey,
      providerLineNumber: providerLineNumberForAwareLine(line),
      findings: findingsByLine.get(lookupKey) ?? [],
      remoteThreads: remoteByLine.get(lookupKey) ?? [],
    });
  }
  return metaByKey;
}

export function isLineInActiveSelection(
  line: DiffAwareSourceLine,
  activeSelection: {
    side: 'LEFT' | 'RIGHT';
    startLine: number;
    endLine: number;
  } | null,
  providerLineNumber: number | null,
): boolean {
  return (
    activeSelection !== null &&
    providerLineNumber !== null &&
    line.side === activeSelection.side &&
    providerLineNumber >= activeSelection.startLine &&
    providerLineNumber <= activeSelection.endLine
  );
}
