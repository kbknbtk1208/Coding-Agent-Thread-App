import type { AgentApi, IpcHandler } from '../main/preload';

declare global {
  interface Window {
    agentApi: AgentApi;
    ipc: IpcHandler;
  }
}
