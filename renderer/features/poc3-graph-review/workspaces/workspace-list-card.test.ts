import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewWorkspaceListItem } from './use-review-workspaces';
import { ForceRemoveDialog, WorkspaceActionMenu, WorkspaceListCard } from './workspace-list-card';

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
    setupStatus: 'completed',
    analysisStatus: 'completed',
    worktreeExists: true,
    canOpenInEditor: true,
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
      openingWorkspaceIds: {},
      openEditorErrorByWorkspaceId: {},
      onOpenWorkspaceInEditor: vi.fn(),
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

  it('renders the VS Code action only for openable workspaces', () => {
    const openMenuHtml = renderToStaticMarkup(
      React.createElement(WorkspaceActionMenu, {
        workspace: createWorkspace(),
        open: true,
        removing: false,
        disabled: false,
        openingInEditor: false,
        onToggle: vi.fn(),
        onOpenInEditor: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    const closedMenuHtml = renderToStaticMarkup(
      React.createElement(WorkspaceActionMenu, {
        workspace: createWorkspace({ canOpenInEditor: false }),
        open: true,
        removing: false,
        disabled: false,
        openingInEditor: false,
        onToggle: vi.fn(),
        onOpenInEditor: vi.fn(),
        onRemove: vi.fn(),
      }),
    );

    expect(openMenuHtml).toContain('VS Codeで開く');
    expect(closedMenuHtml).not.toContain('VS Codeで開く');
  });

  it('renders editor pending and inline error state', () => {
    const menuHtml = renderToStaticMarkup(
      React.createElement(WorkspaceActionMenu, {
        workspace: createWorkspace(),
        open: true,
        removing: false,
        disabled: true,
        openingInEditor: true,
        onToggle: vi.fn(),
        onOpenInEditor: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    const html = renderCard({
      openingWorkspaceIds: { 'workspace-1': true },
      openEditorErrorByWorkspaceId: {
        'workspace-1': 'code コマンドが見つかりません。',
      },
    });

    expect(menuHtml).toContain('起動中');
    expect(html).toContain('code コマンドが見つかりません。');
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
