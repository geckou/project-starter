# 依存更新の方針

依存の更新は **Renovate の shared preset** で行う。ルール本体はテンプレート側の
`renovate/*.json` にあり、各プロジェクトは `renovate.json5` から `extends` するだけ。
**設定のコピーを配らない**ので、ルールの変更は preset の1コミットで全派生へ即時に届く
（`.github/workflows/ci.yml` を reusable workflow として参照するのと同じ形）。

## 構成

| ファイル | 役割 |
| --- | --- |
| `renovate.json5` | 各プロジェクトが持つ参照だけの設定。Template Sync で配る |
| `renovate/default.json` | 共通ルール（グルーピング・automerge・メジャーの扱い・脆弱性） |
| `renovate/mobile.json` | mobile 層のルール（Expo 系の全面 ignore、React / Tailwind のメジャー固定） |
| `renovate/automerge.json` | minor / patch の自動マージ（**opt-in**。既定では extends しない） |

`renovate.json5` が JSON5 なのは、**理由をコメントで残すため**と、mobile 層のマーカーを
書けるようにするため（JSON にはコメントが書けず、範囲を囲めない）。preset 側は JSON なので、
判断の理由は各ルールの `description` に書く（Renovate が Dependency Dashboard に表示する）。

## 決めていること

- **minor / patch は1本にまとめる。自動マージは既定で無効。** `production` へのマージは
  本番デプロイを発火するため、自動マージを既定にすると依存更新が staging を経ずに本番へ出る。
  自動マージしたい構成（`production` への push が本番デプロイに繋がらない、あるいは
  その形で流してよいと判断した場合）は `renovate.json5` の `extends` に
  `github>geckou/project-starter//renovate/automerge` を足す。
  **ただしそれだけでは完了しない**: `.github/rulesets/production.json` はレビュー承認を
  1件必須にしており、Renovate はブランチ保護の条件が満たされるまで待つ。自動マージを
  実際に効かせるには、ruleset で Renovate を bypass actor に加えるか、
  そのリポジトリのレビュー要件自体を見直す
- **メジャーは自動では PR を作らない。** CI が緑でも壊れていることがあるため
  （NativeWind と Tailwind の組み合わせは CI で検証されない）。Dependency Dashboard
  （Renovate が自動生成する Issue）に承認待ちで並ぶので、必要なタイミングでチェックを入れて上げる。
  `enabled: false` ではなく `dependencyDashboardApproval: true` を使うのは、
  無効化すると Dashboard にも出てこなくなるため
- **GitHub Actions のメジャーは対象に残す。** 失敗すれば CI が即座に赤くなり検知できる
- **Firebase SDK は自動マージしない。** 認証・課金の挙動に直結するため目視で確認する
- **脆弱性の修正は常に PR を作る。** メジャー全面 ignore の対象外。自動マージはしない
- **Expo 系は Renovate に触らせない。** `expo install --fix` 前提でバージョン整合が厳しいため、
  Expo SDK のアップグレードとしてまとめて手動で行う（脆弱性の修正も止まる点に注意）

## 派生プロジェクトでの前提

既存の派生プロジェクトを参照方式へ切り替えるときは、**設定ファイル側（下の 4）と
第0層の設定（ESLint / Prettier / commitlint）は
`node scripts/adopt-references.mjs --repo <派生のパス>` が生成する**
（→ `.claude/docs/git-workflow.md`「切り替え手順（派生プロジェクト側）」）。
1〜3・5 は管理画面での操作なのでスクリプトからはできない。実行すると残作業として印字される。
依存を入れ替えるため、実行後に `yarn install` で `yarn.lock` を更新する。

1. Renovate の GitHub App を派生プロジェクトにインストールする。preset 側
   （`geckou/project-starter`）は public なので、追加のアクセス設定は要らない
2. **Silent mode を切る。** App を入れただけでは PR が来ない。Mend の管理画面
   （app.mend.io）でリポジトリの Settings > Dependencies を開き、**Silent mode を OFF**、
   **Automated PRs を ON** にする。Silent mode はジョブを実行しても PR も
   Dependency Dashboard も作らないモードで、**組織の既定が Silent になっていることがある**。
   ジョブが DONE なのに何も起きないときはこれを疑う（設定ファイルの問題ではない）。
   リポジトリごとに上書きするより、組織側の既定を変えるほうが以後の派生で手当てが要らない
3. **脆弱性アラートを使うための設定を有効にする。** `vulnerabilityAlerts` は GitHub の
   アラートを読んで PR を作る仕組みなので、リポジトリ設定で **Dependency graph** と
   **Dependabot alerts** を有効化し、App に alerts の読み取りを許可する。
   private リポジトリでは既定で無効なことがあり、**気付かないままセキュリティ更新だけ
   止まる**（Settings > Advanced Security から有効化する）
4. `renovate.json5` を置く（Template Sync で配られる。既存プロジェクトへの後付けは
   `scripts/adopt-references.mjs` が生成する）
5. Dependabot とは**併存させない**。同じ更新で PR が二重に立つため、
   Dependabot の設定ファイル（`.github/` 配下）が残っていれば削除する
   （テンプレート側では削除済み）
6. `renovate/*` から `production` への PR は `branch-guard.yml` が例外として許可する
   （依存更新はリリース単位に束ねる意味が薄いため）。マージ = 本番デプロイになる点は
   変わらないので、タイミングは人が選ぶ

## 配れないもの（構造的な死角）

ルート `package.json` の `resolutions` は **preset では配れない**。
Renovate preset は設定を配る仕組みであって、`package.json` にフィールドを注入はしない。
`.templatesyncignore` がルート `package.json` を除外しているため Template Sync でも届かない。

```json
"resolutions": {
  "tar": ">=7.5.11",
  "@xmldom/xmldom": ">=0.8.12",
  "@tootallnate/once": ">=3.0.1",
  "vite": "~7.3.2",
  "eslint-plugin-react-hooks": "^5"
}
```

トランジティブ依存の脆弱性は `vulnerabilityAlerts` による remediation で多くが代替できるが、
明示的なピン留めが必要になるケースは残る。その場合は**派生への反映要否を Issue / PR に明記する**
（共有実装の修正と同じ暫定運用）。

**配布経路を整えると「もう全部自動で流れる」と錯覚しやすく、`resolutions` はその死角に入る。**
穴が空いていること自体を、ここに明示しておく。
