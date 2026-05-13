import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import picomatch from 'picomatch';
import type {
  GraphLayerDiagnostic,
  RepositoryLayerIgnorePattern,
  RepositoryLayerIgnorePatternDraft,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
  RepositoryLayerRule,
  RepositoryLayerRuleDraft,
} from '../../../shared/poc3-domain/layer-profile';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import { buildRepositoryIdentityKey } from './repository-identity';

const LAYER_PROFILE_SCHEMA_VERSION = 1;
const VALID_LAYOUT_DIRECTIONS = new Set<RepositoryLayerProfile['layoutDirection']>(['RIGHT']);
const VALID_DEPENDENCY_DIRECTIONS = new Set<RepositoryLayerProfile['dependencyDirection']>([
  'order-ascending',
]);
const VALID_LAYOUT_STRATEGIES = new Set<RepositoryLayerProfile['layoutStrategy']>([
  'lane-composition',
  'elk-compound',
]);

interface RepositoryLayerProfileRow {
  layer_profile_id: string;
  repository_profile_id: string;
  repository_identity_key: string;
  schema_version: number;
  profile_version: number;
  display_name: string;
  layout_direction: RepositoryLayerProfile['layoutDirection'];
  dependency_direction: RepositoryLayerProfile['dependencyDirection'];
  layout_strategy: RepositoryLayerProfile['layoutStrategy'];
  rules_json: string;
  ignored_patterns_json: string;
  created_at: string;
  updated_at: string;
  last_applied_at: string | null;
}

export interface LayerProfileReadResult {
  profile: RepositoryLayerProfile | null;
  diagnostics: GraphLayerDiagnostic[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(
  value: string,
  diagnosticCode: string,
): { value: unknown[]; diagnostics: GraphLayerDiagnostic[] } {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return {
        value: [],
        diagnostics: [
          {
            code: diagnosticCode,
            severity: 'error',
            message: 'Stored layer profile JSON is not an array.',
          },
        ],
      };
    }
    return { value: parsed, diagnostics: [] };
  } catch (err) {
    return {
      value: [],
      diagnostics: [
        {
          code: diagnosticCode,
          severity: 'error',
          message: err instanceof Error ? err.message : 'Stored layer profile JSON is broken.',
        },
      ],
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(code: string, message: string, layerRuleIds?: string[]): GraphLayerDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    layerRuleIds,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateStoredRule(
  value: unknown,
  index: number,
): {
  rule: RepositoryLayerRule | null;
  diagnostics: GraphLayerDiagnostic[];
} {
  if (!isPlainObject(value)) {
    return {
      rule: null,
      diagnostics: [
        diagnostic('LAYER_PROFILE_RULE_INVALID', `Layer rule ${index} is not an object.`),
      ],
    };
  }
  const layerRuleId = value.layerRuleId;
  const glob = value.glob;
  const layerPath = value.layerPath;
  const displayName = value.displayName;
  const description = value.description;
  const order = value.order;
  const priority = value.priority;
  const enabled = value.enabled;
  const id = typeof layerRuleId === 'string' ? layerRuleId : undefined;
  const diagnostics: GraphLayerDiagnostic[] = [];
  if (!id) {
    diagnostics.push(
      diagnostic('LAYER_PROFILE_RULE_INVALID', `Layer rule ${index} is missing layerRuleId.`),
    );
  }
  if (typeof glob !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid glob.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (typeof layerPath !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid layerPath.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (typeof displayName !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid displayName.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (description !== null && typeof description !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid description.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (!isFiniteNumber(order)) {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid order.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (!isFiniteNumber(priority)) {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid priority.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (typeof enabled !== 'boolean') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_RULE_INVALID',
        `Layer rule ${index} has invalid enabled flag.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (diagnostics.length > 0) {
    return { rule: null, diagnostics };
  }
  return {
    rule: {
      layerRuleId: layerRuleId as string,
      glob: glob as string,
      layerPath: layerPath as string,
      displayName: displayName as string,
      description: description as string | null,
      order: order as number,
      priority: priority as number,
      enabled: enabled as boolean,
    },
    diagnostics: [],
  };
}

function validateStoredIgnorePattern(
  value: unknown,
  index: number,
): {
  pattern: RepositoryLayerIgnorePattern | null;
  diagnostics: GraphLayerDiagnostic[];
} {
  if (!isPlainObject(value)) {
    return {
      pattern: null,
      diagnostics: [
        diagnostic('LAYER_PROFILE_IGNORE_INVALID', `Ignore pattern ${index} is not an object.`),
      ],
    };
  }
  const ignorePatternId = value.ignorePatternId;
  const glob = value.glob;
  const reason = value.reason;
  const enabled = value.enabled;
  const id = typeof ignorePatternId === 'string' ? ignorePatternId : undefined;
  const diagnostics: GraphLayerDiagnostic[] = [];
  if (!id) {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_IGNORE_INVALID',
        `Ignore pattern ${index} is missing ignorePatternId.`,
      ),
    );
  }
  if (typeof glob !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_IGNORE_INVALID',
        `Ignore pattern ${index} has invalid glob.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (reason !== null && typeof reason !== 'string') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_IGNORE_INVALID',
        `Ignore pattern ${index} has invalid reason.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (typeof enabled !== 'boolean') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_IGNORE_INVALID',
        `Ignore pattern ${index} has invalid enabled flag.`,
        id ? [id] : undefined,
      ),
    );
  }
  if (diagnostics.length > 0) {
    return { pattern: null, diagnostics };
  }
  return {
    pattern: {
      ignorePatternId: ignorePatternId as string,
      glob: glob as string,
      reason: reason as string | null,
      enabled: enabled as boolean,
    },
    diagnostics: [],
  };
}

function validateStoredProfileRow(row: RepositoryLayerProfileRow): GraphLayerDiagnostic[] {
  const diagnostics: GraphLayerDiagnostic[] = [];
  if (row.layout_direction !== 'RIGHT') {
    diagnostics.push(
      diagnostic('LAYER_PROFILE_INVALID_ENUM', 'Stored layer profile has invalid layoutDirection.'),
    );
  }
  if (row.dependency_direction !== 'order-ascending') {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_INVALID_ENUM',
        'Stored layer profile has invalid dependencyDirection.',
      ),
    );
  }
  if (row.layout_strategy !== 'lane-composition' && row.layout_strategy !== 'elk-compound') {
    diagnostics.push(
      diagnostic('LAYER_PROFILE_INVALID_ENUM', 'Stored layer profile has invalid layoutStrategy.'),
    );
  }
  if (!Number.isInteger(row.profile_version) || row.profile_version < 0) {
    diagnostics.push(
      diagnostic(
        'LAYER_PROFILE_INVALID_VERSION',
        'Stored layer profile has invalid profileVersion.',
      ),
    );
  }
  return diagnostics;
}

function validateRule(rule: RepositoryLayerRuleDraft): GraphLayerDiagnostic[] {
  const diagnostics: GraphLayerDiagnostic[] = [];
  const normalizedGlob = rule.glob.normalize('NFC').trim().replace(/\\/g, '/');
  if (!normalizedGlob) {
    diagnostics.push({
      code: 'LAYER_RULE_INVALID_GLOB',
      severity: 'error',
      message: 'Layer rule glob is empty.',
      layerRuleIds: rule.layerRuleId ? [rule.layerRuleId] : undefined,
    });
  } else {
    try {
      picomatch(normalizedGlob, { dot: true, nocase: false });
    } catch (err) {
      diagnostics.push({
        code: 'LAYER_RULE_INVALID_GLOB',
        severity: 'error',
        message: err instanceof Error ? err.message : 'Invalid layer glob.',
        layerRuleIds: rule.layerRuleId ? [rule.layerRuleId] : undefined,
      });
    }
  }
  if (!rule.layerPath.trim()) {
    diagnostics.push({
      code: 'LAYER_RULE_EMPTY_LAYER_PATH',
      severity: 'error',
      message: 'Layer rule layerPath is empty.',
      layerRuleIds: rule.layerRuleId ? [rule.layerRuleId] : undefined,
    });
  }
  return diagnostics;
}

function validateIgnorePattern(pattern: RepositoryLayerIgnorePatternDraft): GraphLayerDiagnostic[] {
  const normalizedGlob = pattern.glob.normalize('NFC').trim().replace(/\\/g, '/');
  if (!normalizedGlob) {
    return [
      {
        code: 'LAYER_IGNORE_PATTERN_INVALID_GLOB',
        severity: 'error',
        message: 'Ignore pattern glob is empty.',
        layerRuleIds: pattern.ignorePatternId ? [pattern.ignorePatternId] : undefined,
      },
    ];
  }
  try {
    picomatch(normalizedGlob, { dot: true, nocase: false });
    return [];
  } catch (err) {
    return [
      {
        code: 'LAYER_IGNORE_PATTERN_INVALID_GLOB',
        severity: 'error',
        message: err instanceof Error ? err.message : 'Invalid ignore glob.',
        layerRuleIds: pattern.ignorePatternId ? [pattern.ignorePatternId] : undefined,
      },
    ];
  }
}

function normalizeRule(rule: RepositoryLayerRuleDraft): RepositoryLayerRule {
  return {
    layerRuleId: rule.layerRuleId ?? randomUUID(),
    glob: rule.glob.normalize('NFC').trim().replace(/\\/g, '/'),
    layerPath: rule.layerPath
      .normalize('NFC')
      .trim()
      .replace(/^\/+|\/+$/g, ''),
    displayName: rule.displayName.normalize('NFC').trim(),
    description: rule.description?.normalize('NFC') ?? null,
    order: rule.order,
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

function normalizeIgnorePattern(
  pattern: RepositoryLayerIgnorePatternDraft,
): RepositoryLayerIgnorePattern {
  return {
    ignorePatternId: pattern.ignorePatternId ?? randomUUID(),
    glob: pattern.glob.normalize('NFC').trim().replace(/\\/g, '/'),
    reason: pattern.reason?.normalize('NFC') ?? null,
    enabled: pattern.enabled,
  };
}

export class LayerProfileStore {
  private readonly db: Database.Database;

  constructor(userDataPath: string) {
    this.db = new Database(path.join(userDataPath, 'poc3-graph-review.db'));
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  close(): void {
    this.db.close();
  }

  validateDraft(draft: RepositoryLayerProfileDraft): GraphLayerDiagnostic[] {
    const diagnostics: GraphLayerDiagnostic[] = [];
    if ((draft.schemaVersion ?? LAYER_PROFILE_SCHEMA_VERSION) !== LAYER_PROFILE_SCHEMA_VERSION) {
      diagnostics.push({
        code: 'LAYER_PROFILE_UNSUPPORTED_VERSION',
        severity: 'error',
        message: 'Unsupported layer profile schema version.',
      });
    }
    if (!draft.repositoryProfileId.trim()) {
      diagnostics.push({
        code: 'LAYER_PROFILE_INVALID_REPOSITORY_PROFILE',
        severity: 'error',
        message: 'repositoryProfileId is empty.',
      });
    }
    if (!draft.displayName.trim()) {
      diagnostics.push({
        code: 'LAYER_PROFILE_INVALID_DISPLAY_NAME',
        severity: 'error',
        message: 'displayName is empty.',
      });
    }
    if (
      typeof draft.layoutDirection !== 'string' ||
      !VALID_LAYOUT_DIRECTIONS.has(draft.layoutDirection)
    ) {
      diagnostics.push({
        code: 'LAYER_PROFILE_INVALID_ENUM',
        severity: 'error',
        message: 'Invalid layoutDirection.',
      });
    }
    if (
      typeof draft.dependencyDirection !== 'string' ||
      !VALID_DEPENDENCY_DIRECTIONS.has(draft.dependencyDirection)
    ) {
      diagnostics.push({
        code: 'LAYER_PROFILE_INVALID_ENUM',
        severity: 'error',
        message: 'Invalid dependencyDirection.',
      });
    }
    if (
      typeof draft.layoutStrategy !== 'string' ||
      !VALID_LAYOUT_STRATEGIES.has(draft.layoutStrategy)
    ) {
      diagnostics.push({
        code: 'LAYER_PROFILE_INVALID_ENUM',
        severity: 'error',
        message: 'Invalid layoutStrategy.',
      });
    }
    for (const rule of draft.rules) {
      diagnostics.push(...validateRule(rule));
    }
    for (const pattern of draft.ignoredPatterns) {
      diagnostics.push(...validateIgnorePattern(pattern));
    }
    return diagnostics;
  }

  getByRepositoryProfileId(repositoryProfileId: string): RepositoryLayerProfile | null {
    return this.readByRepositoryProfileId(repositoryProfileId).profile;
  }

  readByRepositoryProfileId(repositoryProfileId: string): LayerProfileReadResult {
    const row = this.db
      .prepare('SELECT * FROM repository_layer_profiles WHERE repository_profile_id = ?')
      .get(repositoryProfileId) as RepositoryLayerProfileRow | undefined;
    return row ? this.rowToProfile(row) : { profile: null, diagnostics: [] };
  }

  findLatestReusableProfile(input: {
    repositoryIdentityKey: string;
    excludeRepositoryProfileId?: string | null;
  }): RepositoryLayerProfile | null {
    const rows = this.db
      .prepare(
        `
          SELECT * FROM repository_layer_profiles
          WHERE repository_identity_key = ?
            AND repository_profile_id != COALESCE(?, '')
          ORDER BY updated_at DESC
        `,
      )
      .all(input.repositoryIdentityKey, input.excludeRepositoryProfileId ?? null) as
      | RepositoryLayerProfileRow[]
      | undefined;
    for (const row of rows ?? []) {
      const result = this.rowToProfile(row);
      if (result.profile) {
        return result.profile;
      }
    }
    return null;
  }

  findLatestReusableProfileForRepository(
    repositoryProfile: RepositoryProfile,
  ): RepositoryLayerProfile | null {
    return this.findLatestReusableProfile({
      repositoryIdentityKey: buildRepositoryIdentityKey(repositoryProfile),
      excludeRepositoryProfileId: repositoryProfile.repositoryProfileId,
    });
  }

  save(input: {
    draft: RepositoryLayerProfileDraft;
    repositoryProfile?: RepositoryProfile | null;
  }): RepositoryLayerProfile {
    const diagnostics = this.validateDraft(input.draft);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      throw new Error('Layer profile draft is invalid.');
    }

    const current = input.draft.layerProfileId
      ? this.getByLayerProfileId(input.draft.layerProfileId)
      : this.getByRepositoryProfileId(input.draft.repositoryProfileId);
    const timestamp = nowIso();
    const layerProfileId = current?.layerProfileId ?? input.draft.layerProfileId ?? randomUUID();
    const repositoryIdentityKey =
      input.draft.repositoryIdentityKey ??
      (input.repositoryProfile ? buildRepositoryIdentityKey(input.repositoryProfile) : null) ??
      current?.repositoryIdentityKey ??
      input.draft.repositoryProfileId;
    const profileVersion = current ? current.profileVersion + 1 : 1;
    const profile: RepositoryLayerProfile = {
      layerProfileId,
      repositoryProfileId: input.draft.repositoryProfileId,
      repositoryIdentityKey,
      schemaVersion: LAYER_PROFILE_SCHEMA_VERSION,
      profileVersion,
      displayName: input.draft.displayName.normalize('NFC').trim(),
      layoutDirection: input.draft.layoutDirection,
      dependencyDirection: input.draft.dependencyDirection,
      layoutStrategy: input.draft.layoutStrategy,
      rules: input.draft.rules.map(normalizeRule),
      ignoredPatterns: input.draft.ignoredPatterns.map(normalizeIgnorePattern),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastAppliedAt: current?.lastAppliedAt ?? null,
    };

    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO repository_layer_profiles (
            layer_profile_id, repository_profile_id, repository_identity_key,
            schema_version, profile_version, display_name, layout_direction,
            dependency_direction, layout_strategy, rules_json, ignored_patterns_json,
            created_at, updated_at, last_applied_at
          ) VALUES (
            @layer_profile_id, @repository_profile_id, @repository_identity_key,
            @schema_version, @profile_version, @display_name, @layout_direction,
            @dependency_direction, @layout_strategy, @rules_json, @ignored_patterns_json,
            @created_at, @updated_at, @last_applied_at
          )
        `,
      )
      .run({
        layer_profile_id: profile.layerProfileId,
        repository_profile_id: profile.repositoryProfileId,
        repository_identity_key: profile.repositoryIdentityKey,
        schema_version: profile.schemaVersion,
        profile_version: profile.profileVersion,
        display_name: profile.displayName,
        layout_direction: profile.layoutDirection,
        dependency_direction: profile.dependencyDirection,
        layout_strategy: profile.layoutStrategy,
        rules_json: JSON.stringify(profile.rules),
        ignored_patterns_json: JSON.stringify(profile.ignoredPatterns),
        created_at: profile.createdAt,
        updated_at: profile.updatedAt,
        last_applied_at: profile.lastAppliedAt,
      });

    return profile;
  }

  getByLayerProfileId(layerProfileId: string): RepositoryLayerProfile | null {
    const row = this.db
      .prepare('SELECT * FROM repository_layer_profiles WHERE layer_profile_id = ?')
      .get(layerProfileId) as RepositoryLayerProfileRow | undefined;
    return row ? this.rowToProfile(row).profile : null;
  }

  markApplied(input: { layerProfileId: string; appliedAt: string }): void {
    this.db
      .prepare(
        `
          UPDATE repository_layer_profiles
          SET last_applied_at = ?
          WHERE layer_profile_id = ?
        `,
      )
      .run(input.appliedAt, input.layerProfileId);
  }

  private rowToProfile(row: RepositoryLayerProfileRow): LayerProfileReadResult {
    if (row.schema_version !== LAYER_PROFILE_SCHEMA_VERSION) {
      return {
        profile: null,
        diagnostics: [
          {
            code: 'LAYER_PROFILE_UNSUPPORTED_VERSION',
            severity: 'error',
            message: 'Unsupported layer profile schema version.',
          },
        ],
      };
    }
    const rulesJson = parseJsonArray(row.rules_json, 'LAYER_PROFILE_RULES_JSON_INVALID');
    const ignoredPatternsJson = parseJsonArray(
      row.ignored_patterns_json,
      'LAYER_PROFILE_IGNORES_JSON_INVALID',
    );
    const storedRules = rulesJson.value.map(validateStoredRule);
    const storedIgnoredPatterns = ignoredPatternsJson.value.map(validateStoredIgnorePattern);
    const diagnostics = [
      ...validateStoredProfileRow(row),
      ...rulesJson.diagnostics,
      ...ignoredPatternsJson.diagnostics,
      ...storedRules.flatMap((result) => result.diagnostics),
      ...storedIgnoredPatterns.flatMap((result) => result.diagnostics),
    ];
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { profile: null, diagnostics };
    }
    const rules = storedRules
      .map((result) => result.rule)
      .filter((rule): rule is RepositoryLayerRule => rule !== null);
    const ignoredPatterns = storedIgnoredPatterns
      .map((result) => result.pattern)
      .filter((pattern): pattern is RepositoryLayerIgnorePattern => pattern !== null);
    return {
      profile: {
        layerProfileId: row.layer_profile_id,
        repositoryProfileId: row.repository_profile_id,
        repositoryIdentityKey: row.repository_identity_key,
        schemaVersion: row.schema_version,
        profileVersion: row.profile_version,
        displayName: row.display_name,
        layoutDirection: row.layout_direction,
        dependencyDirection: row.dependency_direction,
        layoutStrategy: row.layout_strategy,
        rules,
        ignoredPatterns,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAppliedAt: row.last_applied_at,
      },
      diagnostics,
    };
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repository_layer_profiles (
        layer_profile_id TEXT PRIMARY KEY,
        repository_profile_id TEXT NOT NULL,
        repository_identity_key TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        profile_version INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        layout_direction TEXT NOT NULL,
        dependency_direction TEXT NOT NULL,
        layout_strategy TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        ignored_patterns_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_applied_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_repository_layer_profiles_profile
        ON repository_layer_profiles(repository_profile_id);

      CREATE INDEX IF NOT EXISTS idx_repository_layer_profiles_identity
        ON repository_layer_profiles(repository_identity_key, updated_at);
    `);
  }
}
