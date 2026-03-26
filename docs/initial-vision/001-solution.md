以下の要件なら、**UI とエージェント実装を完全に分離し、各エージェントを「長寿命セッションを持つストリーミングバックエンド」として統一的に扱う構成**が最も合っています。
特にコアは、**Codex App Server と Copilot ACP をそのまま UI に露出させず、アプリ内で正規化した Agent Runtime 層を挟む**ことです。Codex app-server は長寿命プロセス＋JSON-RPC で会話履歴・承認・ストリーミングイベントを扱う前提で設計されており、`thread/resume`、`thread/fork`、`turn/steer`、`outputSchema` まで持っています。Copilot 側も ACP 経由で stdio/TCP 接続、セッション生成、ストリーミング、権限要求を扱えますが、ACP サポートは public preview、Copilot SDK も technical preview です。 ([OpenAI Developers][1])

## 結論のアーキテクチャ

### 1. 全体像

Nextron を 4 層に分けます。

1. **Presentation/UI 層**
   React/TypeScript。
   チャット、Diff、インラインコメント、スレッド、進捗表示、最終レスポンス表示だけを担当。

2. **App Orchestrator 層**
   Electron main 側、または shared backend module。
   UI からの要求を受け、どのエージェントをどう起動するか、どの session/thread を使うか、どの cwd で動かすかを決定。

3. **Agent Runtime 層**
   ここが最重要。
   Codex / Copilot をそれぞれ専用アダプタで吸収し、UI には**共通イベント形式**だけを流す。

4. **Persistence/Domain 層**
   セッション、レビュー結果、Diff コメント、スレッド、fork 関係、エージェントイベントログを保存。

この構成にすると、将来 Nextron から Tauri/Electrobun に移るときも、**UI 層と Agent Runtime の通信境界を IPC/HTTP/WS に固定しておけば移植しやすい**です。UI は「AgentGateway API」にしか依存しません。

---

## 2. まず決めるべき中核方針

### 方針A: エージェントごとのプロトコル差分を UI に持ち込まない

Codex は JSON-RPC、Copilot は ACP です。
これをそのまま React 側で扱うと破綻します。

なので内部で以下のような**共通 Agent Port**を定義します。

```ts
type AgentKind = "codex" | "copilot";

interface AgentSessionHandle {
  agent: AgentKind;
  appSessionId: string; // アプリ内の論理セッションID
  providerSessionId: string; // Codex threadId or Copilot sessionId
  cwd: string;
}

interface AgentPort {
  startSession(input: StartSessionInput): Promise<AgentSessionHandle>;
  resumeSession(input: ResumeSessionInput): Promise<AgentSessionHandle>;
  sendMessage(input: SendMessageInput): Promise<void>;
  forkSession?(input: ForkSessionInput): Promise<AgentSessionHandle>;
  cancel?(input: CancelInput): Promise<void>;
  disposeSession(input: DisposeInput): Promise<void>;

  onEvent(cb: (event: AgentEvent) => void): Unsubscribe;
}
```

UI は Codex の `threadId` や Copilot の `sessionId` を直接知らず、
`appSessionId` だけ見ます。

### 方針B: ストリーミングと最終結果を分離する

要件にある

- 処理状態はストリーミングで閲覧
- 最終レスポンスはアニメーション付き表示
- JSON schema と自由文の両方

をきれいに満たすには、**イベントストリーム**と**確定レスポンス**を別モデルにします。

#### ストリーム用

- thinking/status
- tool start/end
- diff scan progress
- chunked text
- permission request
- review mode start/end

#### 確定レスポンス用

- `structured_result`
- `rich_text_result`

Codex app-server は `item/agentMessage/delta`、tool progress、review イベントなどを流せますし、`turn/steer` で実行中ターンに追加入力できます。 ([OpenAI Developers][1])
Copilot ACP も `sessionUpdate` で `agent_message_chunk` を受け取れます。 ([GitHub Docs][2])

---

## 3. 推奨コンポーネント

### UI 側

- `ChatPane`
- `ReviewSummaryPane`
- `DiffViewerPane`
- `InlineCommentThread`
- `AgentStatusTimeline`
- `SessionSidebar`
- `AnimationRenderer`

### backend 側

- `AgentGateway`
- `AgentSessionRegistry`
- `CodexAdapter`
- `CopilotAdapter`
- `ReviewOrchestrator`
- `ResponseNormalizer`
- `WorkspaceManager`
- `PRContextProvider`
- `EventStore`

---

## 4. エージェント連携の設計

## Codex 側

Codex app-server は deep integration 向けで、会話履歴、承認、streamed events を扱うためのものです。`thread/start`、`thread/resume`、`thread/fork`、`turn/start`、`turn/steer`、`review/start`、`outputSchema` が使えます。 ([OpenAI Developers][1])

### CodexAdapter の責務

- `codex app-server` を **長寿命 child process** として起動
- stdio で JSON-RPC 接続
- 1 プロセス内で複数 thread を管理
- `cwd` を turn 単位または thread 開始時に指定
- `review/start` を使ってレビュー専用フローを構築
- `thread/fork` をレビュー指摘ごとの派生会話に利用
- `turn/steer` を使い、エージェント実行中の追加メッセージを実現

### 重要な判断

Codex は**1 ワークスペースに 1 app-server プロセス**でもよいですが、将来的な隔離性を考えると
**1 app workspace / repo root ごとに 1 プロセス**が無難です。

理由:

- cwd / writable roots / sandbox の境界が明確
- repo A のイベントと repo B のイベントが混ざりにくい
- Tauri/Electrobun 移行時も process boundary を保ちやすい

---

## Copilot 側

Copilot CLI は `--acp --stdio` で ACP サーバーとして起動でき、ACP 経由で session を作り、prompt を送り、chunk を受け取れます。GitHub Docs のサンプルでも `newSession({ cwd })` → `prompt({ sessionId, ... })` → `sessionUpdate` で `agent_message_chunk` を処理しています。 ([GitHub Docs][2])

### CopilotAdapter の責務

- `copilot --acp --stdio` を child process で起動
- ACP client で接続
- `newSession({ cwd })` で会話セッション作成
- 同一 `sessionId` に対して継続送信
- ストリーミング chunk を共通イベントへ正規化
- permission request を UI に中継

### 注意点

GitHub Docs 上、Copilot CLI ACP は public preview、Copilot SDK は technical preview です。なので、**SDK 直接依存より ACP 依存のほうが長期的には安全**です。SDK は内部実装や補助に使ってもよいですが、アーキテクチャ上の主軸は ACP に置くのがおすすめです。 ([GitHub Docs][2])

---

## 5. 共通イベントモデル

UI を強くするには、イベントをこのように統一します。

```ts
type AgentEvent =
  | { type: "session.started"; appSessionId: string; agent: AgentKind }
  | {
      type: "message.delta";
      appSessionId: string;
      messageId: string;
      text: string;
    }
  | { type: "message.completed"; appSessionId: string; messageId: string }
  | { type: "status.changed"; appSessionId: string; status: AgentStatus }
  | {
      type: "tool.started";
      appSessionId: string;
      toolName: string;
      detail?: string;
    }
  | {
      type: "tool.completed";
      appSessionId: string;
      toolName: string;
      success: boolean;
    }
  | {
      type: "permission.requested";
      appSessionId: string;
      requestId: string;
      payload: unknown;
    }
  | {
      type: "review.comment.partial";
      reviewRunId: string;
      draftComment: PartialReviewComment;
    }
  | { type: "review.result"; reviewRunId: string; result: ReviewResult }
  | { type: "error"; appSessionId: string; error: AppError };
```

### ここが肝

- Codex の `item/agentMessage/delta`
- Codex の review mode enter/exit
- Copilot の `agent_message_chunk`

を全部 `message.delta` / `status.changed` / `review.result` に変換します。
これで UI はエージェント差分を意識しません。 ([OpenAI Developers][1])

---

## 6. JSON schema と自由文をどう両立するか

ここは **レスポンス契約を 2 層に分ける**のが一番強いです。

### パターン1: Structured response

用途:

- 総評
- インラインコメント一覧
- severity / category / suggested fix
- file/line mapping

#### Codex

Codex は `turn/start` に `outputSchema` を渡せます。
なので、**レビュー結果の最終確定は Codex では原則 schema 強制**でよいです。 ([OpenAI Developers][1])

#### Copilot

今回見た公式資料の範囲では、ACP/Copilot SDK 側で Codex の `outputSchema` 相当をそのまま使える明示的な記述は確認できませんでした。なので Copilot では、**厳格 schema をエージェントに直接期待しない**前提が安全です。代わりに次のどちらかです。

- A. プロンプトで JSON 出力を強く要求し、`zod/json-schema` で検証し、不正なら再整形
- B. 自由文をいったん受け、**Normalizer** が別ステップで構造化

実運用では B のほうが堅いです。

### パターン2: Rich text response

用途:

- スレッド返信
- 雑談的フォローアップ
- 指摘への説明

これは Markdown ベースの rich text とし、
ストリーミング chunk をそのまま UI に流して最後に整形表示します。

### つまり

- **レビュー本体**: `structured_result`
- **レビュー後の会話**: `rich_text_result`

この切り分けが最も扱いやすいです。

---

## 7. コードレビュー支援アプリとしてのドメイン設計

### ドメインモデル

```ts
type ReviewRun = {
  reviewRunId: string;
  prId: string;
  agent: AgentKind;
  baseAppSessionId: string;
  workingAppSessionId: string;
  mode: "initial" | "re-review" | "thread-reply";
  diffVersionId: string;
  status: "queued" | "running" | "completed" | "failed";
};

type ReviewResult = {
  summary: {
    overall: string;
    riskLevel: "low" | "medium" | "high";
    positives: string[];
    concerns: string[];
  };
  comments: InlineReviewComment[];
};

type InlineReviewComment = {
  commentId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  side?: "new" | "old";
  severity: "nit" | "minor" | "major" | "critical";
  title: string;
  body: string;
  suggestions?: string[];
  sourceAgent: AgentKind;
  sourceReviewRunId: string;
};
```

### 重要ポイント

インラインコメントは**Diff 上の物理位置に依存しすぎない**ようにします。
`filePath + line range + diff hunk anchor + sha` を持たせ、Diff 更新後は再マッピングします。

---

## 8. ユースケース別の最適フロー

## 初回レビュー

### Codex

1. PR/Diff を取得
2. `thread/start`
3. `review/start` でレビュー開始
   - 既存 thread 上でもよい
   - スレッド返信用途を考えるなら `delivery: "detached"` 推奨

4. ストリーミングイベントを UI に反映
5. 最終レビュー結果を schema で確定
6. UI でコメント・総評を構築

Codex の `review/start` は detached delivery で別 review thread を作れます。これはあなたの「レビュー元の会話からスレッドを fork して会話を続けたい」にかなり合っています。 ([OpenAI Developers][1])

### Copilot

1. PR/Diff を取得
2. `newSession({ cwd })`
3. Diff/PR context を与えてレビュー依頼
4. ストリーミング chunk を表示
5. 最終テキストを ResponseNormalizer で JSON 化
6. UI で構築

Copilot はあなたの要件どおり、**レビュー返信や再レビューは新規 session**でよいです。

---

## 9. スレッド返信

### Codex

要件では「レビュー時のセッションから fork したセッションにて反応」。
これはまさに `thread/fork` で実現できます。Codex は fork 済み thread に対して継続会話でき、さらにアクティブターン中に `turn/steer` も可能です。 ([GitHub][3])

推奨フロー:

1. ユーザーがインラインコメントに返信
2. `thread/fork(reviewThreadId)`
3. fork 先 thread にそのコメントスレッドの文脈だけを与えて `turn/start`
4. 必要なら処理中に `turn/steer`
5. リッチテキストで返信表示

### Copilot

1. 返信ごとに `newSession`
2. スレッド文脈だけを prompt に注入
3. chunk を UI 表示
4. 完了後 rich text 保存

---

## 10. 再レビュー

### Codex

レビュー時の session を引き継ぐ要件なので、

- `thread/resume`
- 新しい diffVersion を context 注入
- 「前回コメントとの差分確認」をプロンプトで明示
- 必要なら既存 review thread か detached review thread を使い分け

Codex は `thread/resume` が正式にあります。 ([OpenAI Developers][1])

### Copilot

要件どおり新規 session。
これは逆に履歴肥大化を避けやすいです。

---

## 11. cwd とワークスペース管理

要件に「ユーザーが選択した cwd で起動可能」とあるので、`WorkspaceManager` を独立させます。

### 役割

- ユーザーが repo root / worktree を選択
- 正規化された絶対 path を発行
- エージェント起動時に cwd を渡す
- sandbox writable roots も同じ path に制限
- PR ごとに `workspaceId` を発行

Codex の `turn/start` には `cwd` と sandbox policy を渡せます。Copilot ACP の example も `newSession({ cwd })` を使っています。 ([OpenAI Developers][1])

---

## 12. 将来の移行に強くする実装境界

### 依存方向

UI → AgentGateway API → Agent Runtime → child process

この形にして、UI は Electron API を直接知らないようにします。

### 具体策

- `packages/domain`: 型、zod schema、usecase interface
- `packages/agent-runtime`: Codex/Copilot adapter
- `packages/ui`: React components
- `apps/nextron`: Electron shell
- 将来 `apps/tauri`, `apps/electrobun` を追加

つまり、**Nextron は shell に過ぎない**状態にします。

---

## 13. 推奨レスポンス設計

### Structured review schema

```ts
const ReviewResultSchema = z.object({
  summary: z.object({
    overall: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    positives: z.array(z.string()),
    concerns: z.array(z.string()),
  }),
  comments: z.array(
    z.object({
      filePath: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      severity: z.enum(["nit", "minor", "major", "critical"]),
      title: z.string(),
      body: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  ),
});
```

### Rich text thread reply

```ts
type ThreadReply = {
  format: "markdown";
  content: string;
};
```

### 実務上のおすすめ

- **レビュー本体**は常に JSON
- **返信会話**は Markdown
- JSON が壊れたときは自動再整形
- UI は常に schema validated object だけ描画

---

## 14. ストリーミング UI の見せ方

### 状態表示

- `Analyzing diff...`
- `Inspecting changed files...`
- `Running review...`
- `Drafting summary...`
- `Waiting for approval...`

### テキスト表示

- chunk をそのまま出すのではなく、一度 `MessageAssembler` でまとめる
- 200–400ms ごとに UI 更新
- 完了時に typewriter/fade-in で final render

要件の「ストリーミングライクであれば良い」に合います。
厳密リアルタイムより、**イベントバッファ＋アニメーション**のほうが体験が安定します。

---

## 15. この要件に対する最適な判断

### 採用すべき

- **Codex: App Server を直接使う**
- **Copilot: ACP を直接使う**
- **内部では独自 Agent Runtime 抽象を作る**
- **レビュー結果は structured / 会話は rich text に分ける**
- **fork / resume の差異は adapter が吸収する**

### 採用しないほうがよい

- UI から直接 stdio プロトコルを扱う
- Copilot SDK をアーキテクチャの中心に置く
- structured output を両エージェントで同一のネイティブ機能だと期待する
- Electron main に業務ロジックを全部詰め込む

---

## 16. 最後に、かなり実践的な推奨構成

```text
[React UI]
  └─ uses AgentGatewayClient (IPC/WS)

[Desktop Shell: Nextron now, Tauri/Electrobun later]
  └─ AgentGateway
      ├─ SessionRegistry
      ├─ ReviewOrchestrator
      ├─ ResponseNormalizer
      ├─ WorkspaceManager
      ├─ PRContextProvider
      ├─ CodexAdapter
      │   └─ child_process: codex app-server
      └─ CopilotAdapter
          └─ child_process: copilot --acp --stdio

[Persistence]
  ├─ SQLite/libSQL/Postgres
  ├─ sessions
  ├─ review_runs
  ├─ inline_comments
  ├─ thread_messages
  └─ event_log
```

この構成なら、あなたの要件の中で特に難しい

- 継続会話
- Codex の fork
- Codex 実行中の追加メッセージ
- Copilot/Codex の仕様差の吸収
- structured と rich text の両立
- 将来のデスクトップ基盤移行

をかなり無理なく満たせます。
必要なら次に、**この構成を前提にした TypeScript のインターフェース定義とディレクトリ構成案**まで落として出せます。

[1]: https://developers.openai.com/codex/app-server/ "App Server – Codex | OpenAI Developers"
[2]: https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server "Copilot CLI ACP server - GitHub Docs"
[3]: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md "codex/codex-rs/app-server/README.md at main · openai/codex · GitHub"
