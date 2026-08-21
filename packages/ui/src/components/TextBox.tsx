'use client'

import type { ReactNode } from 'react'
import type { InputBoxStyleForEachStatus, Validates } from '../types'
import { useEffect, useRef, useState } from 'react'
import { InputBox } from './InputBox'
import { ErrorMessage } from './ErrorMessage'

type InputValue = string | number

type Props = {
  name: string
  value?: InputValue
  onChange?: (newValue: InputValue) => void
  cssStyle?: InputBoxStyleForEachStatus
  inputType?: string
  placeholder?: string
  isDisabled?: boolean
  isRequired?: boolean
  maxLength?: number
  autocomplete?: string
  validates?: Validates
  before?: ReactNode
  after?: ReactNode
}

function convertFullWidthToHalfWidth(str: string): string {
  const fullWidthRegEx = /[Ａ-Ｚａ-ｚ０-９]/g
  return str.replace(fullWidthRegEx, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0)
  )
}

export function TextBox({
  name,
  value,
  onChange,
  cssStyle,
  inputType = 'text',
  placeholder = '入力してください',
  isDisabled,
  isRequired,
  maxLength = 30,
  autocomplete = 'off',
  validates = [],
  before,
  after,
}: Props) {
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const inputValue = value ?? ''

  const validateValue = () => {
    const messages: string[] = []
    // 数値 0 も正当な入力として扱うため、truthy 判定ではなく空文字と比較する
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
    if (!hasChanged.current) {
      if (inputValue === initialValue.current) {
        if (inputValue !== '') validateValue()
        return
      }
      hasChanged.current = true
    }

    validateValue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 元実装（vue-ui）同様、値の変化時のみ検証する
  }, [inputValue])

  const isComposing = useRef(false)

  return (
    <InputBox
      cssStyle={cssStyle}
      className="inline-flex [&>input]:flex-auto"
      isErrored={!!errorMessages.length}
      isDisabled={isDisabled}
    >
      {before}
      <input
        type={inputType}
        name={name}
        value={inputValue}
        required={isRequired}
        placeholder={placeholder}
        disabled={isDisabled}
        autoComplete={autocomplete}
        maxLength={maxLength}
        aria-invalid={errorMessages.length ? 'true' : undefined}
        onChange={(event) => {
          // IME 変換中に全角→半角変換すると未確定文字列が壊れるため、確定後に変換する
          const rawValue = event.target.value
          onChange?.(
            isComposing.current
              ? rawValue
              : convertFullWidthToHalfWidth(rawValue)
          )
        }}
        onCompositionStart={() => {
          isComposing.current = true
        }}
        onCompositionEnd={(event) => {
          isComposing.current = false
          onChange?.(convertFullWidthToHalfWidth(event.currentTarget.value))
        }}
        onBlur={() => validateValue()}
      />
      {after}
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
