# Coding Agent Thread App

複数のコーディングエージェントとデスクトップ UI を最小限の労力で統合できるかを検証するための、Nextron / Next.js / Electron / TypeScript ベースの技術検証リポジトリです。

## このリポジトリのミッション

- Codex と GitHub Copilot のような複数エージェントを、同じ UI から扱えることを検証する
- エージェントごとのプロトコル差分を UI から隠蔽できることを検証する
- 継続会話、ストリーミング表示、structured response、rich text response を最小構成で検証する
- N将来的な機能追加やTauri / Electrobunなどの別デスクトップ shell への移行に耐えられる境界を、過剰実装せずに見極める

## ミッション達成の成果はどのように生かされるか

近日中に開発予定の以下のユースケースで生かされる

### ユースケース: コードレビュー支援アプリ

    ⁃	githubなどのpull requestのdiffを UIに表示
    ⁃	コーディングエージェントがdiffを参照してレビューし、以下を実行
    ⁃	diffの各所にインラインコメント
    ⁃	総評を提示
    ⁃	インラインコメントにはユーザーがスレッド形式で返信可能
    ⁃	返信されたら、コーディングエージェントが返信して継続的なやりとり
    ⁃	codexの場合はレビュー時のセッションからforkしたセッションにて反応
    ⁃	github copilotの場合は新規セッションで反応
    ⁃	指摘事項の修正などでdiffが更新された場合を想定して再レビュー依頼可能
    ⁃	codexの場合はレビュー時のセッションを引き継ぐ
    ⁃	github copilotの場合は新規セッションで対応
    ⁃	レビュー中およびスレッドでのコーディングエージェントの返信処理中のステータスはUIにリアルタイムで表示される
    ⁃	レビューの総評とインラインコメントはjson オブジェクト形式のレスポンスを基にUIを構築
    ⁃	スレッドの返信は自由なリッチテキスト表示

## 前提

- PR レビューは代表的なユースケースのひとつに過ぎず、検証用アプリは別テーマとする。なぜならPRレビューアプリのための他の技術要素が重く、検証を阻害するため。
- 最優先は「コーディングエージェントと UI の通信が成立するか」の確認であり、ドメイン完成度ではない

## 非ゴール

- GitHub PR / Diff 連携の完成
- 本番品質のレビュー管理機能の実装
- 厳密な権限 UI や永続化基盤の作り込み
- Tauri / Electrobun への即時対応

## いま検証したいこと

- エージェントごとのセッション開始と継続会話
- 実行中イベントのストリーミング表示
- structured response と rich text response の描き分け
- ユーザー選択 `cwd` での起動
- Codex 固有機能を無理なく拡張できる設計

## 参考ドキュメント

- [Codex App Server リファレンス](docs/codex-app-server-reference.md)
- [GitHub Copilot ACP リファレンス](docs/github-copilot-acp-reference.md)

## 前提環境

- Windows または macOS
- Windows は PowerShell、macOS は Terminal / zsh を想定
- Node.js 22 系
- npm 10 系
- Codex CLI と GitHub Copilot CLI が利用可能であること

現時点の実動作確認は Windows 中心です。macOS でも起動しやすいように OS 依存の初期値は外していますが、実機確認は別途必要です。

## セットアップ

```powershell
npm install
npx electron-builder install-app-deps
```

`better-sqlite3` はネイティブモジュールのため、`npm install` 後に Electron 向けのリビルドが必要です。`package.json` の `postinstall` に設定済みですが、初回インストール時にはリビルドが走らない場合があります。IPC ハンドラ未登録エラー（`No handler registered for 'agent:list-sessions'`）が発生した場合は、上記の `npx electron-builder install-app-deps` を手動で実行してください。

## 開発起動

```powershell
npm run dev
```

`npm run dev` で Next.js の開発サーバと Electron アプリが同時に起動します。

## Copilot のモデル固定

- この PoC では、アプリが起動する Copilot ACP プロセスに対して repo 実装で `--model gpt-5-mini` を付与します
- ユーザーの `~/.copilot/config.json` は書き換えません
- `gpt-5-mini` 固定でのセッション開始に失敗した場合は warning を出し、モデル引数なしの Copilot で 1 回だけ再試行して継続します
- フォールバック時は詳細ペインに「gpt-5-mini 固定に失敗したため、Copilot の既定モデルで継続中。Premium 消費の可能性あり。」を常時表示します

## 構成

- `main/`: Electron メインプロセスと preload
- `renderer/`: Next.js の Pages Router ベース UI
- `resources/`: ビルド用の静的リソース
- `docs/`: 構想、技術方針、参照資料

## メモ

- preload では既定の `window.ipc` ブリッジを利用します
- ドキュメントやコードは UTF-8 前提で扱ってください。PowerShell 上で文字化けが出る場合はターミナルの文字コード設定を確認してください
