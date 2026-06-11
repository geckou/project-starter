---
name: new-store
description: Zustand ストアの追加
---

# new-store

新しい Zustand ストアを追加する。

## 手順

### 1. ストアファイルの作成

`packages/shared/src/stores/` にケバブケースで作成する。

```typescript
// packages/shared/src/stores/ui-store.ts
import { create } from 'zustand'

type UiState = {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
```

### 2. バレルエクスポートに追加

`packages/shared/src/stores/index.ts` に追加:

```typescript
export { useUiStore } from './ui-store'
```

### 3. 命名規則

| 対象       | ルール         | 例             |
| ---------- | -------------- | -------------- |
| ファイル名 | ケバブケース   | `ui-store.ts`  |
| store 名   | `use〇〇Store` | `useUiStore`   |
| State 型   | `〇〇State`    | `UiState`      |

### 4. ストア設計のガイドライン

- state は最小限にする（派生データは store に入れない）
- アクションは state と同じオブジェクトに定義する
- 非同期処理が必要な場合は `set` を直接呼ぶ:

```typescript
fetchUser: async (uid: string) => {
  set({ loading: true })
  const user = await getUser(uid)
  set({ user, loading: false })
}
```

- リセット関数を用意する（ログアウト時などに使う）

### 5. テストの追加

`packages/shared/tests/` にテストを追加:

```typescript
import { describe, expect, it } from 'vitest'
import { useUiStore } from '../src/stores/ui-store'

describe('useUiStore', () => {
  it('初期状態', () => {
    const state = useUiStore.getState()
    expect(state.sidebarOpen).toBe(false)
  })

  it('toggleSidebar', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })
})
```
