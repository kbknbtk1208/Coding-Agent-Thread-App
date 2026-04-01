# GitHub / GitLab PR・MR API 調査レポート

- 調査日: 2026-04-01
- 対象 PoC: PoC 第二弾 R1 `実データ読込と diff 表示`
- 前提: ユーザーがアクセス可能な private repository / private project 上の PR / MR を対象とする
- 調査方針: 公式ドキュメントをベースに、R1 で必要な接続情報、取得 API、正規化に必要な項目、実装上の注意点を整理する

## 1. 結論

R1 の初期実装で最低限そろえるべき接続情報は、次の 4 項目で足りる。

1. `provider`
2. `host`
3. `token`
4. `PR / MR URL`

この形にすると、GitHub は `owner/repo/pull_number`、GitLab は `project_path または project_id / merge_request_iid` を URL から復元できる。  
PoC 文書上も、R1 はまず 1 件の PR / MR を実データで取得して diff と discussion を表示できればよく、provider ごとの差を UI で意識させないことが目的になっている。

R1 の read path は次の構成が現実的である。

- GitHub: `pull detail` + `pull files` + `pull review comments` + `issue comments`
- GitLab: `mr detail` + `mr diffs` + `mr discussions`

GitHub は discussion の構造が REST だけだと少し薄く、必要に応じて GraphQL の `reviewThreads` を併用すると thread 単位で扱いやすい。  
GitLab は REST の `discussions` と `position` が比較的そのまま anchor 情報として使える。

## 2. R1 要件との対応

PoC 第二弾の R1 は次を要求している。

- GitHub / GitLab の PR / MR を実データから取得する
- diff と既存 discussion を UI に表示する
- diff、discussion、comment anchor を正規化する
- `ReviewSnapshot` に `baseSha` `headSha` `files` `discussions` `providerContext.anchorRefs` を保持する

このため、API 調査では次の情報が取れることを確認する必要がある。

- 対象 PR / MR の識別子
- base / head の commit SHA
- 変更ファイル一覧
- unified diff あるいは patch 断片
- 既存 discussion / comment
- discussion を diff 上の位置に重ねるための anchor 情報

## 3. 共通の接続モデル

### 3-1. UI で保持すべき接続情報

最小構成:

| 項目 | 用途 |
| --- | --- |
| `provider` | `github` / `gitlab` の切り替え |
| `host` | SaaS / self-hosted 両対応のための API ベース URL 解決 |
| `token` | private repo / project 読み取り用 |
| `reviewUrl` | PR / MR の URL。最初の R1 ではこれを parse するのが最短 |

URL から抽出する値:

| Provider | URL から抽出する値 |
| --- | --- |
| GitHub | `owner`, `repo`, `pull_number` |
| GitLab | `project_path` または `project_id`, `merge_request_iid` |

### 3-2. R1 の初手で URL 入力を推奨する理由

- private repository / project の一覧取得は provider ごとに別 API と権限設計が必要
- R1 は 1 件の PR / MR から始めてよい
- URL 入力なら selector 用の discovery API 実装を後回しにできる

一覧 selector を後で追加する場合は、GitHub では repository / pull requests 一覧、GitLab では projects / merge requests 一覧を追加する。

## 4. GitHub

### 4-1. 接続先と認証

REST API:

- GitHub.com: `https://api.github.com`
- GitHub Enterprise Server: `https://<hostname>/api/v3`

GraphQL API:

- GitHub.com: `https://api.github.com/graphql`
- GitHub Enterprise Server: `https://<hostname>/api/graphql`

推奨ヘッダー:

```http
Accept: application/vnd.github+json
Authorization: Bearer <TOKEN>
X-GitHub-Api-Version: 2026-03-10
```

補足:

- GitHub REST API は versioned で、`X-GitHub-Api-Version` ヘッダー指定が推奨される
- GraphQL は `POST` と `Authorization: bearer TOKEN` で利用する

### 4-2. R1 で必要な識別子

| 項目 | 説明 |
| --- | --- |
| `owner` | リポジトリ owner |
| `repo` | リポジトリ名 |
| `pull_number` | PR 番号 |

補足:

- GitHub の PR は Issue を兼ねる
- PR 本文側のコメントは issue comments、diff 上のコメントは review comments として別 API になる

### 4-3. 認証方式と推奨権限

公式 docs 上、R1 で使う主要 endpoint は次の token 種別で利用できる。

- GitHub App user access token
- GitHub App installation access token
- fine-grained personal access token

R1 の read-only 前提での推奨 permission は次の通り。

| 用途 | 推奨 permission |
| --- | --- |
| PR 詳細 | `Pull requests: read` を基本。docs 上は `Contents: read` でも取得可能なケースあり |
| PR 変更ファイル | `Pull requests: read` |
| PR review comments | `Pull requests: read` |
| PR 本文スレッド相当の comments | `Issues: read` または `Pull requests: read` |

実装上は、fine-grained PAT を使うなら次を推奨する。

- 最小寄り: `Pull requests: read`
- 安全寄り: `Pull requests: read` + `Issues: read`

理由:

- PR 本文コメント取得は issue comments API を使う
- docs 上、issue comments は `Issues` または `Pull requests` permission の少なくとも一方で読めるが、実運用では `Issues: read` を併せた方が誤解が少ない

### 4-4. R1 で使う REST API

#### 4-4-1. PR 一覧

```http
GET /repos/{owner}/{repo}/pulls
```

用途:

- 対象 repository が確定している場合の PR selector

主な query:

- `state`
- `head`
- `base`
- `sort`
- `direction`
- `per_page`
- `page`

#### 4-4-2. PR 詳細

```http
GET /repos/{owner}/{repo}/pulls/{pull_number}
```

用途:

- タイトル、本文、state、author
- `base.sha`
- `head.sha`
- PR 本体の基本情報

R1 正規化への主な対応:

| GitHub field | `ReviewSnapshot` への用途 |
| --- | --- |
| `title` | `title` |
| `body` | `description` |
| `base.sha` | `baseSha` |
| `head.sha` | `headSha` |
| `number` | `reviewId` |
| `html_url` | provider 側 deep link |

補足:

- docs 上、この endpoint は適切な media type を指定すると diff / patch 形式も取得できる
- ただし R1 の file list 表示には別途 `files` endpoint を使う方が構造化しやすい

#### 4-4-3. PR 変更ファイル一覧

```http
GET /repos/{owner}/{repo}/pulls/{pull_number}/files
```

用途:

- file list の生成
- patch 断片の取得
- additions / deletions / changes の表示

主な response 項目:

| Field | 用途 |
| --- | --- |
| `filename` | file path |
| `status` | `added` / `modified` / `removed` など |
| `additions` | 集計表示 |
| `deletions` | 集計表示 |
| `changes` | 集計表示 |
| `patch` | unified diff 断片 |
| `sha` | file version 参照 |
| `blob_url` / `raw_url` / `contents_url` | 補助参照 |

docs 上の重要な制約:

- response は最大 3000 files
- default は 30 files / page
- `per_page` の最大は 100

R1 への示唆:

- 大きい PR はページング前提
- `patch` がないファイルや巨大 diff の扱いを UI / domain 側で吸収する必要がある

#### 4-4-4. PR 上の diff コメント

```http
GET /repos/{owner}/{repo}/pulls/{pull_number}/comments
```

用途:

- diff 上の既存 comment thread を再構成する

docs の example response から確認できる主要項目:

| Field | 用途 |
| --- | --- |
| `id` | remote comment id |
| `pull_request_review_id` | review 単位の関連付け |
| `diff_hunk` | 表示補助 |
| `path` | 対象 file |
| `position` / `original_position` | 旧来の diff position |
| `commit_id` / `original_commit_id` | anchor 保持 |
| `in_reply_to_id` | reply chain 再構成 |
| `start_line` / `original_start_line` | multiline anchor |
| `start_side` / `side` | LEFT / RIGHT の面情報 |
| `line` / `original_line` | 行 anchor |
| `body` | 本文 |
| `created_at` / `updated_at` | 表示・並び順 |

R1 正規化で重要な点:

- GitHub REST は `thread` を直接返すより comment の集合を返す寄りの設計
- thread 再構成は `in_reply_to_id` や review 単位のまとまりからアプリ側で組み立てる必要がある

#### 4-4-5. PR 本文側のコメント

```http
GET /repos/{owner}/{repo}/issues/{issue_number}/comments
```

用途:

- PR conversation タブ相当のコメント表示
- diff に紐づかない top-level comment の読込

補足:

- GitHub docs は「Every pull request is an issue, but not every issue is a pull request」と明記している
- issue comments API は PR と issue の共有 API である

### 4-5. GraphQL を併用する意味

REST だけでも R1 は成立するが、次の場合は GraphQL 併用が有利である。

- thread 単位で review comments を扱いたい
- comment thread の `resolved` / `outdated` 状態を取りたい
- 1 回の query で必要フィールドだけ取得したい

schema reference から確認できる主な型:

- `PullRequest`
- `PullRequestReviewThread`
- `PullRequestReviewComment`

`PullRequestReviewThread` では次のような情報を取得できる。

- `comments`
- `path`
- `line`
- `originalLine`
- `startLine`
- `originalStartLine`
- `diffSide`
- `startDiffSide`
- `isResolved`
- `isOutdated`
- `subjectType`

したがって、R1 初期版は REST 優先でよいが、discussion 表示を UI 上で provider 非依存に近づけたいなら GitHub 側だけ GraphQL 併用を検討する価値がある。

### 4-6. GitHub 実装上の注意

1. PR detail と issue comments と review comments は API が分かれている
2. `pulls/{pull_number}/files` は件数上限がある
3. thread 構造は GitLab より自前再構成が必要
4. GitHub Enterprise Server 対応時は REST が `/api/v3`、GraphQL が `/api/graphql`
5. REST API version header をクライアントで統一管理した方がよい

## 5. GitLab

### 5-1. 接続先と認証

REST API:

- GitLab.com / Self-Managed 共通で `https://<gitlab-host>/api/v4`

代表的な認証ヘッダー:

```http
PRIVATE-TOKEN: <TOKEN>
```

GitLab docs 上、personal access token は GitLab API 認証に利用できる。  
また 2FA または SAML 有効時は personal access token による認証が必要と明記されている。

### 5-2. R1 で必要な識別子

| 項目 | 説明 |
| --- | --- |
| `id` | project id または URL-encoded project path |
| `merge_request_iid` | project 内の MR 番号 |

補足:

- GitLab では `id` に numeric project id だけでなく URL-encoded path を使える endpoint が多い
- 実装では URL から `group/subgroup/project` を取り、URL encode して `id` に使うと self-hosted でも扱いやすい

### 5-3. 認証方式と推奨権限

R1 の read-only 前提なら、personal access token の scope は次を推奨する。

- 推奨最小: `read_api`
- 広め: `api`

docs 上の意味:

- `read_api`: API 全体への read access
- `api`: API 全体への read / write access

R1 は read-only なので `read_api` で十分である。  
`read_repository` は Git-over-HTTP や repository files API 用であり、MR / discussions API の read に対する主たる選択ではない。

### 5-4. R1 で使う REST API

#### 5-4-1. project 一覧

```http
GET /projects
```

用途:

- GitLab 側 selector 用の project discovery

docs で確認できる点:

- authenticated user がアクセス可能な projects を返す
- pagination 対応
- `membership`
- `min_access_level`
- `search`
- `simple`

R1 への示唆:

- private project の selector は GitLab 側の方が素直に組みやすい

#### 5-4-2. project 内 MR 一覧

```http
GET /projects/:id/merge_requests
```

用途:

- 対象 project が決まった後の MR selector

主な query:

- `state`
- `iids[]`
- `author_id`
- `author_username`
- `labels`
- `my_reaction_emoji`
- `page`
- `per_page`

補足:

- グローバルな `GET /merge_requests` は authenticated user がアクセス可能な MR を返すが、default では current user 作成分に寄るため、selector としては project scoped endpoint の方が扱いやすい

#### 5-4-3. MR 詳細

```http
GET /projects/:id/merge_requests/:merge_request_iid
```

用途:

- タイトル、説明、状態、author
- `diff_refs`
- MR の基本メタデータ

R1 正規化への主な対応:

| GitLab field | `ReviewSnapshot` への用途 |
| --- | --- |
| `title` | `title` |
| `description` | `description` |
| `iid` | `reviewId` |
| `web_url` | provider 側 deep link |
| `diff_refs.base_sha` | `baseSha` |
| `diff_refs.head_sha` | `headSha` |
| `diff_refs.start_sha` | `providerContext.anchorRefs` の補助 |

補足:

- docs には、新規 MR 作成直後は `diff_refs` と `changes_count` が非同期で空の場合がある旨がある
- R1 では read 対象が既存 MR なので通常は問題になりにくいが、ロード直後の再試行方針は持っておいた方がよい

#### 5-4-4. MR の変更ファイル一覧

```http
GET /projects/:id/merge_requests/:merge_request_iid/diffs
```

用途:

- 変更ファイル一覧
- file ごとの diff データ取得

docs 上の重要点:

- `page`
- `per_page`
- `collapsed` と `too_large` が response 属性として導入されている

R1 への示唆:

- 大きい diff を UI で安全に扱うには `collapsed` / `too_large` の伝播が必要
- GitHub と違い、巨大 diff 制約が response 属性として明示されやすい

#### 5-4-5. MR の raw diff

```http
GET /projects/:id/merge_requests/:merge_request_iid/raw_diffs
```

用途:

- 構造化された file list ではなく raw unified diff が必要な場合の fallback

補足:

- deprecated な `/changes` endpoint の docs では diff limit と `access_raw_diffs` に言及されている
- 新規実装では `/changes` ではなく `/diffs` を優先し、必要な場合だけ `raw_diffs` を fallback として使うのが安全

#### 5-4-6. MR の discussion 一覧

```http
GET /projects/:id/merge_requests/:merge_request_iid/discussions
```

用途:

- 既存 discussion / thread 一覧
- diff note の位置情報取得

docs で確認できる主要構造:

| Field | 用途 |
| --- | --- |
| `id` | discussion id |
| `individual_note` | 単独 note か thread かの判定 |
| `notes[]` | thread 内 note 群 |
| `notes[].type` | `DiscussionNote` / `DiffNote` / `null` |
| `notes[].body` | 本文 |
| `notes[].author` | 投稿者 |
| `notes[].created_at` | 並び順・表示 |

GitLab の強みは diff note の `position` モデルにある。discussion 作成 API の仕様から、diff thread の位置指定には次が使われる。

- `position[base_sha]`
- `position[head_sha]`
- `position[start_sha]`
- `position[old_path]`
- `position[new_path]`
- `position[old_line]`
- `position[new_line]`
- `position[line_range]`

R1 正規化への示唆:

- GitLab は diff anchor モデルが REST 上でかなり明示的
- `base/start/head sha` を `providerContext.anchorRefs` にそのまま保持しやすい

#### 5-4-7. MR version 情報

```http
GET /projects/:id/merge_requests/:merge_request_iid/versions
```

R1 の read-only 表示だけなら必須ではない。  
ただし R4 以降で draft comment を実投稿する際、GitLab discussion 作成には `base_sha` `head_sha` `start_sha` の整合が重要になるため、将来を見据えるなら adapter 側で取り込み可能な形にしておく価値がある。

### 5-5. GitLab 実装上の注意

1. `id` に numeric project id だけでなく URL-encoded path を使える
2. MR detail の `diff_refs` が anchor 正規化の起点になる
3. `discussions` が thread 単位で返るため、GitHub より正規化しやすい
4. `/changes` は deprecated なので新規実装は `/diffs` を使う
5. GitLab REST pagination は `Link` header を使う前提で実装した方がよい

## 6. GitHub / GitLab 比較

| 観点 | GitHub | GitLab |
| --- | --- | --- |
| base/head SHA | PR detail の `base.sha` / `head.sha` | MR detail の `diff_refs.base_sha` / `head_sha` / `start_sha` |
| 変更ファイル | `pulls/{pull_number}/files` | `merge_requests/:iid/diffs` |
| raw diff | PR detail の diff media type | `raw_diffs` |
| diff 上コメント | `pulls/{pull_number}/comments` | `merge_requests/:iid/discussions` |
| PR/MR 本文コメント | `issues/{issue_number}/comments` | `discussions` に統合されやすい |
| thread 構造 | REST では再構成寄り。GraphQL 併用が有効 | REST だけで thread モデルを取りやすい |
| anchor 情報 | `path`, `line`, `side`, `commit_id`, `diff_hunk` などを組み合わせる | `position` が明示的で SHA も持ちやすい |
| self-hosted API root | REST `/api/v3`, GraphQL `/api/graphql` | REST `/api/v4` |

要点:

- GitHub は API の責務が `PR detail` `review comments` `issue comments` に分かれている
- GitLab は MR detail と discussions が比較的一貫しており、anchor を保持しやすい
- provider 差分を UI から隠すなら、adapter 層で `discussion` と `anchor` の正規化責務を強める必要がある

## 7. `ReviewSnapshot` への対応表

| `ReviewSnapshot` | GitHub | GitLab |
| --- | --- | --- |
| `provider` | 固定値 `github` | 固定値 `gitlab` |
| `reviewId` | `pull_number` | `merge_request_iid` |
| `title` | PR detail `title` | MR detail `title` |
| `description` | PR detail `body` | MR detail `description` |
| `baseSha` | PR detail `base.sha` | MR detail `diff_refs.base_sha` |
| `headSha` | PR detail `head.sha` | MR detail `diff_refs.head_sha` |
| `files[]` | `pulls/{pull_number}/files` | `merge_requests/:iid/diffs` |
| `discussions[]` | review comments + issue comments を再構成 | `discussions` を正規化 |
| `providerContext.anchorRefs` | `commit_id`, `original_commit_id`, `diff_hunk`, `side` など | `diff_refs`, `position`, `line_range` など |

## 8. R1 に対する推奨入力仕様

R1 初期版の接続フォームは次で十分である。

| 項目 | 型 | 備考 |
| --- | --- | --- |
| `provider` | enum | `github` / `gitlab` |
| `host` | string | SaaS は初期値、self-hosted は手入力 |
| `token` | secret string | read-only を推奨 |
| `reviewUrl` | string | PR / MR の URL |

内部で parse した結果:

```ts
type ReviewSourceInput =
  | {
      provider: 'github';
      host: string;
      token: string;
      owner: string;
      repo: string;
      pullNumber: number;
    }
  | {
      provider: 'gitlab';
      host: string;
      token: string;
      projectPathOrId: string;
      mergeRequestIid: number;
    };
```

## 9. R1 の推奨 fetch フロー

### 9-1. GitHub

1. `GET /repos/{owner}/{repo}/pulls/{pull_number}`
2. `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`
3. `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments`
4. `GET /repos/{owner}/{repo}/issues/{pull_number}/comments`
5. 必要なら GraphQL で `reviewThreads`

### 9-2. GitLab

1. `GET /projects/:id/merge_requests/:merge_request_iid`
2. `GET /projects/:id/merge_requests/:merge_request_iid/diffs`
3. `GET /projects/:id/merge_requests/:merge_request_iid/discussions`
4. 必要なら `raw_diffs`
5. 将来の投稿を見据えるなら `versions`

## 10. 実装上の判断メモ

### 10-1. 最初の selector は URL ベースでよい

R1 は 1 件の PR / MR を実データで通せればよい。  
一覧 selector を先に作るより、URL 入力で adapter の正規化を先に成立させた方が PoC の進行に合う。

### 10-2. discussion 表示の抽象化は adapter でやる

UI に raw provider payload を渡すと、次の差が露出して破綻しやすい。

- GitHub は `review comments` と `issue comments` が別
- GitHub REST は thread より comment 集合寄り
- GitLab は `discussions` が thread で返る

したがって、`ReviewSourceAdapter` 側で少なくとも次を共通化した方がよい。

- thread id
- note / reply の配列
- path
- line / line range
- old/new side
- resolved / outdated 相当
- remote identifiers

### 10-3. `providerContext.anchorRefs` は削らない

PoC 文書でも、後続の投稿に必要な anchor 情報を snapshot に含めることが前提になっている。  
R1 では表示だけでも、R4 の投稿前承認・実投稿を見据えて raw に近い anchor 情報を保持すべきである。

### 10-4. GitHub は GraphQL 追加余地を前提にした方がよい

GitHub REST だけで開始して問題ないが、discussion の thread 性を UI で自然に見せたい場合は GraphQL 追加がほぼ確実に効く。  
このため adapter 境界を REST 固定にしすぎない方がよい。

## 11. 参考リンク

### GitHub

- [REST API endpoints for pull requests](https://docs.github.com/en/rest/pulls/pulls)
- [REST API endpoints for pull request review comments](https://docs.github.com/en/rest/pulls/comments)
- [REST API endpoints for issue comments](https://docs.github.com/en/rest/issues/comments)
- [Permissions required for fine-grained personal access tokens](https://docs.github.com/en/rest/overview/permissions-required-for-fine-grained-personal-access-tokens)
- [API Versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [Using pagination in the REST API](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [About the GraphQL API](https://docs.github.com/en/graphql/overview/about-the-graphql-api)
- [Forming calls with GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)
- [GraphQL Objects reference](https://docs.github.com/en/graphql/reference/objects)

### GitLab

- [Merge requests API](https://docs.gitlab.com/api/merge_requests/)
- [Discussions API](https://docs.gitlab.com/api/discussions/)
- [Projects API](https://docs.gitlab.com/api/projects/)
- [REST API](https://docs.gitlab.com/api/rest/)
- [Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/)

## 12. 補足

このレポートは 2026-04-01 時点の公式 docs を基準にしている。  
特に GitHub REST API version、GitLab diff 系 endpoint の属性、fine-grained permission 表記は今後変わり得るため、実装時は adapter のテスト fixture を固定しつつ docs 差分を追えるようにしておくべきである。
