import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodeGraphSnapshot, LayoutSnapshot } from '../../../shared/poc3-domain/graph';
import type {
  GraphLayerApplicationSnapshot,
  RepositoryLayerProfileDraft,
} from '../../../shared/poc3-domain/layer-profile';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import { GraphReviewStore } from '../store/graph-review-store';
import { LayerProfileStore } from './layer-profile-store';

type Row = Record<string, unknown>;

interface MockDbState {
  profiles: Map<string, Row>;
  applications: Map<string, Row>;
}

const dbStates = new Map<string, MockDbState>();

function stateFor(filePath: string): MockDbState {
  let state = dbStates.get(filePath);
  if (!state) {
    state = {
      profiles: new Map<string, Row>(),
      applications: new Map<string, Row>(),
    };
    dbStates.set(filePath, state);
  }
  return state;
}

function getString(row: Row, key: string): string {
  return String(row[key]);
}

vi.mock('better-sqlite3', () => {
  return {
    default: class DatabaseMock {
      private readonly state: MockDbState;

      constructor(filePath: string) {
        this.state = stateFor(filePath);
      }

      pragma(): void {}

      exec(): void {}

      close(): void {}

      transaction<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void {
        return (...args: T) => fn(...args);
      }

      prepare(sql: string): {
        run: (...params: unknown[]) => void;
        all: (...params: unknown[]) => Row[];
        get: (...params: unknown[]) => Row | undefined;
      } {
        return {
          run: (...params: unknown[]) => {
            const firstParam = params[0] as Row | undefined;
            if (sql.includes('INSERT OR REPLACE INTO repository_layer_profiles') && firstParam) {
              this.state.profiles.set(getString(firstParam, 'layer_profile_id'), firstParam);
              return;
            }
            if (sql.includes('UPDATE repository_layer_profiles') && params.length >= 2) {
              const layerProfileId = String(params[1]);
              const row = this.state.profiles.get(layerProfileId);
              if (row) {
                row.last_applied_at = params[0];
              }
              return;
            }
            if (sql.includes('INSERT OR REPLACE INTO graph_layer_applications') && firstParam) {
              this.state.applications.set(
                getString(firstParam, 'graph_layer_application_id'),
                firstParam,
              );
            }
          },
          all: (...params: unknown[]) => {
            if (sql.includes('FROM repository_layer_profiles')) {
              const identityKey = String(params[0]);
              const excludedRepositoryProfileId = params[1] ? String(params[1]) : '';
              return Array.from(this.state.profiles.values())
                .filter(
                  (row) =>
                    row.repository_identity_key === identityKey &&
                    row.repository_profile_id !== excludedRepositoryProfileId,
                )
                .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
            }
            return [];
          },
          get: (...params: unknown[]) => {
            if (sql.includes('FROM repository_layer_profiles WHERE repository_profile_id = ?')) {
              const repositoryProfileId = String(params[0]);
              return Array.from(this.state.profiles.values()).find(
                (row) => row.repository_profile_id === repositoryProfileId,
              );
            }
            if (sql.includes('FROM repository_layer_profiles WHERE layer_profile_id = ?')) {
              return this.state.profiles.get(String(params[0]));
            }
            if (sql.includes('FROM graph_layer_applications')) {
              const graphSnapshotId = String(params[0]);
              const layerProfileId = String(params[1]);
              const profileVersion = Number(params[2]);
              return Array.from(this.state.applications.values()).find(
                (row) =>
                  row.graph_snapshot_id === graphSnapshotId &&
                  row.layer_profile_id === layerProfileId &&
                  row.profile_version === profileVersion,
              );
            }
            return undefined;
          },
        };
      }
    },
  };
});

function createTempDir(tempDirs: string[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-thread-app-layer-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function repositoryProfile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
  return {
    repositoryProfileId: 'repo-profile-1',
    repositoryProviderId: 'provider-1',
    originUrl: 'https://github.com/acme/project.git',
    resolvedProvider: {
      kind: 'github',
      baseUrl: 'https://github.com',
      host: 'github.com',
    },
    repoLocator: {
      kind: 'github',
      owner: 'acme',
      repo: 'project',
    },
    localClonePath: 'C:\\dev\\project',
    worktreeRootPath: 'C:\\dev\\project',
    setupScript: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function draft(repositoryProfileId = 'repo-profile-1'): RepositoryLayerProfileDraft {
  return {
    repositoryProfileId,
    displayName: 'Default',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules: [
      {
        glob: 'main/**',
        layerPath: 'backend',
        displayName: 'Backend',
        description: null,
        order: 10,
        priority: 1,
        enabled: true,
      },
    ],
    ignoredPatterns: [
      {
        glob: 'fixtures/**',
        reason: 'fixture',
        enabled: true,
      },
    ],
  };
}

describe('LayerProfileStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('saves, loads, and increments profileVersion per repository profile', () => {
    const store = new LayerProfileStore(createTempDir(tempDirs));
    const first = store.save({ draft: draft(), repositoryProfile: repositoryProfile() });
    const second = store.save({
      draft: {
        ...draft(),
        layerProfileId: first.layerProfileId,
        displayName: 'Updated',
      },
      repositoryProfile: repositoryProfile(),
    });
    expect(first.profileVersion).toBe(1);
    expect(second.profileVersion).toBe(2);
    expect(store.getByRepositoryProfileId('repo-profile-1')?.displayName).toBe('Updated');
    store.close();
  });

  it('returns latest same-identity copy candidate without auto-linking profiles', () => {
    const store = new LayerProfileStore(createTempDir(tempDirs));
    const sourceProfile = repositoryProfile({ repositoryProfileId: 'source' });
    const targetProfile = repositoryProfile({
      repositoryProfileId: 'target',
      localClonePath: 'D:\\work\\project',
      worktreeRootPath: 'D:\\work\\project',
    });
    const saved = store.save({ draft: draft('source'), repositoryProfile: sourceProfile });
    const reusable = store.findLatestReusableProfileForRepository(targetProfile);
    expect(reusable?.layerProfileId).toBe(saved.layerProfileId);
    expect(reusable?.repositoryProfileId).toBe('source');
    store.close();
  });

  it('validates broken drafts before saving', () => {
    const store = new LayerProfileStore(createTempDir(tempDirs));
    const issues = store.validateDraft({
      ...draft(),
      rules: [
        {
          ...draft().rules[0],
          layerPath: '',
        },
      ],
    });
    expect(issues.some((issue) => issue.code === 'LAYER_RULE_EMPTY_LAYER_PATH')).toBe(true);
    store.close();
  });

  it('rejects invalid draft enum values before saving', () => {
    const store = new LayerProfileStore(createTempDir(tempDirs));
    const issues = store.validateDraft({
      ...draft(),
      layoutDirection: 'DOWN',
      dependencyDirection: 'order-descending',
      layoutStrategy: 'unknown',
    } as unknown as RepositoryLayerProfileDraft);

    expect(issues.filter((issue) => issue.code === 'LAYER_PROFILE_INVALID_ENUM')).toHaveLength(3);
    expect(() =>
      store.save({
        draft: {
          ...draft(),
          layoutStrategy: 'unknown',
        } as unknown as RepositoryLayerProfileDraft,
        repositoryProfile: repositoryProfile(),
      }),
    ).toThrow('Layer profile draft is invalid.');
    store.close();
  });

  it('invalidates stored profiles with malformed rule or ignore fields', () => {
    const tempDir = createTempDir(tempDirs);
    const store = new LayerProfileStore(tempDir);
    const saved = store.save({ draft: draft(), repositoryProfile: repositoryProfile() });
    const state = stateFor(path.join(tempDir, 'poc3-graph-review.db'));
    const row = state.profiles.get(saved.layerProfileId);
    if (!row) {
      throw new Error('saved layer profile row was not found');
    }
    row.rules_json = JSON.stringify([
      {
        layerRuleId: 'rule-1',
        glob: 'main/**',
        layerPath: 'backend',
        displayName: 'backend',
        order: 'not-number',
        priority: 1,
        enabled: true,
      },
    ]);
    row.ignored_patterns_json = JSON.stringify([
      {
        ignorePatternId: 'ignore-1',
        glob: '**/fixtures/**',
        reason: null,
      },
    ]);

    const result = store.readByRepositoryProfileId('repo-profile-1');
    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((issue) => issue.code)).toContain('LAYER_PROFILE_RULE_INVALID');
    expect(result.diagnostics.map((issue) => issue.code)).toContain('LAYER_PROFILE_IGNORE_INVALID');
    store.close();
  });

  it('invalidates stored profiles with unsupported enum values', () => {
    const tempDir = createTempDir(tempDirs);
    const store = new LayerProfileStore(tempDir);
    const saved = store.save({ draft: draft(), repositoryProfile: repositoryProfile() });
    const state = stateFor(path.join(tempDir, 'poc3-graph-review.db'));
    const row = state.profiles.get(saved.layerProfileId);
    if (!row) {
      throw new Error('saved layer profile row was not found');
    }
    row.layout_direction = 'DOWN';

    const result = store.readByRepositoryProfileId('repo-profile-1');
    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((issue) => issue.code)).toContain('LAYER_PROFILE_INVALID_ENUM');
    store.close();
  });
});

describe('GraphReviewStore layer application persistence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists graph_layer_applications in the existing DB initialization flow', () => {
    const store = new GraphReviewStore(createTempDir(tempDirs));
    const graph: CodeGraphSnapshot = {
      graphSnapshotId: 'graph-1',
      revisionId: 'rev-1',
      scopeKey: 'scope',
      status: 'ready',
      nodes: [],
      edges: [],
      companionFiles: [],
      limits: {
        nodeLimit: 100,
        edgeLimit: 100,
        omittedNodeCount: 0,
        omittedEdgeCount: 0,
        reason: 'none',
      },
      diagnostics: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const layout: LayoutSnapshot = {
      layoutSnapshotId: 'layout-1',
      graphSnapshotId: 'graph-1',
      engine: 'test',
      positions: {},
      viewport: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const application: GraphLayerApplicationSnapshot = {
      graphLayerApplicationId: 'application-1',
      graphSnapshotId: 'graph-1',
      layerProfileId: 'layer-profile-1',
      profileVersion: 1,
      positions: {},
      lanes: [],
      groups: [],
      nodeClassifications: {},
      edgeClassifications: {},
      diagnostics: [],
      appliedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.saveGraphAndLayout(graph, layout);
    store.saveGraphLayerApplication(application);
    expect(
      store.getGraphLayerApplication({
        graphSnapshotId: 'graph-1',
        layerProfileId: 'layer-profile-1',
        profileVersion: 1,
      }),
    ).toEqual(application);
    store.close();
  });

  it('returns null when a stored graph_layer_applications JSON payload is broken', () => {
    const tempDir = createTempDir(tempDirs);
    const store = new GraphReviewStore(tempDir);
    const application: GraphLayerApplicationSnapshot = {
      graphLayerApplicationId: 'application-1',
      graphSnapshotId: 'graph-1',
      layerProfileId: 'layer-profile-1',
      profileVersion: 1,
      positions: {},
      lanes: [],
      groups: [],
      nodeClassifications: {},
      edgeClassifications: {},
      diagnostics: [],
      appliedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.saveGraphLayerApplication(application);
    const state = stateFor(path.join(tempDir, 'poc3-graph-review.db'));
    const row = state.applications.get(application.graphLayerApplicationId);
    if (!row) {
      throw new Error('saved graph layer application row was not found');
    }
    row.lanes_json = '{broken';

    expect(
      store.getGraphLayerApplication({
        graphSnapshotId: 'graph-1',
        layerProfileId: 'layer-profile-1',
        profileVersion: 1,
      }),
    ).toBeNull();
    store.close();
  });
});
