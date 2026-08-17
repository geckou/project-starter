import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function InputGroup({ children }: Props) {
  return (
    <div className="inline-flex gap-px max-md:flex-wrap [&>*:first-child:not(:only-child)]:rounded-l-[var(--radius-small,0.1875rem)] [&>*:last-child:not(:only-child)]:rounded-r-[var(--radius-small,0.1875rem)] [&>*]:flex-auto [&>*]:rounded-none [&>button]:flex-none">
      {children}
    </div>
  )
}
