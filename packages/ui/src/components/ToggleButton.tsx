'use client'

import type { CSSProperties } from 'react'
import type { BaseStyle, StyleForEachStatus } from '../types'
import { COLOR } from '../constants'

type ToggleStyle = {
  on: BaseStyle
  off: BaseStyle
}

type Props = {
  name: string
  label?: Record<'on' | 'off', string>
  checked?: boolean
  onChange?: (newValue: boolean) => void
  isDisabled?: boolean
  cssStyle?: StyleForEachStatus<ToggleStyle>
}

export function ToggleButton({
  name,
  label = { on: 'ON', off: 'OFF' },
  checked,
  onChange,
  isDisabled,
  cssStyle,
}: Props) {
  const isChecked = checked ?? false
  const maxTextLength = Math.max(label.on.length, label.off.length)
  const baseStyle = isDisabled ? cssStyle?.disabled : cssStyle?.default

  const currentCssStyle = {
    on: {
      textColor: isDisabled ? COLOR.lightGray : COLOR.white,
      backgroundColor: isDisabled ? COLOR.gray : COLOR.blue,
      border: {
        color: isDisabled ? COLOR.gray : COLOR.blue,
        size: '1px',
        radius: '.25rem',
      },
      boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
      ...baseStyle?.on,
    },
    off: {
      textColor: isDisabled ? COLOR.gray : COLOR.white,
      backgroundColor: isDisabled ? COLOR.lightGray : COLOR.darkGray,
      border: {
        color: isDisabled ? COLOR.gray : COLOR.darkGray,
        size: '1px',
        radius: '.25rem',
      },
      boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
      ...baseStyle?.off,
    },
  }[isChecked ? 'on' : 'off']

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--border-color': currentCssStyle.border?.color,
    '--border-size': currentCssStyle.border?.size,
    '--radius-size': currentCssStyle.border?.radius,
    '--background-color': currentCssStyle.backgroundColor,
    '--box-shadow': currentCssStyle.boxShadow,
    '--inline-size': `${maxTextLength * 2}ch`,
    '--handle-size': '1.5rem',
    '--padding-size': 'calc(var(--border-size) + 2px)',
    '--duration': '.15s',
  } as CSSProperties

  return (
    <button
      type="button"
      style={style}
      disabled={isDisabled}
      aria-pressed={isChecked}
      aria-label={name}
      onClick={(event) => {
        event.stopPropagation()
        if (!isDisabled) onChange?.(!isChecked)
      }}
      className="relative inline-block w-[calc(var(--inline-size)+var(--handle-size)+(var(--padding-size)*2))] cursor-pointer rounded-(--radius-size) border-none bg-(--background-color) p-(--padding-size) shadow-[0_0_0_var(--border-size)_var(--border-color)_inset,var(--box-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--border-color)"
    >
      <input
        type="checkbox"
        name={name}
        checked={isChecked}
        disabled={isDisabled}
        readOnly
        className="hidden"
      />
      <div
        data-on={label.on}
        data-off={label.off}
        className={`absolute top-0 left-0 h-full w-full text-(--text-color) uppercase before:absolute before:right-0 before:m-auto before:inline-flex before:h-full before:w-[calc(100%-var(--handle-size)-var(--padding-size))] before:items-center before:justify-center before:leading-none before:transition-opacity before:duration-(--duration) before:ease-out before:content-[attr(data-off)] after:absolute after:left-0 after:m-auto after:inline-flex after:h-full after:w-[calc(100%-var(--handle-size)-var(--padding-size))] after:items-center after:justify-center after:leading-none after:transition-opacity after:duration-(--duration) after:ease-out after:content-[attr(data-on)] ${isChecked ? 'before:opacity-0 after:opacity-100' : 'before:opacity-100 after:opacity-0'}`}
      />
      <div
        className={`relative m-0 aspect-square w-(--handle-size) rounded-[calc(var(--radius-size)-(var(--padding-size)/2))] bg-(--text-color) shadow-(--box-shadow) transition-[left] duration-(--duration) ease-out ${isChecked ? 'left-[calc(100%-var(--handle-size))]' : 'left-0'}`}
      />
    </button>
  )
}
