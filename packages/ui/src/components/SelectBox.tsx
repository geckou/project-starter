'use client'

import type { ReactNode } from 'react'
import type { Option, InputBoxStyleForEachStatus, SelectValue } from '../types'
import { Fragment, useEffect, useRef, useState } from 'react'
import { InputBox } from './InputBox'
import { ErrorMessage } from './ErrorMessage'
import { KeyboardArrowDownIcon } from './icons/KeyboardArrowDownIcon'

type Props = {
  options: Array<Option | Record<string, Option[]>>
  name: string
  value?: SelectValue
  onChange?: (newValue: SelectValue) => void
  cssStyle?: InputBoxStyleForEachStatus
  placeholder?: string
  canOmitSelect?: boolean
  isDisabled?: boolean
  isRequired?: boolean
  arrow?: ReactNode
}

function isOption(obj: unknown): obj is Option {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'label' in obj &&
    typeof obj.label === 'string' &&
    'value' in obj
  )
}

export function SelectBox({
  options,
  name,
  value,
  onChange,
  cssStyle,
  placeholder = '選択してください',
  canOmitSelect,
  isDisabled,
  isRequired,
  arrow,
}: Props) {
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const selectedValue = value ?? ''

  const validateValue = () => {
    const messages: string[] = []
    // 数値 0 も正当な選択値として扱うため、truthy 判定ではなく空文字と比較する
    if (selectedValue === '' && isRequired) messages.push('必須項目です')
    setErrorMessages(messages)
  }

  // 元実装（vue-ui）の watch(immediate: !!modelValue) と等価:
  // 初期値ありならマウント時にも検証、以後は値が変化したときのみ検証
  const initialValue = useRef(selectedValue)
  const hasChanged = useRef(false)

  useEffect(() => {
    if (!hasChanged.current) {
      if (selectedValue === initialValue.current) {
        if (selectedValue !== '') validateValue()
        return
      }
      hasChanged.current = true
    }

    validateValue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 元実装（vue-ui）同様、値の変化時のみ検証する
  }, [selectedValue])

  const flattenedOptions = options.flatMap((option) =>
    isOption(option) ? [option] : Object.values(option).flat()
  )

  const handleChange = (rawValue: string) => {
    const matched = flattenedOptions.find(
      (option) => String(option.value) === rawValue
    )
    onChange?.(matched ? matched.value : rawValue)
  }

  return (
    <InputBox
      cssStyle={cssStyle}
      className="inline-flex [&>select]:flex-auto [&>select]:cursor-pointer [&>select]:pe-8"
      isDisabled={isDisabled}
    >
      <select
        name={name}
        value={selectedValue}
        disabled={isDisabled}
        required={isRequired}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => validateValue()}
      >
        {canOmitSelect ? (
          <option value="">{placeholder || '選択しない'}</option>
        ) : (
          <option disabled value="">
            {placeholder || '選択してください'}
          </option>
        )}
        {['0', 'NA'].includes(selectedValue.toString()) && isDisabled && (
          <option disabled value={selectedValue}>
            {placeholder || '選択してください'}
          </option>
        )}
        {options.map((option) =>
          isOption(option) ? (
            <option
              key={option.value}
              value={option.value}
              disabled={option.isDisabled}
            >
              {option.label}
            </option>
          ) : (
            <Fragment key={Object.keys(option)[0]}>
              {Object.entries(option).map(([key, groupedOptions]) => (
                <optgroup key={key} label={key}>
                  {groupedOptions.map((groupedOption) => (
                    <option
                      key={groupedOption.value}
                      value={groupedOption.value}
                      disabled={groupedOption.isDisabled}
                    >
                      {groupedOption.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <hr />
            </Fragment>
          )
        )}
      </select>
      <div className="pointer-events-none absolute inset-y-0 end-2 flex items-center [&>*]:h-4 [&>*]:fill-current [&>*]:text-current">
        {arrow ?? <KeyboardArrowDownIcon />}
      </div>
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
