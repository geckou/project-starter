'use client'

import type { InputBoxStyleForEachStatus, Validates } from '../types'
import { useEffect, useRef, useState } from 'react'
import { InputBox } from './InputBox'
import { ErrorMessage } from './ErrorMessage'

type InputValue = string | null

type Props = {
  name: string
  value?: InputValue
  onChange?: (newValue: InputValue) => void
  cssStyle?: InputBoxStyleForEachStatus
  placeholder?: string
  isDisabled?: boolean
  isRequired?: boolean
  rows?: number
  maxLength?: number
  autocomplete?: string
  validates?: Validates
  autoAdjustHeight?: boolean
}

export function TextArea({
  name,
  value,
  onChange,
  cssStyle,
  placeholder = '入力してください',
  isDisabled,
  isRequired,
  rows,
  maxLength = 100,
  autocomplete = 'off',
  validates = [],
  autoAdjustHeight,
}: Props) {
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputValue = value ?? ''

  const validateValue = () => {
    const messages: string[] = []

    // 空判定は空文字との比較で行う（TextBox と統一）
    const isEmpty = inputValue === ''

    if (isEmpty && isRequired) messages.push('必須項目です')
    else if (!isEmpty && validates.length) {
      validates.forEach((validate) => {
        // g / y フラグ付き RegExp は .test() で lastIndex が変異し判定が不安定になるため、
        // 呼び出し側のオブジェクトを変異させないよう毎回新しいインスタンスで判定する
        const { source, flags } = validate.regex
        const regex = new RegExp(source, flags.replace(/[gy]/g, ''))

        if (!regex.test(String(inputValue))) messages.push(validate.message)
      })
    }

    setErrorMessages(messages)
  }

  // 元実装（vue-ui）の watch(immediate: !!modelValue) と等価:
  // 初期値ありならマウント時にも検証、以後は値が変化したときのみ検証
  const initialValue = useRef(inputValue)
  const hasChanged = useRef(false)

  useEffect(() => {
    if (autoAdjustHeight && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `calc(${textareaRef.current.scrollHeight}px - 2rem)`
    }

    if (!hasChanged.current) {
      if (inputValue === initialValue.current) {
        if (inputValue) validateValue()
        return
      }
      hasChanged.current = true
    }

    validateValue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 元実装（vue-ui）同様、値の変化時のみ検証・高さ調整する
  }, [inputValue])

  return (
    <InputBox
      cssStyle={cssStyle}
      className="min-h-[4em]"
      isErrored={!!errorMessages.length}
      isDisabled={isDisabled}
    >
      <textarea
        ref={textareaRef}
        name={name}
        value={inputValue}
        required={isRequired}
        placeholder={placeholder}
        disabled={isDisabled}
        autoComplete={autocomplete}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={errorMessages.length ? 'true' : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={() => validateValue()}
      />
      <ErrorMessage
        errorMessages={errorMessages}
        cssStyle={{
          textColor: cssStyle?.error?.backgroundColor,
          backgroundColor: cssStyle?.error?.textColor,
        }}
      />
    </InputBox>
  )
}
