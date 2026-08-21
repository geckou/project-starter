'use client'

import type { CSSProperties } from 'react'
import type {
  Option,
  RadioButtonStyleForEachStatus,
  SelectValue,
} from '../types'
import { useId } from 'react'
import { COLOR } from '../constants'

type Props = {
  value: SelectValue
  onChange?: (newValue: SelectValue) => void
  options: Option[]
  name?: string
  isDisabled?: boolean
  isRequired?: boolean
  cssStyle?: RadioButtonStyleForEachStatus
  isDisableAnimation?: boolean
}

export function RadioButtons({
  value,
  onChange,
  options,
  name,
  isDisabled,
  isRequired,
  cssStyle,
  isDisableAnimation,
}: Props) {
  const selectedValue = value ?? ''
  // 元実装（vue-ui）は option ごとに別の name を振っていたため、
  // ラジオグループとして機能しなかった（フォーム送信・キーボード操作）
  const generatedName = useId()
  const groupName = name ?? generatedName
  const baseStyle = isDisabled ? cssStyle?.disabled : cssStyle?.default

  const currentCssStyle = {
    textColor: isDisabled ? COLOR.darkGray : COLOR.black,
    backgroundColor: isDisabled ? COLOR.lightGray : COLOR.white,
    border: {
      color: isDisabled ? COLOR.darkGray : COLOR.blue,
      size: '1px',
    },
    ...(baseStyle ?? {}),
  }

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--border-color': currentCssStyle.border?.color,
    '--border-size': currentCssStyle.border?.size,
    '--background-color': currentCssStyle.backgroundColor,
    '--duration': isDisableAnimation ? '0s' : '.3s',
  } as CSSProperties

  return (
    <div className="flex flex-wrap items-center gap-4">
      <style>
        {
          '@keyframes uiRadioPop{0%{scale:1}10%{scale:.8}50%{scale:1.2}100%{scale:1}}'
        }
      </style>
      {options.map((option) => {
        const isChecked = option.value === selectedValue

        return (
          <label
            key={option.value}
            style={style}
            className={`relative grid cursor-pointer grid-cols-[auto_1fr] items-center gap-2 before:inline-block before:aspect-square before:w-4 before:rounded-full before:transition-all before:duration-(--duration) before:ease-linear before:content-[''] has-[input:disabled]:cursor-not-allowed has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--border-color) ${
              isChecked
                ? 'text-(--text-color) before:animate-[uiRadioPop_var(--duration)_ease-out] before:bg-(--border-color) before:shadow-[0_0_0_2px_var(--background-color)_inset,0_0_0_1px_var(--border-color)]'
                : 'text-(--border-color) before:bg-(--background-color) before:shadow-[0_0_0_1px_var(--border-color)_inset]'
            }`}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              disabled={isDisabled}
              required={isRequired}
              checked={isChecked}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            <span>{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}
