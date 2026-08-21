'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { CheckBoxStyleForEachStatus } from '../types'
import { CheckIcon } from './icons/CheckIcon'

type Props = {
  name: string
  checked?: boolean
  onChange?: (newValue: boolean) => void
  isDisabled?: boolean
  cssStyle?: CheckBoxStyleForEachStatus
  isDisableAnimation?: boolean
  check?: ReactNode
}

export function CheckButton({
  name,
  checked,
  onChange,
  isDisabled,
  cssStyle = { default: {} },
  isDisableAnimation,
  check,
}: Props) {
  const isChecked = checked ?? false
  const currentCssStyle = isDisabled ? cssStyle.disabled : cssStyle.default

  const style = {
    '--border-color': currentCssStyle?.border?.color || 'blue',
    '--border-size': currentCssStyle?.border?.size || '1px',
    '--radius-size': currentCssStyle?.border?.radius || '0.25rem',
    '--background-color': currentCssStyle?.backgroundColor || '#fff',
    '--duration': isDisableAnimation ? '0s' : '.3s',
  } as CSSProperties

  return (
    <>
      <style>
        {
          '@keyframes uiCheckPop{0%{scale:1}10%{scale:.8}50%{scale:1.1}100%{scale:1}}'
        }
      </style>
      <label
        style={style}
        className={`relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-(--radius-size) shadow-[0_0_0_var(--border-size)_var(--border-color)_inset] has-[input:disabled]:pointer-events-none has-[input:disabled]:before:pointer-events-auto has-[input:disabled]:before:absolute has-[input:disabled]:before:inset-0 has-[input:disabled]:before:cursor-not-allowed has-[input:disabled]:before:content-[''] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--border-color) ${isChecked ? 'animate-[uiCheckPop_var(--duration)_ease-out] bg-(--border-color)' : 'bg-(--background-color)'}`}
      >
        <input
          type="checkbox"
          name={name}
          checked={isChecked}
          disabled={isDisabled}
          onChange={(event) => {
            if (!isDisabled) onChange?.(event.target.checked)
          }}
          className="sr-only"
        />
        <div
          className={`flex h-4 w-4 items-center justify-center [&>*]:fill-current [&>*]:text-current ${isChecked ? 'text-(--background-color)' : 'text-(--border-color)'}`}
        >
          {check ?? <CheckIcon />}
        </div>
      </label>
    </>
  )
}
