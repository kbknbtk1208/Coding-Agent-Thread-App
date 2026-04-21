import type { AgentApi, IpcHandler, Poc3GraphReviewApi, ReviewApi } from '../main/preload';

declare global {
  interface Window {
    agentApi: AgentApi;
    ipc: IpcHandler;
    poc3GraphReviewApi: Poc3GraphReviewApi;
    reviewApi: ReviewApi;
  }
}
