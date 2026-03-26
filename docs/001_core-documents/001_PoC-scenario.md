---
updated_at: 2026-03-26T23:53:24+09:00
---

# PoC Scenario

## 1. この文書の目的

この文書は、PoC 実装で成立させるべきユースケースを固定するためのシナリオ定義である。ここに書かれたシナリオを優先順位順に実装し、各シナリオの合格条件を満たした時点で PoC の成立を判断する。

前提:

- 対象アプリは PR レビュー製品ではなく、複数コーディングエージェント統合の技術検証アプリである
- 評価対象は UI 体験の豪華さではなく、セッション管理、イベント正規化、表示切り替え、provider 差分吸収の成立性である

## 2. PoC の成功条件

PoC 完了の判断基準は次のとおり。

- ユーザーが `codex` または `copilot` を選んでセッション開始できる
- ユーザーが `cwd` を指定して agent を起動できる
- 実行中の状態変化とテキスト断片を UI で逐次確認できる
- 同一セッションで follow-up を送れる
- structured response と rich text response を同一 UI で描き分けられる
- Codex 固有機能を capability ベースで追加できる

## 3. 共通前提

### 3-1. 実行環境

- Electron + Nextron + TypeScript ベースのデスクトップアプリである
- Windows / PowerShell 環境で開発を進める
- `codex app-server` と `copilot --acp --stdio` が利用可能であることを想定する

### 3-2. 共通 UI 要素

全シナリオで少なくとも次の UI を利用する。

- `AgentSelector`
- `WorkspaceSelector`
- `PromptComposer`
- `SessionPanel`
- `StatusTimeline`
- `ResultRenderer`

### 3-3. 共通状態

全シナリオで次の状態を扱えることを前提にする。

- `idle`
- `starting`
- `running`
- `waiting_permission`
- `completed`
- `failed`

### 3-4. 代表ワークスペース

PoC では次のどちらかを検証対象 `cwd` とする。

- このリポジトリ自身
- TypeScript を含む小規模なローカル検証リポジトリ

理由:

- ワークスペース内容を agent が要約しやすい
- structured checklist の題材にしやすい
- PR / Diff データを用意しなくてよい

## 4. 採用シナリオ一覧

| ID | 優先度 | シナリオ名 | 主目的 | 対象 provider |
| --- | --- | --- | --- | --- |
| S1 | P0 | リポジトリ要約チャット | rich text streaming の成立確認 | Codex / Copilot |
| S2 | P0 | 同一セッション継続会話 | session 継続の成立確認 | Codex / Copilot |
| S3 | P0 | structured checklist 生成 | structured response の成立確認 | Codex / Copilot |
| S4 | P1 | Codex セッション fork | capability ベース拡張の確認 | Codex |
| S5 | P1 | Codex 実行中 steer | provider 固有操作の確認 | Codex |
| S6 | P1 | 権限要求の UI 中継 | permission mediation の確認 | 主に Copilot |

P0 が完了すれば PoC の中核は成立、P1 が完了すれば「将来のコードレビュー支援アプリへ発展できる見込み」が高いと判断する。

## 5. シナリオ詳細

## S1. リポジトリ要約チャット

### 目的

- セッション開始
- `cwd` 指定
- rich text streaming
- 最終結果表示

を 1 本の流れで成立させる。

### 事前条件

- ユーザーが agent を 1 つ選択している
- ユーザーが有効な `cwd` を選択している
- UI に新規セッション開始操作がある

### ユーザー操作

1. `AgentSelector` で `codex` または `copilot` を選ぶ
2. `WorkspaceSelector` で `cwd` を選ぶ
3. 次のプロンプトを送る

```text
このリポジトリの目的、技術スタック、次に読むべきファイルを 5 項目以内で要約して
```

### 期待されるシステム挙動

1. UI が新規セッション開始要求を送る
2. Gateway が provider session を開始し、`appSessionId` を採番する
3. `status.changed(starting)` が表示される
4. 応答中に `message.delta` が複数回届き、`SessionPanel` に逐次反映される
5. 完了後、`result.richText` が `ResultRenderer` に表示される
6. `status.changed(completed)` へ遷移する

### 合格条件

- UI から provider の差分を意識せずに実行できる
- streaming 中に空白画面にならない
- 最終結果が Markdown として読みやすく表示される
- セッション情報に `agent`, `cwd`, `appSessionId` が紐づいて保持される

### 実装メモ

- まずは最初に通すべきシナリオである
- rich text のみで成立してよく、structured output は不要

## S2. 同一セッション継続会話

### 目的

- 同一 `appSessionId` 上で follow-up が成立することを確認する
- UI 側が単発実行アプリではなく会話アプリとして成立することを確認する

### 前提

- S1 が完了している
- 直前の要約結果が同一セッションに残っている

### ユーザー操作

1. S1 の完了後、同じ `SessionPanel` 上で follow-up を送る

```text
今の要約を前提に、このリポジトリで最初に実装すべきものを 3 つに絞って
```

### 期待されるシステム挙動

1. UI は既存の `appSessionId` を指定して message 送信する
2. Gateway は既存の provider session を再利用する
3. 応答は新しい `ConversationTurn` として記録される
4. 過去メッセージと新規メッセージがセッション単位で連続表示される

### 合格条件

- provider session が毎回新規作成されない
- follow-up の文脈が先行メッセージを踏まえている
- 会話履歴をセッション単位で追跡できる

### 実装メモ

- `appSessionId` と `providerSessionId` を分ける設計が効く場面である
- UI に最低限の履歴表示が必要になる

## S3. structured checklist 生成

### 目的

- structured response の取得
- structured / rich text の描き分け
- provider 差分の吸収

を成立させる。

### 前提

- S1 と S2 が完了している
- `ResultRenderer` が structured モードを持っている

### 入力プロンプト

```text
このリポジトリで新機能実装に着手する前のチェックリストを JSON で返して。
各項目は id, title, reason, priority を含めて。
priority は high / medium / low のいずれかにして。
```

### 期待される出力スキーマ

```ts
interface ImplementationChecklist {
  type: "implementation-checklist";
  items: {
    id: string;
    title: string;
    reason: string;
    priority: "high" | "medium" | "low";
  }[];
}
```

### 期待されるシステム挙動

1. Codex の場合は `outputSchema` を使って structured output を取得する
2. Copilot の場合は JSON 出力を要求し、Gateway で parse / validate / normalize する
3. 正常時は `result.structured` を返す
4. 異常時は `result.richText` にフォールバックし、UI にその旨を示せる

### 合格条件

- 両 provider とも最終的に UI が checklist をカードまたは表形式で描画できる
- structured 変換に失敗してもセッション自体は壊れない
- Renderer が provider ごとの parse 分岐を持たない

### 実装メモ

- このシナリオが通ることで、将来のレビュー総評・指摘一覧表示へつながる
- schema はまず 1 種類に固定し、汎用化しすぎない

## S4. Codex セッション fork

### 目的

- provider 固有機能を capability ベースで UI に露出できるか確認する
- 将来の「レビューからスレッド分岐して議論する」体験の基礎を確かめる

### 前提

- `codex` を選択している
- セッション capability に `forkSession` が含まれる
- S2 まで完了している

### ユーザー操作

1. 既存セッションで fork 操作を実行する
2. 分岐先セッションへ次のプロンプトを送る

```text
今の会話を前提に、別案としてより保守的な実装方針を提案して
```

### 期待されるシステム挙動

1. UI は `forkSession` が有効なときのみ fork ボタンを表示する
2. Gateway が Codex Adapter の fork API を呼ぶ
3. 新しい `appSessionId` が発行される
4. 分岐先は元セッションの文脈を持つが、履歴表示は別セッションとして扱う

### 合格条件

- 元セッションと fork 後セッションが UI 上で区別できる
- 分岐先が元文脈を踏まえた返答を返す
- Copilot 選択時に同じ操作が表示されない

## S5. Codex 実行中 steer

### 目的

- 実行中 turn への追加指示を安全に扱えるか確認する
- 将来のレビュー中の再指示や軌道修正の基礎を確認する

### 前提

- `codex` を選択している
- capability に `steerActiveTurn` が含まれる
- やや長めの応答が返るプロンプトを使う

### ユーザー操作

1. 次のような長めの回答を誘発するプロンプトを送る

```text
このリポジトリの実装計画を詳細に提案して
```

2. 応答中に steer 操作で次を送る

```text
要点だけに絞って。箇条書き 5 項目以内にして
```

### 期待されるシステム挙動

1. UI は `running` 中のみ steer 入力を許可する
2. Gateway が active turn に対して steer を送る
3. 以後の stream または final result に steer の効果が反映される

### 合格条件

- steer により応答方針が変わる
- セッションが壊れず、その後も会話を継続できる
- capability がない provider ではこの操作を出さない

## S6. 権限要求の UI 中継

### 目的

- provider からの permission request を UI に届け、応答を返せることを確認する
- 将来の安全なレビュー補助やローカル操作拡張の土台を作る

### 前提

- provider が権限要求イベントを出す操作を行う
- UI に確認ダイアログまたはインライン確認表示がある

### ユーザー操作

1. 権限要求が発生するタスクを送る
2. UI 上で許可または拒否を選ぶ

### 期待されるシステム挙動

1. Gateway が `permission.requested` を UI へ中継する
2. UI は request 内容を表示し、ユーザー判断を受け付ける
3. UI の判断が Gateway を経由して provider へ返る
4. 許可時は処理継続、拒否時はエラーまたは中断として完了する

### 合格条件

- permission request が無視されず UI から見える
- 許可・拒否どちらでもセッション状態が破綻しない

## 6. 実装順

1. S1 を最初に通す
2. S2 でセッション継続を確認する
3. S3 で structured result を導入する
4. S4 と S5 で Codex 固有機能を追加する
5. S6 で permission mediation を固める

この順にする理由:

- 先に会話基盤が成立しないと structured や fork の価値を評価できない
- structured result は rich text より後に追加しても UI 境界を保ちやすい
- Codex 固有機能は capability ベース設計が成立してから加える方が安全である

## 7. シナリオごとの成果物

| シナリオ | 実装で最低限必要な成果物 |
| --- | --- |
| S1 | session start API、stream 表示、rich text renderer |
| S2 | session registry、history 表示、follow-up 送信 API |
| S3 | result schema、validator、structured renderer、fallback |
| S4 | capability 取得、fork API、派生 session UI |
| S5 | active turn 管理、steer API、実行中 UI 制御 |
| S6 | permission event、中継 API、確認 UI |

## 8. やらないシナリオ

PoC 段階では次のシナリオは扱わない。

- GitHub PR の diff を取得して表示する
- inline comment thread を保持する
- diff 更新後の再レビューを自動で関連付ける
- provider を跨いだ session 引き継ぎを行う
- 本番品質のログ監査や権限制御を整備する

理由:

- いずれも agent 統合の成立確認より周辺要素の実装比率が大きい
- PoC の主目的である会話、streaming、structured 表示の判断を遅らせる

## 9. 完了判定

最低完了条件:

- S1, S2, S3 が両 provider で成立する

推奨完了条件:

- 最低完了条件に加えて S4, S5 の少なくとも一方が成立する

拡張完了条件:

- S6 まで成立し、権限要求を含む実運用寄りの導線が確認できる

PoC の評価は、機能数ではなく「境界設計が次のユースケースへ拡張可能か」で行う。
