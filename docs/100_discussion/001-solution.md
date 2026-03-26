# 前提

- このリポジトリの最優先ミッションは、**複数のコーディングエージェントと UI を最小限の労力で統合できるかを技術検証すること**である
- 完成された PR レビューアプリの実装は目的ではない
- PR レビューは代表的な想定ユースケースのひとつに過ぎず、検証用アプリはまったく別テーマでもよい
- したがって、最初のソリューションは **PR レビューに特化したドメイン設計ではなく、エージェント統合の成立性を最短で確認できる構成** を優先する

参照:

- [初期構想](./idea.md)
- [Codex App Server リファレンス](../codex-app-server-reference.md)
- [GitHub Copilot ACP リファレンス](../github-copilot-acp-reference.md)

---

## 結論

最小 PoC としては、**UI / Agent Gateway / Provider Adapter** の 3 層構成が最も現実的です。

- UI はエージェントのプロトコル差分を知らない
- Electron main 側に Agent Gateway を置き、セッション管理とイベント正規化を担当させる
- Codex と Copilot はそれぞれ専用アダプタで吸収する
- structured response と rich text response は共通結果モデルに寄せる
- PR レビュー固有の概念は後回しにし、まずは「会話・ストリーミング・structured/rich の両立」を確認する

この方針なら、`Codex App Server` の `thread/start` / `thread/resume` / `thread/fork` / `turn/steer` / `outputSchema` と、`Copilot ACP` の `newSession` / `prompt` / `sessionUpdate` / `requestPermission` を、UI から見れば同じアプリ内イベントとして扱えます。

---

## 1. ミッションから逆算した成功条件

このリポジトリで最初に成立させたいのは次の項目です。

1. ユーザーがエージェント種別を選べる
2. ユーザーが `cwd` を選んで起動できる
3. 同一セッションで継続会話できる
4. 実行中の状態やテキスト断片をストリーミング表示できる
5. 最終結果を structured response と rich text response の 2 形式で描画できる
6. Codex 固有機能を後から無理なく追加できる

この時点では、PR Diff 表示、インラインコメント、再レビュー、GitHub 連携は必須ではありません。

---

## 2. 非ゴール

最初のソリューションでやらないことを明確にします。

- GitHub PR / Diff の完成度高い統合
- レビュー専用ドメインモデルの作り込み
- 本番向けの永続化基盤や監査ログ整備
- すべての権限要求パターンへの完全対応
- Tauri / Electrobun へそのまま移せる完成形の整備

ここを最初から狙うと、技術検証より周辺実装の方が重くなります。

---

## 3. 最小アーキテクチャ

### 3-1. 層構成

1. **Presentation/UI 層**
   React / TypeScript。
   入力、ステータス、ストリーミング表示、最終結果表示を担当する。

2. **Agent Gateway 層**
   Electron main 側。
   セッション開始、イベント中継、結果正規化、IPC 公開を担当する。

3. **Provider Adapter 層**
   `CodexAdapter` と `CopilotAdapter`。
   child process 起動とプロトコル吸収を担当する。

この 3 層であれば、今の単一 Nextron リポジトリにも無理なく載せられます。

### 3-2. 現時点で十分な配置

最初から monorepo にせず、まずは次のような構成で十分です。

```text
main/
  agent-gateway/
  agent-runtime/
    codex/
    copilot/
  ipc/
shared/
  domain/
renderer/
  components/
  pages/
```

`packages/*` への分離は、2 つ目の desktop shell や共有ライブラリの必要性が明確になってからでよいです。

---

## 4. 共通インターフェースは capability ベースにする

Codex と Copilot は似ている部分はありますが、完全に対称ではありません。
そのため、共通インターフェースは「全員が同じことをできる前提」ではなく、**できることを宣言する前提**にします。

```ts
type AgentKind = "codex" | "copilot";

type AgentCapability =
  | "resumeSession"
  | "forkSession"
  | "steerActiveTurn"
  | "structuredOutput"
  | "nativeReview";

interface AgentSessionHandle {
  agent: AgentKind;
  appSessionId: string;
  providerSessionId: string;
  cwd: string;
}

interface AgentPort {
  getCapabilities(): AgentCapability[];

  startSession(input: StartSessionInput): Promise<AgentSessionHandle>;
  sendMessage(input: SendMessageInput): Promise<void>;
  disposeSession(input: DisposeInput): Promise<void>;

  resumeSession?(input: ResumeSessionInput): Promise<AgentSessionHandle>;
  forkSession?(input: ForkSessionInput): Promise<AgentSessionHandle>;
  steerActiveTurn?(input: SteerInput): Promise<void>;

  onEvent(cb: (event: AgentEvent) => void): Unsubscribe;
}
```

これで UI や Gateway は、

- 「Codex なら fork を出す」
- 「Copilot には fork を出さない」
- 「structured output をネイティブに持つかどうかで結果生成方法を切り替える」

という判断を安全に行えます。

---

## 5. 最小イベントモデル

技術検証の段階では、イベントも最小限で十分です。

```ts
type AgentEvent =
  | { type: "session.started"; appSessionId: string; agent: AgentKind }
  | {
      type: "session.capabilities";
      appSessionId: string;
      capabilities: AgentCapability[];
    }
  | { type: "status.changed"; appSessionId: string; status: AgentStatus }
  | {
      type: "message.delta";
      appSessionId: string;
      messageId: string;
      text: string;
    }
  | { type: "message.completed"; appSessionId: string; messageId: string }
  | { type: "result.structured"; appSessionId: string; data: unknown }
  | {
      type: "result.richText";
      appSessionId: string;
      format: "markdown";
      content: string;
    }
  | {
      type: "permission.requested";
      appSessionId: string;
      requestId: string;
      payload: unknown;
    }
  | { type: "error"; appSessionId: string; error: AppError };
```

最初からレビュー専用イベントを大量に持ち込まない方が、PoC の判断がしやすいです。

---

## 6. structured response と rich text response の扱い

このリポジトリの検証で重要なのは、**最終結果を 2 系統で描画できること**です。

### structured response

用途:

- タスクリスト
- チェック結果
- 要点整理
- ステップ列挙

#### Codex

Codex は `turn/start` に `outputSchema` を渡せるため、structured output の PoC に向いています。

#### Copilot

添付リファレンスの範囲では、Codex の `outputSchema` 相当のネイティブ機能は確認できません。
そのため Copilot は、

- JSON 出力を促す
- `zod` などで検証する
- 壊れていれば Normalizer で再整形する

という方針を取ります。

### rich text response

用途:

- 通常チャット
- 補足説明
- フォローアップ

こちらは Markdown ベースで十分です。

### 実務上の判断

- 最初の PoC では structured と rich text の両方を同一画面で描ければよい
- structured output が壊れた場合は raw rich text にフォールバックする
- PR レビュー用 schema を先に固定する必要はない

---

## 7. Provider ごとの実装方針

## Codex

CodexAdapter では次を PoC 対象にします。

- `codex app-server` を child process で起動
- stdio で JSON-RPC 接続
- `thread/start` によるセッション開始
- `turn/start` によるメッセージ送信
- `item/agentMessage/delta` によるストリーミング表示
- `outputSchema` による structured output

後から追加できる機能:

- `thread/resume`
- `thread/fork`
- `turn/steer`
- `review/start`

重要なのは、**最初から review 専用フローに寄せないこと**です。
このリポジトリのミッションに対しては、まず通常会話と structured output が通ることの方が価値があります。

## Copilot

CopilotAdapter では次を PoC 対象にします。

- `copilot --acp --stdio` を child process で起動
- ACP client で接続
- `newSession({ cwd })` によるセッション開始
- `prompt({ sessionId, ... })` による送信
- `sessionUpdate` の `agent_message_chunk` によるストリーミング表示
- `requestPermission` の中継

注意点:

- 添付リファレンス上、Copilot CLI ACP は public preview
- Codex のような `fork` や `outputSchema` を前提にしない
- 共通化は capability で吸収する

---

## 8. 最小 PoC の代表シナリオ

PR レビューではなく、次のような軽いシナリオで十分です。

### シナリオA: リポジトリ要約チャット

- ユーザーが agent と `cwd` を選ぶ
- 「このリポジトリを要約して」と送る
- ストリーミング表示を確認する
- 最終結果を rich text で表示する

### シナリオB: structured checklist 生成

- ユーザーが「実装前チェックリストを JSON で出して」と送る
- Codex は `outputSchema` を使う
- Copilot は JSON 指示 + Normalizer で対応する
- UI が structured result をカード表示する

### シナリオC: Codex 固有機能の確認

- 同一セッション継続
- `thread/fork`
- `turn/steer`

この 3 本が通れば、技術検証としてはかなり十分です。

---

## 9. UI に必要な最小要素

PoC に必要な UI は多くありません。

- `AgentSelector`
- `WorkspaceSelector`
- `PromptComposer`
- `SessionPanel`
- `StatusTimeline`
- `ResultRenderer`

`ResultRenderer` は次の 2 モードだけあればよいです。

- structured
- rich text

Diff viewer や inline comment thread は将来の拡張でよいです。

---

## 10. 永続化は後回しでよい

この段階では DB を入れなくても構いません。

最初の候補:

- インメモリ
- `electron-store`
- JSON ファイル

保存するなら最低限で十分です。

- recent sessions
- selected agent
- selected cwd
- latest rendered result

PR レビュー用の複雑なドメインテーブルは不要です。

---

## 11. 実装順

### Phase 1

- Codex rich text streaming
- Copilot rich text streaming
- 共通イベントモデル
- `cwd` 選択

### Phase 2

- structured response 表示
- Codex `outputSchema`
- Copilot Normalizer

### Phase 3

- セッション再開
- Codex `thread/fork`
- Codex `turn/steer`
- 最小永続化

### Phase 4

- 必要なら review 的ユースケースを追加
- 必要なら PR レビュー向け UI を別レイヤとして設計

---

## 12. 採用すべき判断

- UI から provider プロトコルを隠す
- typed IPC 経由で Agent Gateway を公開する
- capability ベースで機能差を扱う
- structured / rich text を最初から分ける
- review 専用ドメインより、まず汎用会話と結果描画を通す

## 採用しないほうがよい判断

- PR レビュー前提で全体設計を固定する
- 最初から Diff / inline comment / re-review を作り込む
- Copilot を Codex と同等機能だと仮定する
- いきなり monorepo 化や DB 導入まで進める

---

## 13. このソリューション案の位置づけ

この文書は、PR レビューアプリの詳細設計ではなく、**複数コーディングエージェント統合のための最小技術検証アーキテクチャ案**です。

そのため、今後もし代表ユースケースが

- 要約アプリ
- タスク分解アプリ
- チェックリスト生成アプリ
- コード調査アプリ

のように変わっても、ここで定義した境界と責務はそのまま再利用できます。
