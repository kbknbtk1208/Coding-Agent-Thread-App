'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type NodeDetailScrollTarget =
  | { kind: 'agent-thread'; localThreadId: string; nonce: number }
  | { kind: 'remote-thread'; providerThreadId: string; nonce: number };

const NodeDetailScrollTargetContext = createContext<NodeDetailScrollTarget | null>(null);

export function NodeDetailScrollTargetProvider({
  target,
  children,
}: {
  target: NodeDetailScrollTarget | null;
  children: ReactNode;
}) {
  return (
    <NodeDetailScrollTargetContext.Provider value={target}>
      {children}
    </NodeDetailScrollTargetContext.Provider>
  );
}

export function useNodeDetailScrollTarget(): NodeDetailScrollTarget | null {
  return useContext(NodeDetailScrollTargetContext);
}

export function isAgentThreadScrollTarget(
  target: NodeDetailScrollTarget | null,
  localThreadId: string,
): target is Extract<NodeDetailScrollTarget, { kind: 'agent-thread' }> {
  return target?.kind === 'agent-thread' && target.localThreadId === localThreadId;
}

export function isRemoteThreadScrollTarget(
  target: NodeDetailScrollTarget | null,
  providerThreadId: string,
): target is Extract<NodeDetailScrollTarget, { kind: 'remote-thread' }> {
  return target?.kind === 'remote-thread' && target.providerThreadId === providerThreadId;
}
