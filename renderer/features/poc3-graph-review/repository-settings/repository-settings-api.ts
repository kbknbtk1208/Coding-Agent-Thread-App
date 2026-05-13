import type {
  BrowseDirectoryInput,
  BrowseDirectoryResult,
  InferRepositoryLayerProfileInput,
  InferRepositoryLayerProfileResult,
  ListRepositoryProfilesResult,
  ListRepositoryProvidersResult,
  LoadRepositoryLayerProfileInput,
  LoadRepositoryLayerProfileResult,
  PreviewRepositoryLayerProfileInput,
  PreviewRepositoryLayerProfileResult,
  RecomputeWorkspaceLayerLayoutInput,
  RecomputeWorkspaceLayerLayoutResult,
  ResolveRepositoryProviderInput,
  SaveRepositoryProfileInput,
  SaveRepositoryProfileResult,
  SaveRepositoryLayerProfileInput,
  SaveRepositoryLayerProfileResult,
  SaveRepositoryProviderInput,
  SaveRepositoryProviderResult,
  TestRepositoryProviderInput,
  TestRepositoryProviderResult,
  ValidateRepositoryLayerProfileInput,
  ValidateRepositoryLayerProfileResult,
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
  loadLayerProfile: (
    input: LoadRepositoryLayerProfileInput,
  ) => Promise<LoadRepositoryLayerProfileResult>;
  inferLayerProfile: (
    input: InferRepositoryLayerProfileInput,
  ) => Promise<InferRepositoryLayerProfileResult>;
  validateLayerProfile: (
    input: ValidateRepositoryLayerProfileInput,
  ) => Promise<ValidateRepositoryLayerProfileResult>;
  saveLayerProfile: (
    input: SaveRepositoryLayerProfileInput,
  ) => Promise<SaveRepositoryLayerProfileResult>;
  previewLayerProfile: (
    input: PreviewRepositoryLayerProfileInput,
  ) => Promise<PreviewRepositoryLayerProfileResult>;
  recomputeWorkspaceLayerLayout: (
    input: RecomputeWorkspaceLayerLayoutInput,
  ) => Promise<RecomputeWorkspaceLayerLayoutResult>;
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
  loadLayerProfile: (input) => window.poc3GraphReviewApi.loadRepositoryLayerProfile(input),
  inferLayerProfile: (input) => window.poc3GraphReviewApi.inferRepositoryLayerProfile(input),
  validateLayerProfile: (input) => window.poc3GraphReviewApi.validateRepositoryLayerProfile(input),
  saveLayerProfile: (input) => window.poc3GraphReviewApi.saveRepositoryLayerProfile(input),
  previewLayerProfile: (input) => window.poc3GraphReviewApi.previewRepositoryLayerProfile(input),
  recomputeWorkspaceLayerLayout: (input) =>
    window.poc3GraphReviewApi.recomputeWorkspaceLayerLayout(input),
};
