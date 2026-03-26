import path from 'path';
import { app, ipcMain } from 'electron';
import serve from 'electron-serve';
import {
  AGENT_IPC_CHANNELS,
  type SendFollowUpInput,
  type StartSessionInput,
} from '../shared/contracts/agent-ipc';
import { MockAgentGateway } from './agent-gateway/mock-agent-gateway';
import { createWindow } from './helpers';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({ directory: 'app' });
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
    mainWindow.webContents.openDevTools();
  }

  const gateway = new MockAgentGateway((event) => {
    mainWindow.webContents.send(AGENT_IPC_CHANNELS.event, event);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.listSessions, () => {
    return gateway.listSessions();
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.startSession, (_event, input: StartSessionInput) => {
    return gateway.startSession(input);
  });

  ipcMain.handle(AGENT_IPC_CHANNELS.sendFollowUp, (_event, input: SendFollowUpInput) => {
    return gateway.sendFollowUp(input);
  });
})();

app.on('window-all-closed', () => {
  app.quit();
});
