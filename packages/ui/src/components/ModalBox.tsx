'use client'

import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

type Props = {
  isShown: boolean
  size?: 'small' | 'medium' | 'large'
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  // header が無い場合のダイアログのアクセシブル名
  ariaLabel?: string
}

const MAX_WIDTH_CLASSES = {
  small: 'max-w-[var(--mobile-lower-width,430px)]',
  medium: 'max-w-[var(--desktop-lower-width,1025px)]',
  large: 'max-w-[var(--contents-max-width,1440px)]',
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      fill="currentColor"
    >
      <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
    </svg>
  )
}

export function ModalBox({
  isShown,
  size = 'medium',
  onClose,
  header,
  footer,
  children,
  ariaLabel,
}: Props) {
  const headerId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isShown) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''

    return () => {
      document.body.style.overflow = ''
    }
  }, [isShown])

  useEffect(() => {
    if (isShown) dialogRef.current?.focus()
  }, [isShown])

  return (
    <div
      className={`fixed top-0 left-0 z-50 flex h-dvh w-dvw cursor-pointer items-center justify-center overflow-hidden bg-[#33333380] p-[var(--sp-larger,3rem)] backdrop-blur-sm transition-opacity duration-100 max-md:px-[var(--sp-large,1.5rem)] ${
        isShown
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isShown}
      inert={!isShown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? headerId : undefined}
        aria-label={header ? undefined : (ariaLabel ?? 'ダイアログ')}
        tabIndex={-1}
        className={`relative flex max-h-full w-full cursor-auto flex-col rounded-[var(--radius-small,0.1875rem)] bg-white drop-shadow-[0_0_6px_#33333355] ${MAX_WIDTH_CLASSES[size]}`}
      >
        {header && (
          <header
            id={headerId}
            className="border-b border-[#eee] px-[var(--sp-large,1.5rem)] py-[var(--sp-medium,0.75rem)] max-md:p-[var(--sp-medium,0.75rem)] [&>h2]:font-bold [&>h2]:text-[var(--fs-large,0.875rem)]"
          >
            {header}
          </header>
        )}
        <div className="flex-auto overflow-auto p-[var(--sp-large,1.5rem)] max-md:p-[var(--sp-medium,0.75rem)]">
          {children}
        </div>
        {footer && (
          <footer className="flex justify-center gap-[var(--sp-large,1.5rem)] border-t border-[#eee] px-[var(--sp-large,1.5rem)] py-[var(--sp-medium,0.75rem)] max-md:gap-[var(--sp-medium,0.75rem)] max-md:p-[var(--sp-medium,0.75rem)] max-md:[&>*]:flex-auto">
            {footer}
          </footer>
        )}
        <button
          type="button"
          aria-label="閉じる"
          className="absolute bottom-full left-full size-[var(--icon-medium,1.125rem)] cursor-pointer leading-none text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&>*]:size-full"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
