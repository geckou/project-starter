'use client'

import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLOR } from '../constants'

export type PopupBoxHandle = {
  showPopup: () => void
}

type Props = {
  position?: {
    x: 'left' | 'right' | 'center'
    y: 'top' | 'bottom' | 'center'
  }
  ref?: Ref<PopupBoxHandle>
  children: ReactNode
}

const X_CLASSES = {
  left: 'left-[max(calc((100vw-64rem)/2),1rem)]',
  right: 'right-[max(calc((100vw-64rem)/2),1rem)]',
  center: 'inset-0 m-auto',
}

const Y_CLASSES = {
  top: 'top-14',
  bottom: 'bottom-4',
  center: 'inset-0 m-auto',
}

export function PopupBox({
  position = { x: 'right', y: 'top' },
  ref,
  children,
}: Props) {
  const [isShown, setIsShown] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsMounted(true)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    showPopup: () => {
      setIsShown(true)

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsShown(false), 3000)
    },
  }))

  if (!isMounted) return null

  return createPortal(
    <div
      style={{ borderColor: COLOR.blue }}
      className={`pointer-events-none fixed z-50 h-max w-max max-w-40 rounded-[var(--radius-small,0.1875rem)] border bg-white p-[var(--sp-medium,0.75rem)] transition-[transform,opacity] duration-300 ${X_CLASSES[position.x]} ${Y_CLASSES[position.y]} ${isShown ? 'opacity-100' : 'opacity-0'}`}
    >
      {children}
    </div>,
    document.body
  )
}
