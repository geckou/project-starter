# @geckou/ui

Web（Next.js）用の React UI コンポーネント集。
[geckou/vue-ui](https://github.com/geckou/vue-ui) を React 19 + Tailwind CSS v4 に移植したもの。

Mobile（Expo / NativeWind）では使えない（DOM 前提のため）。

## 使い方

`apps/web` には設定済み。コード内でそのままインポートできる。

```tsx
import { TextBox, BasicButton, ModalBox } from '@geckou/ui'
```

新しいアプリで使う場合は以下の4点を設定する:

1. `package.json` に `"@geckou/ui": "*"` を追加
2. `next.config.ts` の `transpilePackages` に `'@geckou/ui'` を追加
3. `tailwind.config.ts` の `content` に `'../../packages/ui/src/**/*.{ts,tsx}'` を追加
4. グローバル CSS に `@import '@geckou/ui/styles/tokens.css';` を追加（デザイントークン）

## 構成

```
ui/src/
├── components/        # UI コンポーネント本体
│   └── icons/         # コンポーネント内部で使う SVG アイコン
├── constants/         # デフォルトカラー等の定数
├── styles/tokens.css  # デザイントークン（流体スペーシング・フォントサイズ等）
├── types/             # cssStyle・Option・Validates 等の型定義
└── index.ts           # 一括エクスポート
```

## デザイントークン

`styles/tokens.css` はビューポート幅 430〜980px で連続変化する流体トークン（`--bv` 基準の `--sp-*` / `--icon-*` / `--radius-*` / `--fs-*` 等）を定義する。
各コンポーネントは `var(--トークン, フォールバック)` で参照するため、未読み込みでも固定値で動作する。読み込むと画面幅に応じたスケーリングが有効になる。

## コンポーネント一覧

| 分類 | コンポーネント |
|---|---|
| 入力 | `TextBox`, `TextArea`, `SelectBox`, `SearchableSelectBox`, `FileInput`, `InputBox`, `InputGroup`, `LabeledFieldset` |
| 選択 | `CheckBox`, `CheckBoxes`, `CheckButton`, `LabeledCheckbox`, `RadioButtons`, `ToggleButton` |
| 日付 | `DateSelector`, `DatePicker`, `DateRangePicker` |
| ボタン | `BasicButton` |
| オーバーレイ / UI | `ModalBox`, `PopupBox`, `DropdownUi`, `SlideDownUi`, `TabUI` |
| 表示 | `ErrorMessage`, `LoadingSpinner` |

## スタイルカスタマイズ

各コンポーネントは `cssStyle` プロパティで状態別（`default` / `focus` / `error` / `valid` / `disabled` / `hover`）の色・枠線・影を上書きできる。
未指定時は `src/constants` のデフォルトカラーが適用される。

```tsx
<TextBox
  name="email"
  value={email}
  onChange={setEmail}
  cssStyle={{
    default: { border: { color: '#ccc', size: '1px', radius: '.5rem' } },
    focus: { border: { color: '#1c4ac9', size: '2px', radius: '.5rem' } },
  }}
/>
```

## バリデーション

`TextBox` / `TextArea` は `validates`（正規表現 + メッセージの配列）と `isRequired` を渡すと blur 時に検証し、エラーを吹き出し表示する。

```tsx
<TextBox
  name="zipcode"
  value={zipcode}
  onChange={setZipcode}
  isRequired
  validates={[{ regex: /^\d{7}$/, message: '郵便番号は7桁の数字で入力してください' }]}
/>
```
