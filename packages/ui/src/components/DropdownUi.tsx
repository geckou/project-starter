'use client'

import type { CSSProperties, ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { KeyboardArrowDownIcon } from './icons/KeyboardArrowDownIcon'
import { COLOR } from '../constants'

// 元実装（vue-ui）の defineExpose({ isContentsOpened }) 相当
export type DropdownUiHandle = {
  isContentsOpened: () => boolean
  close: () => void
}

type Props = {
  isHiddenArrow?: boolean
  contentAlignment?: 'left' | 'center' | 'right'
  isDisabled?: boolean
  contentsWidth?: string
  trigger: ReactNode
  contents?: ReactNode
  ref?: Ref<DropdownUiHandle>
}

export function DropdownUi({
  isHiddenArrow = false,
  contentAlignment = 'left',
  isDisabled = false,
  contentsWidth = 'auto',
  trigger,
  contents,
  ref,
}: Props) {
  const [isContentsOpened, setIsContentsOpened] = useState(false)
  const [contentsHeight, setContentsHeight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const contentsRef = useRef<HTMLDivElement>(null)

  const toggleBox = () => setIsContentsOpened((current) => !current)
  const closeDropDown = () => setIsContentsOpened(false)

  useImperativeHandle(ref, () => ({
    isContentsOpened: () => isContentsOpened,
    close: closeDropDown,
  }))

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) closeDropDown()
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  useEffect(() => {
    const contentsElement = contentsRef.current
    if (!contentsElement) return

    const updateContentsHeight = () =>
      setContentsHeight(contentsElement.clientHeight)

    updateContentsHeight()
    const observer = new ResizeObserver(updateContentsHeight)
    observer.observe(contentsElement)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- サイズ変化は ResizeObserver が検知するため、contents の有無が変わったときだけ再登録する
  }, [Boolean(contents)])

  const isInactive = isDisabled || !contents

  const style = {
    '--trigger-color': isInactive ? COLOR.black : COLOR.blue,
  } as CSSProperties

  const contentsStyle: CSSProperties = {
    boxShadow: isContentsOpened ? '0 0 6px #33333333' : 'none',
    blockSize: isContentsOpened ? `${contentsHeight}px` : 0,
    inlineSize: contentsWidth,
    right:
      contentAlignment === 'right'
        ? 'calc(var(--bv, 0.375rem) * -0.5)'
        : 'auto',
    left:
      contentAlignment === 'left' ? 'calc(var(--bv, 0.375rem) * -0.5)' : 'auto',
    zIndex: 2,
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={isDisabled}
        aria-expanded={isContentsOpened}
        style={{ ...style, cursor: isInactive ? 'auto' : 'pointer' }}
        className="flex size-full items-center gap-[var(--sp-small,0.375rem)] text-(--trigger-color)"
        onClick={(event) => {
          event.preventDefault()
          toggleBox()
        }}
      >
        {trigger}
        {!(isHiddenArrow || !contents || isDisabled) && (
          <KeyboardArrowDownIcon
            className={`size-[var(--icon-small,0.9375rem)] flex-none transition-all duration-100 ${isContentsOpened ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {contents && (
        <div
          style={contentsStyle}
          inert={!isContentsOpened}
          className="absolute top-[calc(100%-var(--sp-min,0.1875rem))] cursor-pointer overflow-hidden rounded-[var(--radius-small,0.1875rem)] transition-[block-size] duration-100"
        >
          <div
            ref={contentsRef}
            className="max-h-[calc(var(--bv,0.375rem)*56)] min-w-[calc(var(--bv,0.375rem)*20)] overflow-auto bg-white"
            onClick={closeDropDown}
          >
            {contents}
          </div>
        </div>
      )}
    </div>
  )
}
