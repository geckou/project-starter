'use client'

import type { CSSProperties } from 'react'
import type { CheckBoxStyleForEachStatus } from '../types'
import { CheckBox } from './CheckBox'
import { COLOR } from '../constants'

type Props = {
  name: string
  label: string
  checked?: boolean
  onChange?: (newValue: boolean) => void
  isDisabled?: boolean
  cssStyle?: CheckBoxStyleForEachStatus
  isDisableAnimation?: boolean
}

export function LabeledCheckbox({
  name,
  label,
  checked,
  onChange,
  isDisabled,
  cssStyle,
  isDisableAnimation,
}: Props) {
  const isChecked = checked ?? false
  const baseStyle = isDisabled ? cssStyle?.disabled : cssStyle?.default

  const currentCssStyle = {
    textColor: isDisabled ? COLOR.darkGray : COLOR.black,
    backgroundColor: isDisabled ? COLOR.darkGray : COLOR.blue,
    ...(baseStyle ?? {}),
  }

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--checked-color': currentCssStyle.backgroundColor,
  } as CSSProperties

  return (
    <label className="inline-flex cursor-pointer items-center gap-[.5em] has-[input:disabled]:cursor-auto">
      <span className="pointer-events-none">
        <CheckBox
          name={name}
          checked={isChecked}
          onChange={onChange}
          isDisabled={isDisabled}
          cssStyle={cssStyle}
          isDisableAnimation={isDisableAnimation}
        />
      </span>
      <span
        style={style}
        className={isChecked ? 'text-(--text-color)' : 'text-(--checked-color)'}
      >
        {label}
      </span>
    </label>
  )
}
