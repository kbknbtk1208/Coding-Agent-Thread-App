import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AGENT_IPC_CHANNELS,
  type AgentEventPayload,
  type AgentSessionSnapshot,
  type SendFollowUpInput,
  type StartSessionInput,
} from '../shared/contracts/agent-ipc';

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

const agentApi = {
  listSessions(): Promise<AgentSessionSnapshot[]> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.listSessions);
  },
  onAgentEvent(callback: (event: AgentEventPayload) => void) {
    const subscription = (_event: IpcRendererEvent, payload: AgentEventPayload) =>
      callback(payload);
    ipcRenderer.on(AGENT_IPC_CHANNELS.event, subscription);

    return () => {
      ipcRenderer.removeListener(AGENT_IPC_CHANNELS.event, subscription);
    };
  },
  sendFollowUp(input: SendFollowUpInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.sendFollowUp, input);
  },
  startSession(input: StartSessionInput): Promise<AgentSessionSnapshot> {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.startSession, input);
  },
};

contextBridge.exposeInMainWorld('ipc', handler);
contextBridge.exposeInMainWorld('agentApi', agentApi);

export type IpcHandler = typeof handler;
export type AgentApi = typeof agentApi;
