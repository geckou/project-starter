import type { ReactNode } from 'react'

type Props = {
  isDisabled?: boolean
  label?: ReactNode
  children: ReactNode
}

export function LabeledFieldset({ isDisabled, label, children }: Props) {
  return (
    <div className="grid gap-2">
      <fieldset className="contents" disabled={isDisabled}>
        {label && <legend className="flex items-center">{label}</legend>}
        <div className="[&>*]:w-full">{children}</div>
      </fieldset>
    </div>
  )
}
