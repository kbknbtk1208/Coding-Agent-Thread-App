import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type {
  RepositoryLocator,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositorySetupScript,
  ResolvedRepositoryProvider,
} from '../../../shared/poc3-domain/repository';

interface RepositoryProfileRow {
  repository_profile_id: string;
  repository_provider_id: string;
  origin_url: string;
  resolved_provider_json: string;
  repo_locator_json: string;
  local_clone_path: string;
  worktree_root_path: string;
  setup_script_json: string | null;
  created_at: string;
  updated_at: string;
}

interface SaveResolvedProfileInput extends RepositoryProfileInput {
  resolvedProvider: ResolvedRepositoryProvider;
  repoLocator: RepositoryLocator;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class RepositoryProfileStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  list(): RepositoryProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM repository_profiles ORDER BY updated_at DESC')
      .all() as RepositoryProfileRow[];
    return rows.map((row) => this.rowToProfile(row));
  }

  get(repositoryProfileId: string): RepositoryProfile | null {
    const row = this.db
      .prepare('SELECT * FROM repository_profiles WHERE repository_profile_id = ?')
      .get(repositoryProfileId) as RepositoryProfileRow | undefined;
    return row ? this.rowToProfile(row) : null;
  }

  close(): void {
    this.db.close();
  }

  save(input: SaveResolvedProfileInput): RepositoryProfile {
    const current = input.repositoryProfileId ? this.get(input.repositoryProfileId) : null;
    const timestamp = nowIso();
    const repositoryProfileId =
      current?.repositoryProfileId ?? input.repositoryProfileId ?? randomUUID();

    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO repository_profiles (
            repository_profile_id, repository_provider_id, origin_url,
            resolved_provider_json, repo_locator_json, local_clone_path,
            worktree_root_path, setup_script_json, created_at, updated_at
          ) VALUES (
            @repository_profile_id, @repository_provider_id, @origin_url,
            @resolved_provider_json, @repo_locator_json, @local_clone_path,
            @worktree_root_path, @setup_script_json, @created_at, @updated_at
          )
        `,
      )
      .run({
        repository_profile_id: repositoryProfileId,
        repository_provider_id: input.repositoryProviderId,
        origin_url: input.originUrl.trim(),
        resolved_provider_json: JSON.stringify(input.resolvedProvider),
        repo_locator_json: JSON.stringify(input.repoLocator),
        local_clone_path: input.localClonePath.trim(),
        worktree_root_path: input.worktreeRootPath.trim(),
        setup_script_json: input.setupScript ? JSON.stringify(input.setupScript) : null,
        created_at: current?.createdAt ?? timestamp,
        updated_at: timestamp,
      });

    const saved = this.get(repositoryProfileId);
    if (!saved) {
      throw new Error('Failed to save repository profile.');
    }
    return saved;
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repository_profiles (
        repository_profile_id TEXT PRIMARY KEY,
        repository_provider_id TEXT NOT NULL,
        origin_url TEXT NOT NULL,
        resolved_provider_json TEXT NOT NULL,
        repo_locator_json TEXT NOT NULL,
        local_clone_path TEXT NOT NULL,
        worktree_root_path TEXT NOT NULL,
        setup_script_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private rowToProfile(row: RepositoryProfileRow): RepositoryProfile {
    return {
      repositoryProfileId: row.repository_profile_id,
      repositoryProviderId: row.repository_provider_id,
      originUrl: row.origin_url,
      resolvedProvider: JSON.parse(row.resolved_provider_json) as ResolvedRepositoryProvider,
      repoLocator: JSON.parse(row.repo_locator_json) as RepositoryLocator,
      localClonePath: row.local_clone_path,
      worktreeRootPath: row.worktree_root_path,
      setupScript: row.setup_script_json
        ? (JSON.parse(row.setup_script_json) as RepositorySetupScript)
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
