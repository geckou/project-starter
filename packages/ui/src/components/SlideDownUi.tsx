'use client'

import type { CSSProperties, ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { KeyboardArrowDownIcon } from './icons/KeyboardArrowDownIcon'
import { COLOR } from '../constants'

// 元実装（vue-ui）の defineExpose({ isOpenedContents }) 相当
export type SlideDownUiHandle = {
  isOpenedContents: () => boolean
  close: () => void
}

type Props = {
  isOpened?: boolean | null
  isHiddenArrow?: boolean
  isDisabled?: boolean
  isDisableClickOutside?: boolean
  duration?: number
  trigger: ReactNode
  children: ReactNode
  ref?: Ref<SlideDownUiHandle>
}

export function SlideDownUi({
  isOpened = null,
  isHiddenArrow = false,
  isDisabled = false,
  isDisableClickOutside = false,
  duration = 0.3,
  trigger,
  children,
  ref,
}: Props) {
  const [isOpenedContents, setIsOpenedContents] = useState(isOpened || false)
  const [isOverflowVisible, setIsOverflowVisible] = useState(isOpened || false)
  const [contentsHeight, setContentsHeight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const contentsRef = useRef<HTMLDivElement>(null)

  const toggleBox = () => setIsOpenedContents((current) => !current)

  useImperativeHandle(ref, () => ({
    isOpenedContents: () => isOpenedContents,
    close: () => setIsOpenedContents(false),
  }))

  useEffect(() => {
    if (typeof isOpened === 'boolean') setIsOpenedContents(isOpened)
  }, [isOpened])

  useEffect(() => {
    if (isDisableClickOutside) return

    const handleClickOutside = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node))
        setIsOpenedContents(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [isDisableClickOutside])

  useEffect(() => {
    const contentsElement = contentsRef.current
    if (!contentsElement) return

    const updateContentsHeight = () =>
      setContentsHeight(contentsElement.clientHeight)

    updateContentsHeight()
    const observer = new ResizeObserver(updateContentsHeight)
    observer.observe(contentsElement)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- サイズ変化は ResizeObserver が検知するため、マウント時の1回だけ登録する
  }, [])

  useEffect(() => {
    if (!isOpenedContents) {
      setIsOverflowVisible(false)
      return
    }

    const timer = setTimeout(() => setIsOverflowVisible(true), duration * 1000)
    return () => clearTimeout(timer)
  }, [isOpenedContents, duration])

  const style = { '--link-color': COLOR.blue } as CSSProperties

  return (
    <div ref={rootRef} style={style}>
      <button
        type="button"
        disabled={isDisabled}
        aria-expanded={isOpenedContents}
        className="relative grid w-full cursor-pointer grid-cols-[1fr_auto] items-center justify-items-start text-(--link-color)"
        onClick={(event) => {
          event.preventDefault()
          toggleBox()
        }}
      >
        <div className="w-full text-left">{trigger}</div>
        {!isHiddenArrow && (
          <KeyboardArrowDownIcon
            className={`size-[var(--icon-medium,1.125rem)] flex-none text-(--link-color) transition-all duration-100 ${isOpenedContents ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      <div
        style={{
          height: isOpenedContents ? `${contentsHeight}px` : 0,
          transitionDuration: `${duration}s`,
          overflow: isOverflowVisible ? 'visible' : 'hidden',
        }}
        inert={!isOpenedContents}
        className="transition-[height]"
      >
        <div ref={contentsRef}>{children}</div>
      </div>
    </div>
  )
}
