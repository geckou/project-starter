'use client'

import type { CSSProperties, ReactNode } from 'react'
import type {
  StateVariation,
  InputBoxStyle,
  InputBoxStyleForEachStatus,
} from '../types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { COLOR } from '../constants'

const {
  black: TEXT_COLOR,
  darkGray: PLACEHOLDER_COLOR,
  gray: BORDER_COLOR,
  lightGray: DISABLED_COLOR,
  red: CAUTION_COLOR,
  green: VALID_COLOR,
  blue: FOCUS_COLOR,
} = COLOR

const BORDER = {
  color: BORDER_COLOR,
  size: '1px',
  radius: '.25rem',
}

const DEFAULT_STYLES: InputBoxStyleForEachStatus = {
  default: {
    textColor: TEXT_COLOR,
    placeholderColor: PLACEHOLDER_COLOR,
    backgroundColor: 'inherit',
    border: BORDER,
    boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
  },
  disabled: {
    textColor: PLACEHOLDER_COLOR,
    placeholderColor: PLACEHOLDER_COLOR,
    backgroundColor: DISABLED_COLOR,
    border: BORDER,
    boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
  },
  focus: {
    textColor: TEXT_COLOR,
    placeholderColor: PLACEHOLDER_COLOR,
    backgroundColor: 'inherit',
    border: { ...BORDER, color: FOCUS_COLOR },
    boxShadow: `0 0 .1rem .1rem ${FOCUS_COLOR}55`,
  },
  error: {
    textColor: TEXT_COLOR,
    placeholderColor: PLACEHOLDER_COLOR,
    backgroundColor: `${CAUTION_COLOR}11`,
    border: { ...BORDER, color: CAUTION_COLOR },
    boxShadow: `0 0 .1rem .1rem ${CAUTION_COLOR}55`,
  },
  valid: {
    textColor: TEXT_COLOR,
    placeholderColor: PLACEHOLDER_COLOR,
    backgroundColor: `${VALID_COLOR}11`,
    border: { ...BORDER, color: VALID_COLOR },
    boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
  },
}

type Props = {
  cssStyle?: InputBoxStyleForEachStatus
  isErrored?: boolean
  isDisabled?: boolean
  className?: string
  children: ReactNode
}

export function InputBox({
  cssStyle,
  isErrored,
  isDisabled,
  className,
  children,
}: Props) {
  const inputBoxRef = useRef<HTMLDivElement>(null)
  const [currentState, setCurrentState] = useState<StateVariation>('default')

  const isErroredRef = useRef(isErrored)
  isErroredRef.current = isErrored

  const updateState = useCallback(() => {
    const el = inputBoxRef.current?.querySelector('input, textarea, select')

    if (!el) return setCurrentState('default')
    if (el.matches(':disabled')) return setCurrentState('disabled')
    if (el.matches(':focus')) return setCurrentState('focus')

    if (el.tagName.toLowerCase() === 'select') {
      const select = el as HTMLSelectElement
      return setCurrentState(
        select.required && !select.value ? 'error' : 'valid'
      )
    }

    if (isErroredRef.current || el.matches(':invalid'))
      return setCurrentState('error')

    if (
      el.matches(':valid') &&
      el.matches(':not(:placeholder-shown)') &&
      el.matches(':not(:invalid)')
    ) {
      return setCurrentState('valid')
    }

    setCurrentState('default')
  }, [])

  useEffect(() => {
    const inputBox = inputBoxRef.current
    if (!inputBox) return

    const observer = new MutationObserver(updateState)
    observer.observe(inputBox, { childList: true, subtree: true })
    inputBox.addEventListener('focusin', updateState, true)
    inputBox.addEventListener('blur', updateState, true)

    return () => {
      observer.disconnect()
      inputBox.removeEventListener('focusin', updateState, true)
      inputBox.removeEventListener('blur', updateState, true)
    }
  }, [updateState])

  // 元実装（vue-ui）はマウント時に状態判定せず、初回の focus / blur まで default を維持する
  const isFirstRender = useRef(true)
  const prevDisabled = useRef(isDisabled)

  useEffect(() => {
    const isDisabledChanged = prevDisabled.current !== isDisabled
    prevDisabled.current = isDisabled

    if (isFirstRender.current) {
      isFirstRender.current = false
      if (isDisabled) setCurrentState('disabled')
      return
    }

    if (isDisabledChanged)
      return setCurrentState(isDisabled ? 'disabled' : 'default')

    updateState()
  }, [isDisabled, isErrored, updateState])

  const cssStylesUsed = { ...DEFAULT_STYLES, ...cssStyle }
  const currentCssStyle: InputBoxStyle =
    cssStylesUsed[currentState] ?? cssStylesUsed.default

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--placeholder-color': currentCssStyle.placeholderColor,
    '--background-color': currentCssStyle.backgroundColor,
    '--radius-size': currentCssStyle.border?.radius || '.25rem',
    '--input-box-shadow': `0 0 0 ${currentCssStyle.border?.size || '1px'} ${currentCssStyle.border?.color} inset, ${currentCssStyle.boxShadow || '0 0 0 0 rgba(0, 0, 0, 0)'}`,
  } as CSSProperties

  return (
    <div
      ref={inputBoxRef}
      className={`rounded-(--radius-size) bg-(--background-color) text-(--text-color) shadow-(--input-box-shadow) [&_*::placeholder]:text-(--placeholder-color) relative inline-flex max-w-full has-[:disabled]:pointer-events-none has-[:disabled]:before:pointer-events-auto has-[:disabled]:before:absolute has-[:disabled]:before:inset-0 has-[:disabled]:before:cursor-not-allowed has-[:disabled]:before:content-[''] [&_*::placeholder]:font-normal [&_*:focus]:outline-none [&_:is(input,textarea,select)]:w-full [&_:is(input,textarea,select)]:appearance-none [&_:is(input,textarea,select)]:border-none [&_:is(input,textarea,select)]:bg-transparent [&_:is(input,textarea,select)]:p-4 [&_:is(input,textarea,select)]:outline-none ${className || ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
