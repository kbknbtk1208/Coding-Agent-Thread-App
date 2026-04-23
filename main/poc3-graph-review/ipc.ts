import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type {
  BrowseDirectoryInput,
  CreateReviewWorkspaceInput,
  ResolveReviewWorkspaceTargetInput,
  SaveRepositoryProfileInput,
  SaveRepositoryProviderInput,
  TestRepositoryProviderInput,
  ValidateRepositoryProfileInput,
} from '../../shared/poc3-contracts/graph-review-ipc';
import { POC3_GRAPH_REVIEW_IPC_CHANNELS } from '../../shared/poc3-contracts/graph-review-ipc';
import type { GraphReviewGateway } from './graph-review-gateway';

export function registerPoc3GraphReviewIpc(
  gateway: GraphReviewGateway,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(POC3_GRAPH_REVIEW_IPC_CHANNELS.listRepositoryProviders, () => {
    return { providers: gateway.listRepositoryProviders() };
  });

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.saveRepositoryProvider,
    (_event, input: SaveRepositoryProviderInput) => {
      return { provider: gateway.saveRepositoryProvider(input.provider) };
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.testRepositoryProvider,
    async (_event, input: TestRepositoryProviderInput) => {
      return { result: await gateway.testRepositoryProvider(input.provider) };
    },
  );

  ipcMain.handle(POC3_GRAPH_REVIEW_IPC_CHANNELS.listRepositoryProfiles, () => {
    return { profiles: gateway.listRepositoryProfiles() };
  });

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveRepositoryProvider,
    (_event, input: { originUrl: string }) => {
      return gateway.resolveRepositoryProvider(input.originUrl);
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.validateRepositoryProfile,
    async (_event, input: ValidateRepositoryProfileInput) => {
      return { result: await gateway.validateRepositoryProfile(input.profile) };
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.saveRepositoryProfile,
    async (_event, input: SaveRepositoryProfileInput) => {
      return { profile: await gateway.saveRepositoryProfile(input.profile) };
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.browseDirectory,
    async (_event, input: BrowseDirectoryInput) => {
      const window = getMainWindow();
      const options: OpenDialogOptions = {
        title: input.title,
        defaultPath: input.defaultPath,
        properties: ['openDirectory'],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);

      return {
        canceled: result.canceled,
        path: result.filePaths[0] ?? null,
      };
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveReviewWorkspaceTarget,
    (_event, input: ResolveReviewWorkspaceTargetInput) => {
      return gateway.resolveReviewWorkspaceTarget(input.reviewUrl);
    },
  );

  ipcMain.handle(
    POC3_GRAPH_REVIEW_IPC_CHANNELS.createReviewWorkspace,
    (_event, input: CreateReviewWorkspaceInput) => {
      return { job: gateway.createReviewWorkspace(input) };
    },
  );

  ipcMain.handle(POC3_GRAPH_REVIEW_IPC_CHANNELS.listReviewWorkspaces, () => {
    return { workspaces: gateway.listReviewWorkspaces() };
  });

  ipcMain.handle(POC3_GRAPH_REVIEW_IPC_CHANNELS.listWorkspaceCreationJobs, () => {
    return { jobs: gateway.listWorkspaceCreationJobs() };
  });
}
