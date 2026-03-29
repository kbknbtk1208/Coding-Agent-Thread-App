import type { AgentApi, IpcHandler, ReviewApi } from '../main/preload';

declare global {
  interface Window {
    agentApi: AgentApi;
    ipc: IpcHandler;
    reviewApi: ReviewApi;
  }
}
