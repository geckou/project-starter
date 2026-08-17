'use client'

import type { CSSProperties, MouseEvent } from 'react'
import { useEffect, useState } from 'react'
import { InputBox } from './InputBox'
import { KeyboardArrowDownIcon } from './icons/KeyboardArrowDownIcon'
import { COLOR } from '../constants'

type Birthday = {
  year: string
  month: string
  day: string
}

type Props = {
  name: string
  value?: string
  onChange?: (newValue: string) => void
  isRequired?: boolean
}

const EMPTY_BIRTHDAY: Birthday = { year: '', month: '', day: '' }

export function DateSelector({ name, value, onChange, isRequired }: Props) {
  const [birthday, setBirthday] = useState<Birthday>(EMPTY_BIRTHDAY)

  // 元実装（vue-ui）は value が空に戻されたときリセットされなかった
  useEffect(() => {
    if (value) {
      const [year, month, day] = value.split('-')
      setBirthday({ year: year ?? '', month: month ?? '', day: day ?? '' })
    } else {
      setBirthday(EMPTY_BIRTHDAY)
    }
  }, [value])

  const today = new Date()
  const maxYear = today.getFullYear() - 100
  const currentYear = today.getFullYear() - 14
  const yearsOptions = Array.from(
    { length: currentYear - maxYear + 1 },
    (_, i) => (maxYear + i).toString()
  ).map((year) => ({ label: year, value: year }))

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const month = (i + 1).toString()
    return { label: month, value: month.padStart(2, '0') }
  })

  // 元実装（vue-ui）は基準年固定でうるう年が考慮されず、年選択で2月の日数が変わらなかった
  const getDaysInMonth = (year: string, month: string) =>
    new Date(Number(year) || 2000, Number(month), 0).getDate()

  const daysInMonth = getDaysInMonth(birthday.year, birthday.month)
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => {
    const day = (i + 1).toString()
    return { label: day, value: day.padStart(2, '0') }
  })

  const emitBirthday = (next: Birthday) => {
    setBirthday(next)
    if (!next.year && !next.month && !next.day) onChange?.('')
    else if (!next.year || !next.month || !next.day) return
    else onChange?.(`${next.year}-${next.month}-${next.day}`)
  }

  const selectItem = (key: keyof Birthday, newValue: string) => {
    const next = { ...birthday, [key]: newValue }

    // 元実装（vue-ui）は月・年の変更で選択済みの日が範囲外のまま残った（例: 3/31 → 2月）
    if (key !== 'day' && next.day && next.month) {
      const maxDay = getDaysInMonth(next.year, next.month)
      if (Number(next.day) > maxDay) next.day = String(maxDay).padStart(2, '0')
    }

    emitBirthday(next)
  }

  const openDropdown = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const select = target.firstElementChild as HTMLSelectElement | null
    if (select) select.click()
  }

  const wrapperClass = 'relative w-max [&:has(select:focus)>svg]:rotate-180'
  const iconClass =
    'pointer-events-none absolute inset-y-0 right-[var(--sp-small,0.375rem)] m-auto size-[var(--icon-medium,1.125rem)] fill-(--icon-color)'
  const selectClass =
    'w-[calc(3ch+var(--sp-medium,0.75rem)*2+var(--icon-medium,1.125rem))]! p-[var(--sp-medium,0.75rem)]! pe-[calc(var(--sp-small,0.375rem)*2+var(--icon-medium,1.125rem))]! cursor-pointer'
  const wrapperStyle = { '--icon-color': COLOR.blue } as CSSProperties
  const deleteButtonStyle = { '--caution-color': COLOR.red } as CSSProperties

  return (
    <InputBox className="flex w-max items-center [&>*:not(:last-of-type)]:after:content-['/']">
      <div className={wrapperClass} style={wrapperStyle} onClick={openDropdown}>
        <select
          value={birthday.year}
          name={`${name}-year`}
          required={isRequired}
          onChange={(event) => selectItem('year', event.target.value)}
          className="w-[calc(5ch+var(--sp-medium,0.75rem)*2+var(--icon-medium,1.125rem))]! cursor-pointer p-[var(--sp-medium,0.75rem)]! pe-[calc(var(--sp-small,0.375rem)*2+var(--icon-medium,1.125rem))]!"
        >
          <option disabled value="">
            年
          </option>
          {yearsOptions.map((year) => (
            <option key={year.value} value={year.value}>
              {year.label}
            </option>
          ))}
        </select>
        <KeyboardArrowDownIcon className={iconClass} />
      </div>
      <div className={wrapperClass} style={wrapperStyle} onClick={openDropdown}>
        <select
          value={birthday.month}
          name={`${name}-month`}
          required={isRequired}
          onChange={(event) => selectItem('month', event.target.value)}
          className={selectClass}
        >
          <option disabled value="">
            月
          </option>
          {monthOptions.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
        <KeyboardArrowDownIcon className={iconClass} />
      </div>
      <div className={wrapperClass} style={wrapperStyle} onClick={openDropdown}>
        <select
          value={birthday.day}
          name={`${name}-day`}
          required={isRequired}
          onChange={(event) => selectItem('day', event.target.value)}
          className={selectClass}
        >
          <option disabled value="">
            日
          </option>
          {dayOptions.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
        <KeyboardArrowDownIcon className={iconClass} />
      </div>
      <button
        type="button"
        style={deleteButtonStyle}
        className="mx-[var(--sp-medium,0.75rem)] inline-flex cursor-pointer items-center gap-[var(--sp-min,0.1875rem)] text-[length:var(--fs-small,0.6875rem)] text-(--caution-color)"
        onClick={() => emitBirthday(EMPTY_BIRTHDAY)}
      >
        削除
      </button>
    </InputBox>
  )
}
