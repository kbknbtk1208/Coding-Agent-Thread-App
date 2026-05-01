'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useAgentReviewThreadConversations,
  type UseAgentReviewThreadConversationsReturn,
} from './use-agent-review-thread-conversations';

const AgentThreadConversationContext =
  createContext<UseAgentReviewThreadConversationsReturn | null>(null);

export interface AgentThreadConversationProviderProps {
  reviewWorkspaceId: string | null;
  revisionId: string | null;
  children: ReactNode;
}

export function AgentThreadConversationProvider({
  reviewWorkspaceId,
  revisionId,
  children,
}: AgentThreadConversationProviderProps) {
  const value = useAgentReviewThreadConversations({
    reviewWorkspaceId,
    revisionId,
  });

  return (
    <AgentThreadConversationContext.Provider value={value}>
      {children}
    </AgentThreadConversationContext.Provider>
  );
}

export function useAgentThreadConversationContext() {
  const context = useContext(AgentThreadConversationContext);
  if (!context) {
    throw new Error(
      'useAgentThreadConversationContext must be used within AgentThreadConversationProvider.',
    );
  }
  return context;
}
