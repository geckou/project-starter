'use client'

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useId, useRef, useState } from 'react'
import { COLOR } from '../constants'

type Tab = {
  key: string
  label: string
}

type Props = {
  tabs: Tab[]
  color?: {
    active: string
    background: string
    text: string
  }
  type?: 'tab' | 'button' | 'border'
  initialIndex?: number
  tabSlots?: Record<string, ReactNode>
  panelSlots?: Record<string, ReactNode>
}

export function TabUI({
  tabs,
  color,
  initialIndex = 0,
  tabSlots,
  panelSlots,
}: Props) {
  const [activeTab, setActiveTab] = useState(
    () => tabs[initialIndex]?.key ?? tabs[0]?.key ?? ''
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  // 複数インスタンス設置時の DOM id 重複を避ける
  const uid = useId()
  const tabId = (key: string) => `${uid}-tab-${key}`
  const panelId = (key: string) => `${uid}-panel-${key}`

  const changeTabs = (key: string) => setActiveTab(key)

  const activateTab = (index: number) => {
    setActiveTab(tabs[index].key)
    tabRefs.current[index]?.focus()
  }

  // 元実装（vue-ui）は window 全体に keydown を張っていたため、フォーカス位置と
  // 無関係にタブが切り替わり複数設置時に競合した。タブリストにフォーカスが
  // あるときだけ矢印キーで移動する（WAI-ARIA Tabs パターン）
  const handleKeydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    const currentIndex = tabs.findIndex((tab) => tab.key === activeTab)
    if (currentIndex === -1) return

    event.preventDefault()
    const lastIndex = tabs.length - 1

    if (event.key === 'ArrowLeft') {
      activateTab(currentIndex > 0 ? currentIndex - 1 : lastIndex)
    } else {
      activateTab(currentIndex < lastIndex ? currentIndex + 1 : 0)
    }
  }

  const style = {
    '--active-color': color?.active || COLOR.blue,
    '--background-color': color?.background || 'transparent',
  } as CSSProperties

  return (
    <div>
      <div
        style={style}
        className="flex bg-(--background-color)"
        role="tablist"
        onKeyDown={handleKeydown}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={tabId(tab.key)}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-controls={panelId(tab.key)}
            aria-selected={activeTab === tab.key}
            tabIndex={activeTab === tab.key ? 0 : -1}
            className={`border-none bg-transparent px-4 py-2 text-base ${activeTab === tab.key ? 'cursor-auto' : 'cursor-pointer'}`}
            onClick={() => changeTabs(tab.key)}
          >
            {tabSlots?.[tab.key] ?? tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={`${tab.key}_panel`}
          id={panelId(tab.key)}
          role="tabpanel"
          aria-labelledby={tabId(tab.key)}
          hidden={activeTab !== tab.key}
        >
          {panelSlots?.[`${tab.key}Contents`]}
        </div>
      ))}
    </div>
  )
}
