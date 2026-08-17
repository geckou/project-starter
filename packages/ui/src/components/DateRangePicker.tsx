'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { COLOR } from '../constants'

type DateRange = {
  startDate: string
  endDate: string
}

type Props = {
  isDisabled?: boolean
  onChange?: (newValue: DateRange) => void
}

export function DateRangePicker({ isDisabled, onChange }: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const handleStartChange = (newValue: string) => {
    setStartDate(newValue)
    onChange?.({ startDate: newValue, endDate })
  }

  const handleEndChange = (newValue: string) => {
    setEndDate(newValue)
    onChange?.({ startDate, endDate: newValue })
  }

  const style = {
    '--range-background-color': COLOR.white,
    '--range-border-color': COLOR.gray,
  } as CSSProperties

  return (
    <div
      style={style}
      className="flex bg-(--range-background-color) [&>*]:flex-auto [&>*]:rounded-none! [&>*:first-child]:rounded-s-[calc(var(--bv,0.375rem)/2)]! [&>*:last-child]:rounded-e-[calc(var(--bv,0.375rem)/2)]! [&>*:not(:last-child)]:border-e [&>*:not(:last-child)]:border-(--range-border-color)"
    >
      <DatePicker
        value={startDate}
        name="startDate"
        isDisabled={isDisabled}
        onChange={handleStartChange}
      />
      <div className="flex flex-none! items-center px-[var(--bv,0.375rem)]">
        〜
      </div>
      <DatePicker
        value={endDate}
        name="endDate"
        isDisabled={isDisabled}
        onChange={handleEndChange}
      />
    </div>
  )
}
