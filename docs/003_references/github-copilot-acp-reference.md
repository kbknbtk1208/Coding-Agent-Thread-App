# Copilot CLI ACP サーバー

GitHub Copilot CLI（コマンドラインインターフェース） のエージェントクライアントプロトコルサーバーについて学ぶ。

> \[!NOTE]
> GitHub Copilot CLI（コマンドラインインターフェース） での ACP のサポートはパブリック プレビュー にあり、変更される可能性があります。

## 概要

エージェント クライアント プロトコル (ACP) は、クライアント (コード エディターや IDE など) とコーディング エージェント (Copilot CLI など) 間の通信を標準化するプロトコルです。 このプロトコルの詳細については、 [公式の概要](https://agentclientprotocol.com/get-started/introduction)を参照してください。

## 利用事例

- ```
            **IDE 統合:** Copilot サポートを任意のエディターまたは開発環境に組み込みます。
  ```
- ```
          **CI/CD パイプライン:** 自動化されたワークフローでエージェント コーディング タスクを調整します。
  ```
- ```
          **カスタム フロントエンド:** 特定の開発者ワークフロー用の特殊なインターフェイスを作成します。
  ```
- ```
          **マルチエージェント システム:** Copilot を、標準プロトコルを使用して他の AI エージェントと調整します。
  ```

## ACP サーバーの起動

GitHub Copilot CLI（コマンドラインインターフェース） は、`--acp` フラグを使用して ACP サーバーとして起動できます。 サーバーは、 `stdio` と `TCP`の 2 つのモードをサポートしています。

### stdio モード (IDE 統合に推奨)

既定では、 `--acp` フラグを指定すると、 `stdio` モードが推論されます。
`--stdio` フラグは、あいまいさを解消するためにも指定できます。

```bash
copilot --acp --stdio
```

### TCP モード

```
          `--port` フラグが `--acp` フラグと組み合わせて指定されている場合、サーバーは TCP モードで開始されます。
```

```bash
copilot --acp --port 3000
```

## ACP サーバーとの統合

ACP サーバーとプログラムで対話するためのライブラリのエコシステムが増えています。 GitHub Copilot CLI（コマンドラインインターフェース） が正しくインストールされ、認証されていることを考えると、次の例では [、typescript](https://agentclientprotocol.com/libraries/typescript) クライアントを使用して 1 つのプロンプトを送信し、AI 応答を出力します。

```typescript
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

async function main() {
  const executable = process.env.COPILOT_CLI_PATH ?? "copilot";

  // ACP uses standard input/output (stdin/stdout) for transport; we pipe these for the NDJSON stream.
  const copilotProcess = spawn(executable, ["--acp", "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (!copilotProcess.stdin || !copilotProcess.stdout) {
    throw new Error("Failed to start Copilot ACP process with piped stdio.");
  }

  // Create ACP streams (NDJSON over stdio)
  const output = Writable.toWeb(
    copilotProcess.stdin,
  ) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(
    copilotProcess.stdout,
  ) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(output, input);

  const client: acp.Client = {
    async requestPermission(params) {
      // This example should not trigger tool calls; if it does, refuse.
      return { outcome: { outcome: "cancelled" } };
    },

    async sessionUpdate(params) {
      const update = params.update;

      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content.type === "text"
      ) {
        process.stdout.write(update.content.text);
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);

  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  process.stdout.write("Session started!\n");
  const promptText = "Hello ACP Server!";
  process.stdout.write(`Sending prompt: '${promptText}'\n`);

  const promptResult = await connection.prompt({
    sessionId: sessionResult.sessionId,
    prompt: [{ type: "text", text: promptText }],
  });

  process.stdout.write("\n");

  if (promptResult.stopReason !== "end_turn") {
    process.stderr.write(
      `Prompt finished with stopReason=${promptResult.stopReason}\n`,
    );
  }

  // Best-effort cleanup
  copilotProcess.stdin.end();
  copilotProcess.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    copilotProcess.once("exit", () => resolve());
    setTimeout(() => resolve(), 2000);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 詳細については、次を参照してください。

- ```
          [ACP の公式ドキュメント](https://agentclientprotocol.com/protocol/overview)
  ```
