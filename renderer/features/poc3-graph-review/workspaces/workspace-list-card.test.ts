import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewWorkspaceListItem } from './use-review-workspaces';
import { ForceRemoveDialog, WorkspaceListCard } from './workspace-list-card';

function createWorkspace(
  overrides: Partial<ReviewWorkspaceListItem> = {},
): ReviewWorkspaceListItem {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryLabel: 'acme/project',
    provider: 'github',
    reviewId: '123',
    title: 'Review workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(overrides: Partial<React.ComponentProps<typeof WorkspaceListCard>> = {}) {
  return renderToStaticMarkup(
    React.createElement(WorkspaceListCard, {
      selectedWorkspace: createWorkspace(),
      otherWorkspaces: [],
      onSelectWorkspace: vi.fn(),
      removingWorkspaceId: null,
      removeError: null,
      onRemoveWorkspace: vi.fn(),
      ...overrides,
    }),
  );
}

describe('WorkspaceListCard', () => {
  it('renders a workspace action menu trigger for the selected workspace', () => {
    const html = renderCard();

    expect(html).toContain('acme/project の操作');
    expect(html).toContain('PR #123 Review workspace');
  });

  it('shows the loading spinner and disables selection while removing a workspace', () => {
    const html = renderCard({ removingWorkspaceId: 'workspace-1' });

    expect(html).toContain('animate-spin');
    expect(html).toContain('disabled=""');
  });

  it('renders inline remove errors inside the card', () => {
    const html = renderCard({ removeError: 'git worktree remove が失敗しました。' });

    expect(html).toContain('git worktree remove が失敗しました。');
  });
});

describe('ForceRemoveDialog', () => {
  it('renders the forced remove confirmation for dirty worktrees', () => {
    const html = renderToStaticMarkup(
      React.createElement(ForceRemoveDialog, {
        target: {
          workspace: createWorkspace(),
          message: 'contains modified files',
        },
        removing: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(html).toContain('強制削除しますか');
    expect(html).toContain('contains modified files');
    expect(html).toContain('Force Delete');
  });
});
