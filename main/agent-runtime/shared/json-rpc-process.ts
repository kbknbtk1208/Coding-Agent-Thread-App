import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import path from 'path';
import readline from 'readline';

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

function resolveCliCommand(command: string) {
  if (process.platform !== 'win32') {
    return command.replace(/\.cmd$/, '');
  }

  const appData = process.env.APPDATA;
  return appData ? path.join(appData, 'npm', command) : command;
}

function createSpawnConfig(command: string, args: string[]) {
  const resolvedCommand = resolveCliCommand(command);

  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `${resolvedCommand} ${args.join(' ')}`],
    };
  }

  return {
    command: resolvedCommand,
    args,
  };
}

export class JsonRpcProcess {
  private readonly child: ChildProcessWithoutNullStreams;

  private readonly pendingRequests = new Map<number, PendingRequest>();

  private readonly output: readline.Interface;

  private nextRequestId = 1;

  private isDisposed = false;

  constructor(
    command: string,
    args: string[],
    cwd: string,
    private readonly onNotification: (message: JsonRpcNotification) => void,
    private readonly onRequest?: (message: JsonRpcRequest) => void,
    private readonly includeJsonRpc = false,
  ) {
    const spawnConfig = createSpawnConfig(command, args);

    this.child = spawn(spawnConfig.command, spawnConfig.args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.output = readline.createInterface({ input: this.child.stdout });

    this.output.on('line', (line) => {
      this.handleLine(line);
    });

    this.child.stderr.on('data', () => {
      // stderr はデバッグ用に残す。PoC では UI へは流さない。
    });

    this.child.on('error', (error) => {
      this.failPending(error instanceof Error ? error : new Error(String(error)));
    });

    this.child.on('exit', (code, signal) => {
      if (!this.isDisposed) {
        const reason = signal ? `signal ${signal}` : `code ${String(code)}`;
        this.failPending(new Error(`RPC process exited with ${reason}.`));
      }
    });
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = { id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { reject, resolve: resolve as (value: unknown) => void });
    });

    this.write(payload);
    return promise;
  }

  notify(method: string, params?: unknown) {
    this.write({ method, params });
  }

  respond(id: number, result: unknown) {
    this.write({ id, result });
  }

  respondError(id: number, error: JsonRpcError) {
    this.write({ id, error });
  }

  async dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.output.close();

    if (!this.child.killed) {
      if (process.platform === 'win32' && this.child.pid) {
        spawnSync('taskkill', ['/PID', String(this.child.pid), '/T', '/F']);
      } else {
        this.child.kill();
      }
    }
  }

  private write(payload: Record<string, unknown>) {
    const message = this.includeJsonRpc ? { jsonrpc: '2.0', ...payload } : payload;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    let message: JsonRpcNotification | JsonRpcRequest | JsonRpcResponse;

    try {
      message = JSON.parse(line) as JsonRpcNotification | JsonRpcRequest | JsonRpcResponse;
    } catch (error) {
      this.failPending(
        error instanceof Error ? error : new Error('Failed to parse JSON-RPC line output.'),
      );
      return;
    }

    if ('id' in message && 'method' in message) {
      this.onRequest?.(message);
      return;
    }

    if ('method' in message) {
      this.onNotification(message);
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private failPending(error: Error) {
    const pendings = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();

    for (const pending of pendings) {
      pending.reject(error);
    }
  }
}
