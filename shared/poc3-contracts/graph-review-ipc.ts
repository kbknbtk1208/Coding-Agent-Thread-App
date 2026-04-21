import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositoryProfileValidationResult,
  RepositoryProviderConnectionResult,
  RepositoryProviderSecretInput,
  ResolveRepositoryProviderResult,
} from '../poc3-domain/repository';

export type { ResolveRepositoryProviderResult } from '../poc3-domain/repository';

export const POC3_GRAPH_REVIEW_IPC_CHANNELS = {
  listRepositoryProviders: 'poc3:repository-provider:list',
  saveRepositoryProvider: 'poc3:repository-provider:save',
  testRepositoryProvider: 'poc3:repository-provider:test',
  listRepositoryProfiles: 'poc3:repository-profile:list',
  resolveRepositoryProvider: 'poc3:repository-profile:resolve-provider',
  validateRepositoryProfile: 'poc3:repository-profile:validate',
  saveRepositoryProfile: 'poc3:repository-profile:save',
  browseDirectory: 'poc3:system:browse-directory',
} as const;

export interface ListRepositoryProvidersResult {
  providers: PublicRepositoryProvider[];
}

export interface SaveRepositoryProviderInput {
  provider: RepositoryProviderSecretInput;
}

export interface SaveRepositoryProviderResult {
  provider: PublicRepositoryProvider;
}

export interface TestRepositoryProviderInput {
  provider: RepositoryProviderSecretInput;
}

export interface TestRepositoryProviderResult {
  result: RepositoryProviderConnectionResult;
}

export interface ListRepositoryProfilesResult {
  profiles: RepositoryProfile[];
}

export interface ResolveRepositoryProviderInput {
  originUrl: string;
}

export interface ValidateRepositoryProfileInput {
  profile: RepositoryProfileInput;
}

export interface ValidateRepositoryProfileResult {
  result: RepositoryProfileValidationResult;
}

export interface SaveRepositoryProfileInput {
  profile: RepositoryProfileInput;
}

export interface SaveRepositoryProfileResult {
  profile: RepositoryProfile;
}

export interface BrowseDirectoryInput {
  title?: string;
  defaultPath?: string;
}

export interface BrowseDirectoryResult {
  canceled: boolean;
  path: string | null;
}

export interface Poc3GraphReviewApi {
  listRepositoryProviders(): Promise<ListRepositoryProvidersResult>;
  saveRepositoryProvider(input: SaveRepositoryProviderInput): Promise<SaveRepositoryProviderResult>;
  testRepositoryProvider(input: TestRepositoryProviderInput): Promise<TestRepositoryProviderResult>;
  listRepositoryProfiles(): Promise<ListRepositoryProfilesResult>;
  resolveRepositoryProvider(
    input: ResolveRepositoryProviderInput,
  ): Promise<ResolveRepositoryProviderResult>;
  validateRepositoryProfile(
    input: ValidateRepositoryProfileInput,
  ): Promise<ValidateRepositoryProfileResult>;
  saveRepositoryProfile(input: SaveRepositoryProfileInput): Promise<SaveRepositoryProfileResult>;
  browseDirectory(input: BrowseDirectoryInput): Promise<BrowseDirectoryResult>;
}
