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

`renovate.json5` が JSON5 なのは、**理由をコメントで残すため**と、mobile 層のマーカーを
書けるようにするため（JSON にはコメントが書けず、範囲を囲めない）。preset 側は JSON なので、
判断の理由は各ルールの `description` に書く（Renovate が Dependency Dashboard に表示する）。

## 決めていること

- **minor / patch は1本にまとめ、CI が緑なら自動マージする。** 派生数ぶんの週次 PR を
  人力で捌かないための本体。テンプレートの `ci.yml` が型チェック・Lint・テスト・
  ルールテスト・ビルドまで回しているので、自動マージの判断材料は揃っている
- **メジャーは自動 PR を作らない。** CI が緑でも壊れていることがあるため
  （NativeWind と Tailwind の組み合わせは CI で検証されない）。必要になったら
  Dependency Dashboard（Renovate が自動生成する Issue）から手動で上げる
- **GitHub Actions のメジャーは対象に残す。** 失敗すれば CI が即座に赤くなり検知できる
- **Firebase SDK は自動マージしない。** 認証・課金の挙動に直結するため目視で確認する
- **脆弱性の修正は常に PR を作る。** メジャー全面 ignore の対象外。自動マージはしない
- **Expo 系は Renovate に触らせない。** `expo install --fix` 前提でバージョン整合が厳しいため、
  Expo SDK のアップグレードとしてまとめて手動で行う（脆弱性の修正も止まる点に注意）

## 派生プロジェクトでの前提

1. Renovate の GitHub App を派生プロジェクトにインストールする。preset 側
   （`geckou/project-starter`）は public なので、追加のアクセス設定は要らない
2. `renovate.json5` を置く（Template Sync で配られる）
3. Dependabot とは**併存させない**。同じ更新で PR が二重に立つため、
   Dependabot の設定ファイル（`.github/` 配下）が残っていれば削除する
   （テンプレート側では削除済み）

## 配れないもの（構造的な死角）

ルート `package.json` の `resolutions` は **preset では配れない**。
Renovate preset は設定を配る仕組みであって、`package.json` にフィールドを注入はしない。
`.templatesyncignore` がルート `package.json` を除外しているため Template Sync でも届かない。

```json
"resolutions": {
  "tar": ">=7.5.11",
  "@xmldom/xmldom": ">=0.8.12",
  "@tootallnate/once": ">=3.0.1"
}
```

トランジティブ依存の脆弱性は `vulnerabilityAlerts` による remediation で多くが代替できるが、
明示的なピン留めが必要になるケースは残る。その場合は**派生への反映要否を Issue / PR に明記する**
（共有実装の修正と同じ暫定運用）。

**配布経路を整えると「もう全部自動で流れる」と錯覚しやすく、`resolutions` はその死角に入る。**
穴が空いていること自体を、ここに明示しておく。
