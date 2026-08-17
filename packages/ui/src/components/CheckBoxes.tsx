'use client'

import type { Option, CheckBoxStyleForEachStatus } from '../types'
import { useEffect, useRef, useState } from 'react'
import { LabeledCheckbox } from './LabeledCheckbox'
import { ErrorMessage } from './ErrorMessage'
import { COLOR } from '../constants'

type Props = {
  name: string
  options: Option[]
  value?: string[]
  onChange?: (newValue: string[]) => void
  isDisabled?: boolean
  isRequired?: boolean
  cssStyle?: CheckBoxStyleForEachStatus
}

export function CheckBoxes({
  name,
  options,
  value,
  onChange,
  isDisabled,
  isRequired,
  cssStyle,
}: Props) {
  const [checkedValues, setCheckedValues] = useState<string[]>(value ?? [])
  const [errorMessage, setErrorMessage] = useState('')

  const validateInput = (newValues: string[]) =>
    setErrorMessage(isRequired && newValues.length === 0 ? '必須項目です' : '')

  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (value?.length) validateInput(value)
      return
    }

    if (value) setCheckedValues(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 元実装（vue-ui）同様、外部からの値変更時のみ同期する
  }, [value])

  const toggleValue = (optionValue: string, checked: boolean) => {
    const newValues = options
      .map((option) => String(option.value))
      .filter((candidate) =>
        candidate === optionValue ? checked : checkedValues.includes(candidate)
      )

    setCheckedValues(newValues)
    validateInput(newValues)
    onChange?.(newValues)
  }

  const errorColor = {
    ...(cssStyle?.error ?? {}),
    textColor: COLOR.white,
    backgroundColor: COLOR.red,
    border: {
      color: COLOR.red,
      size: '1px',
      radius: '.25rem',
    },
  }

  return (
    <div className="relative flex flex-wrap gap-x-6 gap-y-4">
      {options.map((option) => (
        <LabeledCheckbox
          key={option.value}
          name={name}
          label={option.label}
          checked={checkedValues.includes(String(option.value))}
          onChange={(checked) => toggleValue(String(option.value), checked)}
          isDisabled={isDisabled}
          cssStyle={cssStyle}
        />
      ))}
      <ErrorMessage
        errorMessages={errorMessage ? [errorMessage] : []}
        cssStyle={{
          textColor: errorColor.textColor,
          backgroundColor: errorColor.backgroundColor,
        }}
      />
    </div>
  )
}
