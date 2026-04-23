import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import { ReviewWorkspaceStore } from './review-workspace-store';

type Row = Record<string, unknown> & { review_workspace_id: string };

vi.mock('better-sqlite3', () => {
  return {
    default: class DatabaseMock {
      private readonly rows = new Map<string, Row>();

      pragma(): void {}

      exec(): void {}

      close(): void {}

      prepare(sql: string): {
        run: (params?: Row | string) => void;
        all: () => Row[];
        get: (reviewWorkspaceId: string) => Row | undefined;
      } {
        return {
          run: (params?: Row | string) => {
            if (sql.includes('INSERT OR REPLACE')) {
              const row = params as Row;
              this.rows.set(row.review_workspace_id, row);
              return;
            }
            if (sql.includes('DELETE FROM review_workspaces') && typeof params === 'string') {
              this.rows.delete(params);
            }
          },
          all: () => Array.from(this.rows.values()),
          get: (reviewWorkspaceId: string) => this.rows.get(reviewWorkspaceId),
        };
      }
    },
  };
});

function createTempDir(tempDirs: string[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-thread-app-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function createWorkspace(overrides: Partial<ReviewWorkspace> = {}): ReviewWorkspace {
  return {
    reviewWorkspaceId: 'workspace-1',
    repositoryProfileId: 'profile-1',
    provider: 'github',
    reviewUrl: 'https://github.com/acme/project/pull/123',
    reviewId: '123',
    title: 'Review workspace',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    sourceBranchName: 'feature/remove-workspace',
    worktreePath: path.join('C:', 'worktrees', 'project-pr-123'),
    setupStatus: 'completed',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ReviewWorkspaceStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gets and deletes a review workspace by id', () => {
    const userDataPath = createTempDir(tempDirs);
    const store = new ReviewWorkspaceStore(userDataPath);
    const workspace = createWorkspace();

    try {
      store.save(workspace);

      expect(store.get(workspace.reviewWorkspaceId)).toEqual(workspace);

      store.delete(workspace.reviewWorkspaceId);

      expect(store.get(workspace.reviewWorkspaceId)).toBeNull();
      expect(store.list()).toEqual([]);
    } finally {
      store.close();
    }
  });
});
