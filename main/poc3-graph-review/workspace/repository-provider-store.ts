import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { safeStorage } from 'electron';
import type {
  PublicRepositoryProvider,
  RepositoryProvider,
  RepositoryProviderKind,
  RepositoryProviderSecretInput,
} from '../../../shared/poc3-domain/repository';

interface RepositoryProviderRow {
  repository_provider_id: string;
  kind: RepositoryProviderKind;
  display_name: string;
  base_url: string;
  token_ref: string;
  is_default_for_kind: number;
  created_at: string;
  updated_at: string;
}

interface TokenRow {
  token_ref: string;
  encrypted_value: string;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toPublicProvider(provider: RepositoryProvider): PublicRepositoryProvider {
  const { tokenRef: _tokenRef, ...publicProvider } = provider;
  return {
    ...publicProvider,
    hasToken: Boolean(_tokenRef),
  };
}

export class RepositoryProviderStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  list(): PublicRepositoryProvider[] {
    const rows = this.db
      .prepare('SELECT * FROM repository_providers ORDER BY updated_at DESC')
      .all() as RepositoryProviderRow[];
    return rows.map((row) => toPublicProvider(this.rowToProvider(row)));
  }

  listInternal(): RepositoryProvider[] {
    const rows = this.db
      .prepare('SELECT * FROM repository_providers ORDER BY updated_at DESC')
      .all() as RepositoryProviderRow[];
    return rows.map((row) => this.rowToProvider(row));
  }

  get(repositoryProviderId: string): RepositoryProvider | null {
    const row = this.db
      .prepare('SELECT * FROM repository_providers WHERE repository_provider_id = ?')
      .get(repositoryProviderId) as RepositoryProviderRow | undefined;
    return row ? this.rowToProvider(row) : null;
  }

  getToken(tokenRef: string): string | null {
    const row = this.db
      .prepare('SELECT * FROM repository_provider_tokens WHERE token_ref = ?')
      .get(tokenRef) as TokenRow | undefined;
    return row ? decodeToken(row.encrypted_value) : null;
  }

  close(): void {
    this.db.close();
  }

  save(input: RepositoryProviderSecretInput): PublicRepositoryProvider {
    const trimmedBaseUrl = normalizeBaseUrl(input.baseUrl);
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new Error('Provider name is required.');
    }

    const current = input.repositoryProviderId ? this.get(input.repositoryProviderId) : null;
    const timestamp = nowIso();
    const repositoryProviderId =
      current?.repositoryProviderId ?? input.repositoryProviderId ?? randomUUID();
    const tokenRef = current?.tokenRef ?? `poc3-token-${randomUUID()}`;
    const token = input.token?.trim();

    if (!current && !token) {
      throw new Error('Token is required when creating a provider.');
    }

    const transaction = this.db.transaction(() => {
      if (token) {
        this.db
          .prepare(
            `
              INSERT OR REPLACE INTO repository_provider_tokens (
                token_ref, encrypted_value, created_at, updated_at
              ) VALUES (
                @token_ref, @encrypted_value, @created_at, @updated_at
              )
            `,
          )
          .run({
            token_ref: tokenRef,
            encrypted_value: encodeToken(token),
            created_at: current?.createdAt ?? timestamp,
            updated_at: timestamp,
          });
      }

      if (input.isDefaultForKind) {
        this.db
          .prepare('UPDATE repository_providers SET is_default_for_kind = 0 WHERE kind = ?')
          .run(input.kind);
      }

      this.db
        .prepare(
          `
            INSERT OR REPLACE INTO repository_providers (
              repository_provider_id, kind, display_name, base_url, token_ref,
              is_default_for_kind, created_at, updated_at
            ) VALUES (
              @repository_provider_id, @kind, @display_name, @base_url, @token_ref,
              @is_default_for_kind, @created_at, @updated_at
            )
          `,
        )
        .run({
          repository_provider_id: repositoryProviderId,
          kind: input.kind,
          display_name: displayName,
          base_url: trimmedBaseUrl,
          token_ref: tokenRef,
          is_default_for_kind: input.isDefaultForKind ? 1 : 0,
          created_at: current?.createdAt ?? timestamp,
          updated_at: timestamp,
        });
    });

    transaction();

    const saved = this.get(repositoryProviderId);
    if (!saved) {
      throw new Error('Failed to save repository provider.');
    }
    return toPublicProvider(saved);
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repository_providers (
        repository_provider_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        token_ref TEXT NOT NULL,
        is_default_for_kind INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repository_provider_tokens (
        token_ref TEXT PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private rowToProvider(row: RepositoryProviderRow): RepositoryProvider {
    return {
      repositoryProviderId: row.repository_provider_id,
      kind: row.kind,
      displayName: row.display_name,
      baseUrl: row.base_url,
      tokenRef: row.token_ref,
      isDefaultForKind: row.is_default_for_kind === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Base URL must use http or https.');
  }
  return `${url.protocol}//${url.host}`.replace(/\/$/, '');
}

function encodeToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Token encryption is not available in this environment.');
  }
  return `safeStorage:${safeStorage.encryptString(token).toString('base64')}`;
}

function decodeToken(value: string): string {
  if (!value.startsWith('safeStorage:')) {
    return value;
  }
  const payload = value.slice('safeStorage:'.length);
  return safeStorage.decryptString(Buffer.from(payload, 'base64'));
}
