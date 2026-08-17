'use client'

import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import type { ButtonStyleForEachStatus } from '../types'
import { LoadingSpinner } from './LoadingSpinner'
import { COLOR } from '../constants'

type Props = {
  cssStyle?: ButtonStyleForEachStatus
  duration?: number
  isLoading?: boolean
  isDisabled?: boolean
  buttonType?: 'button' | 'submit' | 'reset'
  onClick?: MouseEventHandler<HTMLButtonElement>
  loading?: ReactNode
  children?: ReactNode
}

export function BasicButton({
  cssStyle,
  duration = 0.3,
  isLoading,
  isDisabled,
  buttonType = 'button',
  onClick,
  loading,
  children,
}: Props) {
  const baseStyle = isDisabled ? cssStyle?.disabled : cssStyle?.default

  const currentCssStyle = {
    textColor: COLOR.white,
    backgroundColor: isDisabled ? COLOR.darkGray : COLOR.blue,
    backgroundImage: 'none',
    border: {
      color: isDisabled ? COLOR.darkGray : COLOR.blue,
      size: '1px',
      radius: '.25rem',
    },
    boxShadow: '0 0 0 0 transparent',
    ...baseStyle,
  }

  const hoverStyle = cssStyle?.hover || {}

  const style = {
    '--text-color': currentCssStyle.textColor,
    '--background-color': currentCssStyle.backgroundColor,
    '--background-image': currentCssStyle.backgroundImage,
    '--radius-size': currentCssStyle.border?.radius,
    '--button-shadow': `0 0 0 ${currentCssStyle.border?.size} ${currentCssStyle.border?.color} inset, ${currentCssStyle.boxShadow}`,
    '--hover-text-color': hoverStyle.textColor || currentCssStyle.textColor,
    '--hover-background-color':
      hoverStyle.backgroundColor ||
      (currentCssStyle.backgroundColor &&
        `${currentCssStyle.backgroundColor}cc`),
    '--hover-background-image':
      hoverStyle.backgroundImage || currentCssStyle.backgroundImage,
    '--hover-radius-size':
      hoverStyle.border?.radius || currentCssStyle.border?.radius,
    '--hover-button-shadow': `0 0 0 ${hoverStyle.border?.size || currentCssStyle.border?.size} ${hoverStyle.border?.color || currentCssStyle.border?.color} inset, ${hoverStyle.boxShadow || currentCssStyle.boxShadow}`,
    '--duration': `${duration}s`,
  } as CSSProperties

  return (
    <button
      type={buttonType}
      disabled={isDisabled || isLoading}
      onClick={onClick}
      style={style}
      className="relative inline-flex w-max cursor-pointer items-center justify-center rounded-(--radius-size) border-none bg-(--background-color) px-8 py-4 leading-none text-(--text-color) shadow-(--button-shadow) transition-all duration-(--duration) enabled:hover:rounded-(--hover-radius-size) enabled:hover:bg-(--hover-background-color) enabled:hover:text-(--hover-text-color) enabled:hover:shadow-(--hover-button-shadow) disabled:pointer-events-none disabled:before:pointer-events-auto disabled:before:absolute disabled:before:inset-0 disabled:before:cursor-not-allowed disabled:before:content-['']"
    >
      {isLoading && (
        <span className="absolute inset-0 m-auto flex max-h-[calc(100%-1.5rem)] items-center justify-center fill-current text-current [&_*]:max-h-full [&_*]:fill-current">
          {loading ?? <LoadingSpinner />}
        </span>
      )}
      <span className={isLoading ? 'invisible' : undefined}>{children}</span>
    </button>
  )
}
