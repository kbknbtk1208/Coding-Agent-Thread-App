# Playwright Skill で Electron アプリへ CDP 接続する手順

## 結論

このリポジトリの開発モード起動では、Nextron が Electron を `--remote-debugging-port=5858` 付きで起動するため、`playwright-cli` から CDP 経由で既存の Electron ウィンドウへ接続できます。

実際に以下を確認しました。

- `npm run dev` で Next.js が `http://localhost:8888`、Electron の CDP が `http://127.0.0.1:5858` で待ち受ける
- `http://127.0.0.1:5858/json/version` から `webSocketDebuggerUrl` を取得できる
- `playwright-cli` が [playwright-electron-cdp.json](C:\Users\nkubo\Dev\Coding-Agent-Thread-App\docs\playwright-electron-cdp.json) を通じて Electron へ attach できる
- ホーム画面を snapshot し、リンククリックで `/next/` へ遷移できる

## 前提

- 依存関係が `npm install` 済みであること
- `playwright-cli` が利用可能であること
- PowerShell でコマンドを実行すること

## 1. アプリを開発モードで起動する

```powershell
npm run dev
```

今回の検証では、起動ログに以下が出ました。

```text
[nextron] Run renderer process: next dev -p 8888 renderer
[nextron] Run main process: electron . 8888 --remote-debugging-port=5858 --inspect=9292
```

この時点で Electron のレンダラは `http://localhost:8888/home/` を表示します。

## 2. CDP エンドポイントを確認する

```powershell
curl.exe http://127.0.0.1:5858/json/version
curl.exe http://127.0.0.1:5858/json/list
```

確認できたポイント:

- `/json/version` で `webSocketDebuggerUrl` が返る
- `/json/list` には少なくとも 2 タブ出る
- 0 つはアプリ本体 (`http://localhost:8888/home/`)
- もう 1 つは DevTools タブ

DevTools タブが出るのは、[background.ts](C:\Users\nkubo\Dev\Coding-Agent-Thread-App\main\background.ts) で開発時に `mainWindow.webContents.openDevTools()` を呼んでいるためです。

## 3. `playwright-cli` の CDP 設定を読み込む

このリポジトリでは、CDP 接続用の設定を [playwright-electron-cdp.json](C:\Users\nkubo\Dev\Coding-Agent-Thread-App\docs\playwright-electron-cdp.json) に置いています。

```powershell
playwright-cli --session=electron-cdp config --config=docs/playwright-electron-cdp.json
```

設定ファイルの中身は以下です。

```json
{
  "browser": {
    "browserName": "chromium",
    "cdpEndpoint": "http://127.0.0.1:5858"
  },
  "outputMode": "stdout"
}
```

## 4. 操作用セッションを固定する

この環境では、`playwright-cli --session=electron-cdp <command>` 形式の直接呼び出しが安定せず、`The session is already configured.` で失敗しました。実際に通ったのは `PLAYWRIGHT_CLI_SESSION` を使う方法です。

```powershell
$env:PLAYWRIGHT_CLI_SESSION = 'electron-cdp'
```

以降は同じ PowerShell セッション内で `playwright-cli` をそのまま実行します。

## 5. 接続確認と基本操作

まずタブ一覧を確認します。

```powershell
playwright-cli tab-list
playwright-cli tab-select 0
```

実際の確認結果:

```text
0: (current) [Coding Agent Thread App](http://localhost:8888/home/)
1: [DevTools](devtools://...)
```

次に snapshot を取得します。

```powershell
playwright-cli snapshot
```

検証時は `.playwright-cli/page-*.yml` が生成され、ホーム画面のリンクは `e15` として取得できました。

## 6. 実際にクリックして遷移確認する

```powershell
playwright-cli click e15
playwright-cli eval "window.location.pathname"
playwright-cli eval "document.body.innerText"
```

実測結果:

- `click e15` で「サンプルページを開く」を押せた
- `window.location.pathname` は `/next/` を返した
- `document.body.innerText` には `Nextron のページ遷移は動作しています` が含まれた

これで、Electron の中で表示されているアプリに対して `playwright-cli` が CDP 経由で接続し、要素取得と操作まで通ることを確認できています。

## 7. 終了

Playwright セッションを止める場合:

```powershell
playwright-cli session-stop electron-cdp
```

アプリ自体を止める場合は、`npm run dev` を実行したターミナルで `Ctrl+C` を使います。

## 注意点

- `playwright-cli --help` には `--cdp-endpoint` が出ませんが、内部的には `cdpEndpoint` 設定をサポートしています。そのため、CLI オプションではなく config ファイル方式を使うのが安全です。
- DevTools タブも CDP の対象に見えるため、操作前に `playwright-cli tab-select 0` でアプリ本体タブを選ぶのが安全です。
- `snapshot` の結果や console ログは `.playwright-cli/` に出力されます。このディレクトリは `.gitignore` に追加済みです。
- DevTools タブ由来で `Autofill.enable` / `Autofill.setAddresses` の warning が console に出ることがありますが、今回のアプリ操作自体には影響しませんでした。
