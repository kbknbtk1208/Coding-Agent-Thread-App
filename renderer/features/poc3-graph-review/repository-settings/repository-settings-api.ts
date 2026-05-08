import type {
  BrowseDirectoryInput,
  BrowseDirectoryResult,
  ListRepositoryProfilesResult,
  ListRepositoryProvidersResult,
  ResolveRepositoryProviderInput,
  SaveRepositoryProfileInput,
  SaveRepositoryProfileResult,
  SaveRepositoryProviderInput,
  SaveRepositoryProviderResult,
  TestRepositoryProviderInput,
  TestRepositoryProviderResult,
  ValidateRepositoryProfileInput,
  ValidateRepositoryProfileResult,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ResolveRepositoryProviderResult } from '../../../../shared/poc3-domain/repository';

export interface RepositorySettingsApi {
  listProviders: () => Promise<ListRepositoryProvidersResult>;
  saveProvider: (input: SaveRepositoryProviderInput) => Promise<SaveRepositoryProviderResult>;
  testProvider: (input: TestRepositoryProviderInput) => Promise<TestRepositoryProviderResult>;
  listProfiles: () => Promise<ListRepositoryProfilesResult>;
  resolveProvider: (
    input: ResolveRepositoryProviderInput,
  ) => Promise<ResolveRepositoryProviderResult>;
  validateProfile: (
    input: ValidateRepositoryProfileInput,
  ) => Promise<ValidateRepositoryProfileResult>;
  saveProfile: (input: SaveRepositoryProfileInput) => Promise<SaveRepositoryProfileResult>;
  browseDirectory: (input: BrowseDirectoryInput) => Promise<BrowseDirectoryResult>;
}

export const browserRepositorySettingsApi: RepositorySettingsApi = {
  listProviders: () => window.poc3GraphReviewApi.listRepositoryProviders(),
  saveProvider: (input) => window.poc3GraphReviewApi.saveRepositoryProvider(input),
  testProvider: (input) => window.poc3GraphReviewApi.testRepositoryProvider(input),
  listProfiles: () => window.poc3GraphReviewApi.listRepositoryProfiles(),
  resolveProvider: (input) => window.poc3GraphReviewApi.resolveRepositoryProvider(input),
  validateProfile: (input) => window.poc3GraphReviewApi.validateRepositoryProfile(input),
  saveProfile: (input) => window.poc3GraphReviewApi.saveRepositoryProfile(input),
  browseDirectory: (input) => window.poc3GraphReviewApi.browseDirectory(input),
};
