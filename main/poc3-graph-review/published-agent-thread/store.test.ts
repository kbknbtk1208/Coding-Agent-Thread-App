import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedAgentThreadLink } from '../../../shared/poc3-domain/published-agent-thread';
import { PublishedAgentThreadLinkStore } from './store';

const tempDirs: string[] = [];

type Row = Record<string, unknown> & {
  link_id: string;
  review_workspace_id: string;
  local_thread_id: string;
  provider_thread_id: string;
  published_at: string;
};

vi.mock('better-sqlite3', () => {
  return {
    default: class DatabaseMock {
      private rows: Row[] = [];

      pragma(): void {}

      exec(): void {}

      close(): void {}

      transaction(callback: () => void): () => void {
        return callback;
      }

      prepare(sql: string): {
        run: (...params: unknown[]) => void;
        all: (...params: unknown[]) => Row[];
      } {
        return {
          run: (...params: unknown[]) => {
            if (sql.includes('INSERT INTO published_agent_thread_links')) {
              const row = params[0] as Row;
              const existing = this.rows.find(
                (item) =>
                  item.review_workspace_id === row.review_workspace_id &&
                  item.local_thread_id === row.local_thread_id &&
                  item.provider_thread_id === row.provider_thread_id,
              );
              if (existing) {
                existing.source_revision_id = row.source_revision_id;
                existing.provider_comment_ids_json = row.provider_comment_ids_json;
                existing.last_synced_at = row.last_synced_at;
                existing.status = row.status;
                return;
              }
              this.rows.push(row);
              return;
            }
            if (sql.includes('UPDATE published_agent_thread_links')) {
              const [status, lastSyncedAt, linkId] = params;
              const row = this.rows.find((item) => item.link_id === linkId);
              if (row) {
                row.status = status;
                row.last_synced_at = lastSyncedAt;
              }
              return;
            }
            if (sql.includes('DELETE FROM published_agent_thread_links')) {
              const [reviewWorkspaceId] = params;
              this.rows = this.rows.filter((row) => row.review_workspace_id !== reviewWorkspaceId);
            }
          },
          all: (...params: unknown[]) => {
            const [reviewWorkspaceId, ...ids] = params;
            let rows = this.rows.filter((row) => row.review_workspace_id === reviewWorkspaceId);
            if (sql.includes('local_thread_id IN')) {
              rows = rows.filter((row) => ids.includes(row.local_thread_id));
            }
            if (sql.includes('provider_thread_id IN')) {
              rows = rows.filter((row) => ids.includes(row.provider_thread_id));
            }
            return [...rows].sort((a, b) => a.published_at.localeCompare(b.published_at));
          },
        };
      }
    },
  };
});

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'published-agent-thread-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function createLink(overrides: Partial<PublishedAgentThreadLink> = {}): PublishedAgentThreadLink {
  return {
    linkId: 'link-1',
    reviewWorkspaceId: 'workspace-1',
    localThreadId: 'thread-1',
    sourceRevisionId: 'revision-1',
    providerThreadId: 'remote-1',
    providerCommentIds: ['comment-1'],
    publishedAt: '2026-01-01T00:00:00.000Z',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('PublishedAgentThreadLinkStore', () => {
  it('link 保存、同一 providerThreadId の上書き、workspace 削除ができる', () => {
    const store = new PublishedAgentThreadLinkStore(createTempDir());

    try {
      const first = store.saveLink(createLink());
      expect(first).toEqual(createLink());

      const updated = store.saveLink(
        createLink({
          linkId: 'link-repost-same-provider',
          providerCommentIds: ['comment-1', 'comment-2'],
          lastSyncedAt: '2026-01-02T00:00:00.000Z',
        }),
      );

      expect(updated).toEqual(
        createLink({
          providerCommentIds: ['comment-1', 'comment-2'],
          lastSyncedAt: '2026-01-02T00:00:00.000Z',
        }),
      );
      expect(store.listLinksForWorkspace('workspace-1')).toHaveLength(1);
      expect(
        store.listLinksForLocalThreads({
          reviewWorkspaceId: 'workspace-1',
          localThreadIds: ['thread-1'],
        }),
      ).toEqual([updated]);

      store.deleteWorkspaceLinks('workspace-1');

      expect(store.listLinksForWorkspace('workspace-1')).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('markSyncResult で active と missingRemote を更新する', () => {
    const store = new PublishedAgentThreadLinkStore(createTempDir());

    try {
      store.saveLink(createLink({ linkId: 'link-1', providerThreadId: 'remote-1' }));
      store.saveLink(createLink({ linkId: 'link-2', providerThreadId: 'remote-2' }));

      store.markSyncResult({
        reviewWorkspaceId: 'workspace-1',
        providerThreadIdsInSnapshot: ['remote-2'],
        syncedAt: '2026-01-03T00:00:00.000Z',
      });

      expect(store.listLinksForWorkspace('workspace-1')).toEqual([
        createLink({
          linkId: 'link-1',
          providerThreadId: 'remote-1',
          status: 'missingRemote',
          lastSyncedAt: '2026-01-03T00:00:00.000Z',
        }),
        createLink({
          linkId: 'link-2',
          providerThreadId: 'remote-2',
          status: 'active',
          lastSyncedAt: '2026-01-03T00:00:00.000Z',
        }),
      ]);
    } finally {
      store.close();
    }
  });
});
