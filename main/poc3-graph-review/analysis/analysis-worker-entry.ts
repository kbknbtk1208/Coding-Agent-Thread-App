import type { CodeGraphSnapshot, GraphDiagnostic } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import { resolveDiffScope } from './diff-scope-resolver';
import { createTypeScriptProgram } from './typescript-program-factory';
import { extractDependencies } from './dependency-extractor';
import { buildInitialGraph } from './graph-builder';

export interface InitialGraphAnalysisInput {
  revisionId: string;
  worktreePath: string;
  sourceSnapshot: ReviewSourceSnapshot;
}

export interface InitialGraphAnalysisOutput {
  graph: CodeGraphSnapshot;
}

export async function runInitialGraphAnalysis(
  input: InitialGraphAnalysisInput,
): Promise<InitialGraphAnalysisOutput> {
  const diffScope = resolveDiffScope(input.sourceSnapshot);
  const diagnostics: GraphDiagnostic[] = [...diffScope.diagnostics];

  if (diffScope.files.length === 0) {
    const graph = buildInitialGraph({
      revisionId: input.revisionId,
      sourceSnapshot: input.sourceSnapshot,
      extraction: {
        symbols: [],
        calls: [],
        imports: [],
        diagnostics: [],
      },
      diagnostics,
    });
    return { graph };
  }

  const programResult = createTypeScriptProgram(
    input.worktreePath,
    diffScope.files.map((file) => file.filePath),
  );
  diagnostics.push(...programResult.diagnostics);

  const extraction = extractDependencies({
    worktreePath: input.worktreePath,
    program: programResult.program,
    diffScope,
  });

  const graph = buildInitialGraph({
    revisionId: input.revisionId,
    sourceSnapshot: input.sourceSnapshot,
    extraction,
    diagnostics,
  });

  return { graph };
}
