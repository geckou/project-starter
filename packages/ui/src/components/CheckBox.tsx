'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { CheckBoxStyleForEachStatus } from '../types'
import { CheckIcon } from './icons/CheckIcon'
import { COLOR } from '../constants'

type Props = {
  name: string
  checked?: boolean
  onChange?: (newValue: boolean) => void
  isDisabled?: boolean
  cssStyle?: CheckBoxStyleForEachStatus
  isDisableAnimation?: boolean
  check?: ReactNode
}

export function CheckBox({
  name,
  checked,
  onChange,
  isDisabled,
  cssStyle,
  isDisableAnimation,
  check,
}: Props) {
  const isChecked = checked ?? false
  const baseStyle = isDisabled ? cssStyle?.disabled : cssStyle?.default

  const currentCssStyle = {
    textColor: isDisabled ? COLOR.darkGray : COLOR.blue,
    backgroundColor: isDisabled ? COLOR.lightGray : COLOR.white,
    border: {
      color: isDisabled ? COLOR.darkGray : COLOR.blue,
      size: '1px',
      radius: '.25rem',
    },
    ...baseStyle,
  }

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--border-color': currentCssStyle.border?.color,
    '--border-size': currentCssStyle.border?.size,
    '--radius-size': currentCssStyle.border?.radius,
    '--background-color': currentCssStyle.backgroundColor,
    '--duration': isDisableAnimation ? '0s' : '.3s',
  } as CSSProperties

  return (
    <>
      <style>
        {
          '@keyframes uiCheckPop{0%{scale:1}10%{scale:.8}50%{scale:1.1}100%{scale:1}}'
        }
      </style>
      <button
        type="button"
        style={style}
        aria-label={name}
        aria-pressed={isChecked}
        disabled={isDisabled}
        onClick={(event) => {
          event.stopPropagation()
          if (!isDisabled) onChange?.(!isChecked)
        }}
        className={`relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-(--radius-size) border-none shadow-[0_0_0_var(--border-size)_var(--border-color)_inset] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--border-color) has-[input:disabled]:pointer-events-none has-[input:disabled]:before:pointer-events-auto has-[input:disabled]:before:absolute has-[input:disabled]:before:inset-0 has-[input:disabled]:before:cursor-not-allowed has-[input:disabled]:before:content-[''] ${isChecked ? 'animate-[uiCheckPop_var(--duration)_ease-out] bg-(--border-color)' : 'bg-(--background-color)'}`}
      >
        <input
          type="checkbox"
          name={name}
          checked={isChecked}
          disabled={isDisabled}
          onChange={(event) => {
            if (!isDisabled) onChange?.(event.target.checked)
          }}
          className="hidden"
        />
        <div
          className={`flex h-4 w-4 items-center justify-center [&>*]:fill-current [&>*]:text-current ${isChecked ? 'text-(--background-color)' : 'text-(--border-color)'}`}
        >
          {check ?? <CheckIcon />}
        </div>
      </button>
    </>
  )
}
