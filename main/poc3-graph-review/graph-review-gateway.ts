import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositoryProfileValidationResult,
  RepositoryProviderConnectionResult,
  RepositoryProviderSecretInput,
  ResolveRepositoryProviderResult,
} from '../../shared/poc3-domain/repository';
import { apiEndpointForProvider } from './source/repository-url';
import { RepositoryProfileStore } from './workspace/repository-profile-store';
import {
  resolveLocatorForProvider,
  resolveRepositoryProviderCandidates,
} from './workspace/repository-profile-resolver';
import { validateRepositoryProfileInput } from './workspace/repository-profile-validator';
import { RepositoryProviderStore } from './workspace/repository-provider-store';

export class GraphReviewGateway {
  private readonly providerStore: RepositoryProviderStore;
  private readonly profileStore: RepositoryProfileStore;

  constructor(userDataPath: string) {
    this.providerStore = new RepositoryProviderStore(userDataPath);
    this.profileStore = new RepositoryProfileStore(userDataPath);
  }

  listRepositoryProviders(): PublicRepositoryProvider[] {
    return this.providerStore.list();
  }

  saveRepositoryProvider(input: RepositoryProviderSecretInput): PublicRepositoryProvider {
    return this.providerStore.save(input);
  }

  async testRepositoryProvider(
    input: RepositoryProviderSecretInput,
  ): Promise<RepositoryProviderConnectionResult> {
    let token = input.token?.trim() ?? '';
    if (!token && input.repositoryProviderId) {
      const current = this.providerStore.get(input.repositoryProviderId);
      token = current ? (this.providerStore.getToken(current.tokenRef) ?? '') : '';
    }
    if (!token) {
      return {
        ok: false,
        statusCode: null,
        message: 'Token が入力されていません。',
      };
    }

    let endpoint: string;
    try {
      endpoint = apiEndpointForProvider(input.kind, input.baseUrl);
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        message: err instanceof Error ? err.message : 'Base URL を解釈できません。',
      };
    }

    const url = input.kind === 'github' ? `${endpoint}/rate_limit` : `${endpoint}/user`;
    try {
      const response = await fetch(url, {
        headers:
          input.kind === 'github'
            ? {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
              }
            : {
                'PRIVATE-TOKEN': token,
              },
      });

      return {
        ok: response.ok,
        statusCode: response.status,
        message: response.ok
          ? 'Provider へ接続できました。'
          : `Provider への接続に失敗しました。HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        message: err instanceof Error ? err.message : 'Provider への接続に失敗しました。',
      };
    }
  }

  listRepositoryProfiles(): RepositoryProfile[] {
    return this.profileStore.list();
  }

  resolveRepositoryProvider(originUrl: string): ResolveRepositoryProviderResult {
    return resolveRepositoryProviderCandidates(originUrl, this.providerStore.listInternal());
  }

  async validateRepositoryProfile(
    input: RepositoryProfileInput,
  ): Promise<RepositoryProfileValidationResult> {
    return validateRepositoryProfileInput(
      input,
      this.providerStore.get(input.repositoryProviderId),
    );
  }

  async saveRepositoryProfile(input: RepositoryProfileInput): Promise<RepositoryProfile> {
    const provider = this.providerStore.get(input.repositoryProviderId);
    const validation = await validateRepositoryProfileInput(input, provider);
    if (!validation.ok || !provider) {
      const message = validation.issues[0]?.message ?? 'Repository Profile を保存できません。';
      throw new Error(message);
    }

    const resolved = resolveLocatorForProvider(input.originUrl, provider);
    return this.profileStore.save({
      ...input,
      originUrl: resolved.normalizedOriginUrl,
      resolvedProvider: {
        kind: provider.kind,
        baseUrl: provider.baseUrl,
        host: resolved.host,
      },
      repoLocator: resolved.repoLocator,
    });
  }

  dispose(): void {
    this.providerStore.close();
    this.profileStore.close();
  }
}
