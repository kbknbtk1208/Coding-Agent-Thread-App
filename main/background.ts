import { app, BrowserWindow, ipcMain } from 'electron';
import serve from 'electron-serve';
import path from 'path';
import {
  AGENT_IPC_CHANNELS,
  type ContinueConversationInput,
  type ForkSessionInput,
  type ListCodexModelsInput,
  type RespondPermissionInput,
  type SendFollowUpInput,
  type StartSessionInput,
  type SteerActiveTurnInput,
} from '../shared/contracts/agent-ipc';
import {
  type AwaitDraftReviewResultInput,
  type AwaitDraftThreadReplyResultInput,
  type AwaitSelectionMentionResultInput,
  type BeginDraftReviewInput,
  type BeginDraftThreadReplyInput,
  type BeginSelectionMentionInput,
  type CreateReviewThreadInput,
  type HydrateReviewFileInput,
  type LoadReviewSourceInput,
  REVIEW_IPC_CHANNELS,
  type ReplyReviewThreadInput,
  type PreparePublishDraftsInput,
  type UpdatePublishDraftsInput,
  type PublishDraftsInput,
  type PromoteSelectionMentionToDraftInput,
} from '../shared/contracts/review-ipc';
import { AgentGateway } from './agent-gateway/agent-gateway';
import { SqliteSessionStore } from './agent-gateway/session-store';
import { createWindow } from './helpers';
import { loadMainEnvironment } from './load-main-environment';
import { GraphReviewGateway } from './poc3-graph-review/graph-review-gateway';
import { registerPoc3GraphReviewIpc } from './poc3-graph-review/ipc';
import { POC3_GRAPH_REVIEW_IPC_CHANNELS } from '../shared/poc3-contracts/graph-review-ipc';
import { ReviewGateway } from './review-gateway/review-gateway';

loadMainEnvironment();

const isProd = process.env.NODE_ENV === 'production';
const devServerPort = process.argv[2];

let mainWindow: BrowserWindow | null = null;

async function createMainAppWindow() {
  const window = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;

  if (isProd) {
    await window.loadURL('app://./home');
  } else {
    await window.loadURL(`http://localhost:${devServerPort}/home`);
  }

  return window;
}

if (isProd) {
  serve({ directory: 'app' });
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();

  await createMainAppWindow();

  const sessionStore = new SqliteSessionStore(app.getPath('userData'));
  let graphReviewGateway: GraphReviewGateway | null = null;
  const gateway = new AgentGateway((event) => {
    graphReviewGateway?.handleAgentEvent(event);
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(AGENT_IPC_CHANNELS.event, event);
  }, sessionStore);

  ipcMain.handle(AGENT_IPC_CHANNELS.listSessions, () => {
    return gateway.listSessions();
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.listCodexModels, (_event, input?: ListCodexModelsInput) => {
    return gateway.listCodexModels(input?.cwd?.trim() || process.cwd());
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.getDefaultCwd, () => {
    return process.cwd();
  });

  ipcMain.handle(
    AGENT_IPC_CHANNELS.continueConversation,
    (_event, input: ContinueConversationInput) => {
      return gateway.continueConversation(input);
    },
  );

  ipcMain.handle(AGENT_IPC_CHANNELS.startSession, (_event, input: StartSessionInput) => {
    return gateway.startSession(input);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.sendFollowUp, (_event, input: SendFollowUpInput) => {
    return gateway.sendFollowUp(input);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.forkSession, (_event, input: ForkSessionInput) => {
    return gateway.forkSession(input);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.steerActiveTurn, (_event, input: SteerActiveTurnInput) => {
    return gateway.steerActiveTurn(input);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.respondPermission, (_event, input: RespondPermissionInput) => {
    return gateway.respondPermission(input);
  });

  const reviewGateway = new ReviewGateway({ agentGateway: gateway });
  graphReviewGateway = new GraphReviewGateway(
    app.getPath('userData'),
    (event) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send(POC3_GRAPH_REVIEW_IPC_CHANNELS.workspaceCreationEvent, event);
    },
    (event) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send(POC3_GRAPH_REVIEW_IPC_CHANNELS.graphAnalysisEvent, event);
    },
    (event) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send(POC3_GRAPH_REVIEW_IPC_CHANNELS.agentReviewEvent, event);
    },
    (event) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send(POC3_GRAPH_REVIEW_IPC_CHANNELS.revisionRefreshEvent, event);
    },
    gateway,
    (event) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send(POC3_GRAPH_REVIEW_IPC_CHANNELS.resolveJudgementEvent, event);
    },
  );

  ipcMain.handle(REVIEW_IPC_CHANNELS.loadReviewSource, (_event, input: LoadReviewSourceInput) => {
    return reviewGateway.loadReviewSource(input.source);
  });

  ipcMain.handle(REVIEW_IPC_CHANNELS.hydrateReviewFile, (_event, input: HydrateReviewFileInput) => {
    return reviewGateway.hydrateReviewFile(input.snapshotId, input.fileId);
  });

  ipcMain.handle(REVIEW_IPC_CHANNELS.createThread, (_event, input: CreateReviewThreadInput) => {
    const thread = reviewGateway.createThread(
      input.snapshotId,
      input.fileId,
      input.anchor,
      input.body,
    );
    return { thread };
  });

  ipcMain.handle(REVIEW_IPC_CHANNELS.replyThread, (_event, input: ReplyReviewThreadInput) => {
    const thread = reviewGateway.replyThread(input.snapshotId, input.threadId, input.body);
    return { thread };
  });

  ipcMain.handle(REVIEW_IPC_CHANNELS.beginDraftReview, (_event, input: BeginDraftReviewInput) => {
    return reviewGateway.beginDraftReview({
      ...input,
      cwd: input.cwd?.trim() || process.cwd(),
    });
  });

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.awaitDraftReviewResult,
    (_event, input: AwaitDraftReviewResultInput) => {
      return reviewGateway.awaitDraftReviewResult(input);
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.beginDraftThreadReply,
    (_event, input: BeginDraftThreadReplyInput) => {
      return reviewGateway.beginDraftThreadReply({
        ...input,
        cwd: input.cwd?.trim() || process.cwd(),
      });
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.awaitDraftThreadReplyResult,
    (_event, input: AwaitDraftThreadReplyResultInput) => {
      return reviewGateway.awaitDraftThreadReplyResult(input);
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.beginSelectionMention,
    (_event, input: BeginSelectionMentionInput) => {
      return reviewGateway.beginSelectionMention({
        ...input,
        cwd: input.cwd?.trim() || process.cwd(),
      });
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.awaitSelectionMentionResult,
    (_event, input: AwaitSelectionMentionResultInput) => {
      return reviewGateway.awaitSelectionMentionResult(input);
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.promoteSelectionMentionToDraft,
    (_event, input: PromoteSelectionMentionToDraftInput) => {
      return reviewGateway.promoteSelectionMentionToDraft(input);
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.preparePublishDrafts,
    (_event, input: PreparePublishDraftsInput) => {
      return reviewGateway.preparePublishDrafts(input.snapshotId);
    },
  );

  ipcMain.handle(
    REVIEW_IPC_CHANNELS.updatePublishDrafts,
    (_event, input: UpdatePublishDraftsInput) => {
      return reviewGateway.updatePublishDrafts(input.snapshotId, input.drafts);
    },
  );

  ipcMain.handle(REVIEW_IPC_CHANNELS.publishDrafts, (_event, input: PublishDraftsInput) => {
    return reviewGateway.publishDrafts(input.snapshotId, input.publishDraftIds);
  });

  registerPoc3GraphReviewIpc(graphReviewGateway, () => mainWindow);

  app.on('before-quit', () => {
    void gateway.dispose();
    graphReviewGateway?.dispose();
  });

  app.on('activate', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (existingWindow) {
      existingWindow.focus();
      return;
    }

    void createMainAppWindow();
  });
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
