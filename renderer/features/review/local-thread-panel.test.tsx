import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReviewThreadDraft } from '../../../shared/domain/review-draft';
import { LocalThreadPanel } from './local-thread-panel';

function createBaseThread(): ReviewThreadDraft {
  return {
    localThreadId: 'thread-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    findingId: 'finding-1',
    source: 'ai-review',
    state: 'draft',
    severity: 'medium',
    category: 'maintainability',
    confidence: 'high',
    title: 'Thread title',
    draftBody: 'Thread body',
    resolvedLocation: {
      kind: 'overview',
    },
    anchor: null,
  };
}

describe('LocalThreadPanel', () => {
  it('renders the debug fallback explanation for downgraded overview findings', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[
          {
            ...createBaseThread(),
            debugDowngrade: {
              reason: 'excerptNotFound',
              requestedFilePath: 'src/example.ts',
              requestedSide: 'new',
              requestedStartLine: 10,
              requestedEndLine: 12,
            },
          },
        ]}
        selectedFileId={null}
        onSelectFile={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).toContain('Debug: diff to overview fallback');
    expect(html).toContain('requested excerpt が対象 side の本文に一致しませんでした。');
    expect(html).toContain('requested diff: src/example.ts [new] L10-L12');
  });

  it('does not render the debug fallback block for ordinary overview findings', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[createBaseThread()]}
        selectedFileId={null}
        onSelectFile={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).not.toContain('Debug: diff to overview fallback');
  });

  it('renders a generic content-based explanation for lineOutOfRange', () => {
    const html = renderToStaticMarkup(
      <LocalThreadPanel
        threads={[
          {
            ...createBaseThread(),
            debugDowngrade: {
              reason: 'lineOutOfRange',
              requestedFilePath: 'src/example.ts',
              requestedSide: 'new',
              requestedStartLine: 99,
              requestedEndLine: 100,
            },
          },
        ]}
        selectedFileId={null}
        onSelectFile={() => undefined}
        fallbackActive={false}
      />,
    );

    expect(html).toContain('requested line 範囲が対象 content の行数を超えていました。');
    expect(html).not.toContain('hydrated content');
  });
});
