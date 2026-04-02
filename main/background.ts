import path from 'path';
import { BrowserWindow, app, ipcMain } from 'electron';
import serve from 'electron-serve';
import {
  AGENT_IPC_CHANNELS,
  type ContinueConversationInput,
  type ForkSessionInput,
  type RespondPermissionInput,
  type SendFollowUpInput,
  type StartSessionInput,
  type SteerActiveTurnInput,
} from '../shared/contracts/agent-ipc';
import {
  REVIEW_IPC_CHANNELS,
  type CreateReviewThreadInput,
  type HydrateReviewFileInput,
  type LoadReviewSourceInput,
  type ReplyReviewThreadInput,
} from '../shared/contracts/review-ipc';
import { AgentGateway } from './agent-gateway/agent-gateway';
import { SqliteSessionStore } from './agent-gateway/session-store';
import { createWindow } from './helpers';
import { loadMainEnvironment } from './load-main-environment';
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
  const gateway = new AgentGateway((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(AGENT_IPC_CHANNELS.event, event);
  }, sessionStore);

  ipcMain.handle(AGENT_IPC_CHANNELS.listSessions, () => {
    return gateway.listSessions();
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

  const reviewGateway = new ReviewGateway();

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

  app.on('before-quit', () => {
    void gateway.dispose();
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
