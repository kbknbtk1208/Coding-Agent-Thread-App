import path from 'path';
import Database from 'better-sqlite3';
import type {
  PublishedAgentThreadLink,
  PublishedAgentThreadLinkStatus,
} from '../../../shared/poc3-domain/published-agent-thread';

interface PublishedAgentThreadLinkRow {
  link_id: string;
  review_workspace_id: string;
  local_thread_id: string;
  source_revision_id: string;
  provider_thread_id: string;
  provider_comment_ids_json: string;
  published_at: string;
  last_synced_at: string;
  status: PublishedAgentThreadLinkStatus;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class PublishedAgentThreadLinkStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  saveLink(link: PublishedAgentThreadLink): PublishedAgentThreadLink {
    this.db
      .prepare(
        `
          INSERT INTO published_agent_thread_links (
            link_id, review_workspace_id, local_thread_id, source_revision_id,
            provider_thread_id, provider_comment_ids_json, published_at, last_synced_at, status
          ) VALUES (
            @link_id, @review_workspace_id, @local_thread_id, @source_revision_id,
            @provider_thread_id, @provider_comment_ids_json, @published_at, @last_synced_at, @status
          )
          ON CONFLICT(review_workspace_id, local_thread_id, provider_thread_id)
          DO UPDATE SET
            source_revision_id = excluded.source_revision_id,
            provider_comment_ids_json = excluded.provider_comment_ids_json,
            last_synced_at = excluded.last_synced_at,
            status = excluded.status
        `,
      )
      .run({
        link_id: link.linkId,
        review_workspace_id: link.reviewWorkspaceId,
        local_thread_id: link.localThreadId,
        source_revision_id: link.sourceRevisionId,
        provider_thread_id: link.providerThreadId,
        provider_comment_ids_json: JSON.stringify(link.providerCommentIds),
        published_at: link.publishedAt,
        last_synced_at: link.lastSyncedAt,
        status: link.status,
      });

    return (
      this.listLinksByProviderThreadIds({
        reviewWorkspaceId: link.reviewWorkspaceId,
        providerThreadIds: [link.providerThreadId],
      }).find((saved) => saved.localThreadId === link.localThreadId) ?? link
    );
  }

  listLinksForWorkspace(reviewWorkspaceId: string): PublishedAgentThreadLink[] {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM published_agent_thread_links
          WHERE review_workspace_id = ?
          ORDER BY published_at ASC
        `,
      )
      .all(reviewWorkspaceId) as PublishedAgentThreadLinkRow[];
    return rows.map((row) => this.rowToLink(row));
  }

  listLinksForLocalThreads(input: {
    reviewWorkspaceId: string;
    localThreadIds: string[];
  }): PublishedAgentThreadLink[] {
    if (input.localThreadIds.length === 0) {
      return [];
    }
    const placeholders = input.localThreadIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `
          SELECT * FROM published_agent_thread_links
          WHERE review_workspace_id = ?
            AND local_thread_id IN (${placeholders})
          ORDER BY published_at ASC
        `,
      )
      .all(input.reviewWorkspaceId, ...input.localThreadIds) as PublishedAgentThreadLinkRow[];
    return rows.map((row) => this.rowToLink(row));
  }

  listLinksByProviderThreadIds(input: {
    reviewWorkspaceId: string;
    providerThreadIds: string[];
  }): PublishedAgentThreadLink[] {
    if (input.providerThreadIds.length === 0) {
      return [];
    }
    const placeholders = input.providerThreadIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `
          SELECT * FROM published_agent_thread_links
          WHERE review_workspace_id = ?
            AND provider_thread_id IN (${placeholders})
          ORDER BY published_at ASC
        `,
      )
      .all(input.reviewWorkspaceId, ...input.providerThreadIds) as PublishedAgentThreadLinkRow[];
    return rows.map((row) => this.rowToLink(row));
  }

  markSyncResult(input: {
    reviewWorkspaceId: string;
    providerThreadIdsInSnapshot: string[];
    syncedAt: string;
  }): void {
    const providerThreadIds = new Set(input.providerThreadIdsInSnapshot);
    const links = this.listLinksForWorkspace(input.reviewWorkspaceId);
    const update = this.db.prepare(
      `
        UPDATE published_agent_thread_links
        SET status = ?, last_synced_at = ?
        WHERE link_id = ?
      `,
    );
    const transaction = this.db.transaction(() => {
      for (const link of links) {
        update.run(
          providerThreadIds.has(link.providerThreadId) ? 'active' : 'missingRemote',
          input.syncedAt,
          link.linkId,
        );
      }
    });
    transaction();
  }

  deleteWorkspaceLinks(reviewWorkspaceId: string): void {
    this.db
      .prepare('DELETE FROM published_agent_thread_links WHERE review_workspace_id = ?')
      .run(reviewWorkspaceId);
  }

  close(): void {
    this.db.close();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS published_agent_thread_links (
        link_id TEXT PRIMARY KEY,
        review_workspace_id TEXT NOT NULL,
        local_thread_id TEXT NOT NULL,
        source_revision_id TEXT NOT NULL,
        provider_thread_id TEXT NOT NULL,
        provider_comment_ids_json TEXT NOT NULL,
        published_at TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_published_agent_thread_links_unique
        ON published_agent_thread_links(review_workspace_id, local_thread_id, provider_thread_id);

      CREATE INDEX IF NOT EXISTS idx_published_agent_thread_links_owner
        ON published_agent_thread_links(review_workspace_id, local_thread_id, status, published_at);

      CREATE INDEX IF NOT EXISTS idx_published_agent_thread_links_provider_thread
        ON published_agent_thread_links(review_workspace_id, provider_thread_id);
    `);
  }

  private rowToLink(row: PublishedAgentThreadLinkRow): PublishedAgentThreadLink {
    return {
      linkId: row.link_id,
      reviewWorkspaceId: row.review_workspace_id,
      localThreadId: row.local_thread_id,
      sourceRevisionId: row.source_revision_id,
      providerThreadId: row.provider_thread_id,
      providerCommentIds: parseJson<string[]>(row.provider_comment_ids_json),
      publishedAt: row.published_at,
      lastSyncedAt: row.last_synced_at,
      status: row.status,
    };
  }
}
