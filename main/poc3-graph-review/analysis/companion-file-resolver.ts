import fs from 'fs';
import path from 'path';
import type {
  CodeCompanionFile,
  CodeFileRole,
  CodeGraphEdge,
  CodeGraphNode,
  CodeRelationSource,
  GraphDiagnostic,
} from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { ExtractedImportEdge } from './dependency-extractor';
import { normalizeRepoPath } from './graph-id';
import { isUnitOrIntegrationTestFile } from './test-file-classifier';

export interface ResolveCompanionFilesInput {
  graphNodes: CodeGraphNode[];
  graphEdges: CodeGraphEdge[];
  imports: ExtractedImportEdge[];
  sourceSnapshot: ReviewSourceSnapshot;
  worktreePath: string | null;
}

export interface ResolveCompanionFilesResult {
  visibleNodes: CodeGraphNode[];
  visibleEdges: CodeGraphEdge[];
  companionFiles: CodeCompanionFile[];
  diagnostics: GraphDiagnostic[];
}

const SOURCE_PRIORITY: Record<CodeRelationSource, number> = {
  import: 0,
  'graph-edge': 1,
  'filename-heuristic': 2,
};
const TYPESCRIPT_FILE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

export function resolveCompanionFiles(
  input: ResolveCompanionFilesInput,
): ResolveCompanionFilesResult {
  const diagnostics: GraphDiagnostic[] = [];
  const diffFiles = new Set(
    input.sourceSnapshot.changedFiles.map((file) => normalizeRepoPath(file.path)),
  );
  const nodesByFile = groupNodesByFile(input.graphNodes);
  const productFiles = Array.from(
    new Set([...Array.from(nodesByFile.keys()), ...Array.from(diffFiles)]),
  ).filter((filePath) => !isUnitOrIntegrationTestFile(filePath));
  const relationByPair = new Map<
    string,
    { testFile: string; productFile: string; source: CodeRelationSource }
  >();

  const addRelation = (testFile: string, productFile: string, source: CodeRelationSource) => {
    const normalizedTest = normalizeRepoPath(testFile);
    const normalizedProduct = normalizeRepoPath(productFile);
    if (normalizedTest === normalizedProduct) return;
    if (!isUnitOrIntegrationTestFile(normalizedTest)) return;
    if (isUnitOrIntegrationTestFile(normalizedProduct)) return;
    const key = `${normalizedTest}=>${normalizedProduct}`;
    const current = relationByPair.get(key);
    if (!current || SOURCE_PRIORITY[source] < SOURCE_PRIORITY[current.source]) {
      relationByPair.set(key, { testFile: normalizedTest, productFile: normalizedProduct, source });
    }
  };

  for (const edge of input.imports) {
    if (edge.targetFilePath) {
      addRelation(edge.sourceFilePath, edge.targetFilePath, 'import');
    }
  }

  const nodeById = new Map(input.graphNodes.map((node) => [node.nodeId, node] as const));
  for (const edge of input.graphEdges) {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);
    if (!source?.filePath || !target?.filePath) continue;
    addRelation(source.filePath, target.filePath, 'graph-edge');
    addRelation(target.filePath, source.filePath, 'graph-edge');
  }

  for (const filePath of Array.from(nodesByFile.keys())) {
    if (!isUnitOrIntegrationTestFile(filePath)) continue;
    const candidate = findFilenameHeuristicCandidate(filePath, productFiles);
    if (candidate) addRelation(filePath, candidate, 'filename-heuristic');
  }
  for (const filePath of productFiles) {
    const candidate = findExistingFilenameHeuristicTest(filePath, input.worktreePath);
    if (candidate) addRelation(candidate, filePath, 'filename-heuristic');
  }

  const hiddenNodeIds = new Set<string>();
  const companionFiles: CodeCompanionFile[] = [];
  for (const relation of Array.from(relationByPair.values())) {
    const productNodes = nodesByFile.get(relation.productFile) ?? [];
    const testNodes = nodesByFile.get(relation.testFile) ?? [];
    const productDiff = diffFiles.has(relation.productFile);
    const testDiff = diffFiles.has(relation.testFile);
    const ownerRole: CodeFileRole = productDiff || !testDiff ? 'product' : 'test';
    const ownerNode = ownerRole === 'product' ? productNodes[0] : testNodes[0];
    if (!ownerNode?.filePath) continue;
    const companionPath = ownerRole === 'product' ? relation.testFile : relation.productFile;
    const companionNodes = ownerRole === 'product' ? testNodes : productNodes;
    const hiddenNodes = companionNodes;
    for (const node of hiddenNodes) hiddenNodeIds.add(node.nodeId);
    companionFiles.push({
      relationId: `${ownerNode.nodeId}::${companionPath}`,
      ownerNodeId: ownerNode.nodeId,
      ownerFilePath: ownerNode.filePath,
      ownerRole,
      companionRole: ownerRole === 'product' ? 'test' : 'product',
      companionFilePath: companionPath,
      companionNodeIds: companionNodes.map((node) => node.nodeId),
      hiddenNodeIds: hiddenNodes.map((node) => node.nodeId),
      source: relation.source,
      displayMode: diffFiles.has(companionPath) ? 'diff' : 'code',
      existsInWorkspaceHead: input.worktreePath
        ? fs.existsSync(path.join(input.worktreePath, companionPath))
        : false,
      existsInDiff: diffFiles.has(companionPath),
    });
  }

  const visibleNodes = input.graphNodes.filter((node) => !hiddenNodeIds.has(node.nodeId));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.nodeId));
  const visibleEdges = input.graphEdges.filter(
    (edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
  );
  return { visibleNodes, visibleEdges, companionFiles, diagnostics };
}

function groupNodesByFile(nodes: CodeGraphNode[]): Map<string, CodeGraphNode[]> {
  const result = new Map<string, CodeGraphNode[]>();
  for (const node of nodes) {
    if (!node.filePath) continue;
    const filePath = normalizeRepoPath(node.filePath);
    const items = result.get(filePath) ?? [];
    items.push(node);
    result.set(filePath, items);
  }
  return result;
}

function findFilenameHeuristicCandidate(
  testFilePath: string,
  productFiles: string[],
): string | null {
  const testMatch = testFilePath.match(/^(.*)\.test(\.[cm]?[tj]sx?)$/i);
  if (!testMatch) return null;
  const testBase = testMatch[1]!;
  const testExtension = testMatch[2]!;
  const productBases = new Set([testBase, testBase.replace(/(^|\/)__tests__\//, '$1')]);
  const candidates = new Set<string>();
  for (const productBase of Array.from(productBases)) {
    for (const extension of candidateProductExtensions(testExtension)) {
      candidates.add(`${productBase}${extension}`);
    }
  }
  const matched = productFiles.filter((filePath) => candidates.has(filePath));
  return matched.length === 1 ? matched[0] : null;
}

function findExistingFilenameHeuristicTest(
  productFilePath: string,
  worktreePath: string | null,
): string | null {
  if (!worktreePath) return null;
  const extensionMatch = productFilePath.match(/(\.[cm]?[tj]sx?)$/i);
  if (!extensionMatch) return null;
  const extension = extensionMatch[1]!;
  const base = productFilePath.slice(0, -extension.length);
  const parts = productFilePath.split('/');
  const candidates: string[] = [];
  const filenameBase = parts.at(-1)!.slice(0, -extension.length);
  for (const testExtension of candidateTestExtensions(extension)) {
    candidates.push(`${base}.test${testExtension}`);
    if (parts.length > 1) {
      candidates.push(
        [...parts.slice(0, -1), '__tests__', `${filenameBase}.test${testExtension}`].join('/'),
      );
    }
  }
  const existing = candidates.filter((candidate) =>
    fs.existsSync(path.join(worktreePath, candidate)),
  );
  return existing.length === 1 ? existing[0]! : null;
}

function candidateTestExtensions(productExtension: string): string[] {
  const preferred =
    productExtension === '.tsx'
      ? ['.tsx', '.ts']
      : productExtension === '.ts'
        ? ['.ts', '.tsx']
        : [productExtension, '.ts'];
  return uniqueExtensions([...preferred, ...TYPESCRIPT_FILE_EXTENSIONS]);
}

function candidateProductExtensions(testExtension: string): string[] {
  const preferred =
    testExtension === '.ts'
      ? ['.ts', '.tsx']
      : testExtension === '.tsx'
        ? ['.tsx', '.ts']
        : [testExtension, '.ts'];
  return uniqueExtensions([...preferred, ...TYPESCRIPT_FILE_EXTENSIONS]);
}

function uniqueExtensions(extensions: readonly string[]): string[] {
  return Array.from(new Set(extensions.map((extension) => extension.toLowerCase())));
}
