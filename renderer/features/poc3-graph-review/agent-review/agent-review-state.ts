import type { AgentStatus } from '../../../../shared/domain/agent';
import type { AgentReviewPromptContext, AgentReviewRunStatus } from './agent-review-types';

export const DEFAULT_AGENT_REVIEW_INSTRUCTIONS =
  '差分ノードを中心に、設計・テスト・保守性の観点でレビューしてください。重大度付きの findings と、必要な追加確認を簡潔に出してください。';

export function toAgentReviewRunStatus(status: AgentStatus): AgentReviewRunStatus {
  if (status === 'waiting_permission') {
    return 'waiting_permission';
  }
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'starting') {
    return 'starting';
  }
  return 'running';
}

export function isAgentReviewRunActive(status: AgentReviewRunStatus) {
  return status === 'starting' || status === 'running' || status === 'waiting_permission';
}

export function buildAgentReviewPrompt({ graph, workspace }: AgentReviewPromptContext): string {
  const diffNodes = graph.nodes.filter((node) => node.isDiffNode);
  const findingNodes = graph.nodes.filter((node) => node.badges.findingCount > 0);
  const changedFiles = Array.from(
    new Set(
      diffNodes
        .map((node) => node.filePath)
        .filter((filePath): filePath is string => Boolean(filePath)),
    ),
  ).slice(0, 24);
  const focusedNodes = diffNodes.slice(0, 20).map((node) => ({
    id: node.nodeId,
    label: node.label,
    kind: node.kind,
    filePath: node.filePath,
    changedLines: node.badges.changedLines,
  }));

  return [
    'PoC-3 Agent Review を実行してください。',
    '',
    `Review workspace: ${workspace.repositoryLabel} ${workspace.provider}#${workspace.reviewId}`,
    `Title: ${workspace.title}`,
    `Graph snapshot: ${graph.graphSnapshotId}`,
    `Scope: ${graph.scopeKey}`,
    `Graph status: ${graph.status}`,
    `Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}, Diff nodes: ${diffNodes.length}`,
    '',
    'Changed files:',
    changedFiles.length > 0 ? changedFiles.map((filePath) => `- ${filePath}`).join('\n') : '- none',
    '',
    'Focused graph nodes:',
    focusedNodes.length > 0
      ? focusedNodes
          .map(
            (node) =>
              `- ${node.id}: ${node.label} (${node.kind}) ${node.filePath ?? 'no file'} changedLines=${node.changedLines}`,
          )
          .join('\n')
      : '- none',
    '',
    findingNodes.length > 0
      ? `Existing finding nodes: ${findingNodes.map((node) => `${node.label}:${node.badges.findingCount}`).join(', ')}`
      : 'Existing finding nodes: none',
    '',
    '期待する出力:',
    '- overview findings: PR / MR 全体の主要な指摘',
    '- inline findings: nodeId または filePath/line に紐づく指摘',
    '- permission が必要な操作は必ず要求する',
  ].join('\n');
}
