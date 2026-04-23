import type {
  InitialGraphAnalysisInput,
  InitialGraphAnalysisOutput,
} from './analysis-worker-entry';
import { runInitialGraphAnalysis } from './analysis-worker-entry';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

function resolveWorkerEntryPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'main', 'poc3-graph-review', 'analysis', 'analysis-worker-entry.ts'),
    path.join(__dirname, 'analysis-worker-entry.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export class AnalysisWorkerClient {
  async runInitialGraphAnalysis(
    input: InitialGraphAnalysisInput,
  ): Promise<InitialGraphAnalysisOutput> {
    const entry = resolveWorkerEntryPath();
    if (!entry) {
      return runInitialGraphAnalysis(input);
    }

    return new Promise<InitialGraphAnalysisOutput>((resolve, reject) => {
      const worker = new Worker(
        `
          const fs = require('fs');
          const { parentPort, workerData } = require('worker_threads');
          const ts = require('typescript');

          require.extensions['.ts'] = function(module, filename) {
            const source = fs.readFileSync(filename, 'utf8');
            const output = ts.transpileModule(source, {
              compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                esModuleInterop: true,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
                jsx: ts.JsxEmit.ReactJSX,
              },
            }).outputText;
            module._compile(output, filename);
          };

          Promise.resolve()
            .then(() => require(workerData.entry).runInitialGraphAnalysis(workerData.input))
            .then((result) => parentPort.postMessage({ ok: true, result }))
            .catch((error) => parentPort.postMessage({
              ok: false,
              message: error && error.message ? error.message : String(error),
              stack: error && error.stack ? error.stack : null,
            }));
        `,
        {
          eval: true,
          workerData: { entry, input },
        },
      );
      worker.once('message', (message: unknown) => {
        void worker.terminate();
        if (
          message &&
          typeof message === 'object' &&
          'ok' in message &&
          message.ok === true &&
          'result' in message
        ) {
          resolve(message.result as InitialGraphAnalysisOutput);
          return;
        }
        const errorMessage =
          message && typeof message === 'object' && 'message' in message
            ? String(message.message)
            : 'Analysis worker failed';
        reject(new Error(errorMessage));
      });
      worker.once('error', (err) => {
        void worker.terminate();
        reject(err);
      });
      worker.once('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Analysis worker exited with code ${code}`));
        }
      });
    });
  }
}
