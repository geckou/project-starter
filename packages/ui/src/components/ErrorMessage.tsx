import type { CSSProperties } from 'react'
import { COLOR } from '../constants'

type Props = {
  errorMessages?: string[]
  cssStyle?: {
    textColor?: string
    backgroundColor?: string
  }
}

export function ErrorMessage({ errorMessages, cssStyle }: Props) {
  if (!errorMessages || !errorMessages.length) return null

  const style = {
    '--error-text-color': cssStyle?.textColor || COLOR.white,
    '--error-background-color': cssStyle?.backgroundColor || COLOR.red,
  } as CSSProperties

  return (
    <div
      className="absolute top-[calc(100%+0.25rem)] flex w-max flex-col gap-2 rounded-sm bg-(--error-background-color) px-3 py-2 text-sm leading-none text-(--error-text-color) shadow-[0_0_0.5rem_0.25rem_#33333322] before:absolute before:bottom-[calc(100%-1px)] before:left-[0.85rem] before:block before:h-[0.53rem] before:w-[0.85rem] before:bg-(--error-background-color) before:content-[''] before:[clip-path:polygon(50%_0%,100%_100%,0%_100%)]"
      style={style}
    >
      {errorMessages.map((message) => (
        <span key={message}>{message}</span>
      ))}
    </div>
  )
}
