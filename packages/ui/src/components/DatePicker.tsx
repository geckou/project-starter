'use client'

import type { CSSProperties } from 'react'
import type { InputBoxStyleForEachStatus } from '../types'
import { useEffect, useRef, useState } from 'react'
import { InputBox } from './InputBox'
import { ErrorMessage } from './ErrorMessage'
import { CalendarIcon } from './icons/CalendarIcon'
import { COLOR } from '../constants'

type DateObject = {
  year: string
  month: string
  day: string
}

type Props = {
  name: string
  value?: string
  onChange?: (newValue: string) => void
  cssStyle?: InputBoxStyleForEachStatus
  isDisabled?: boolean
  isRequired?: boolean
  minDate?: string
  maxDate?: string
  size?: 'small' | 'medium'
  type?: 'date' | 'month'
}

function toIsoDate(value: string, type: 'date' | 'month'): string {
  const date = new Date(value)
  // 元実装（vue-ui）は不正な日付文字列で toISOString() が throw し、
  // type="month" でも YYYY-MM-DD を返すため input[type=month] が空表示になっていた
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, type === 'month' ? 7 : 10)
}

function splitDate(value: string): DateObject {
  const [year, month, day] = value.split('-')
  return { year: year ?? '', month: month ?? '', day: day ?? '' }
}

export function DatePicker({
  name,
  value,
  onChange,
  cssStyle,
  isDisabled,
  isRequired,
  minDate = '',
  maxDate = '',
  size = 'medium',
  type = 'date',
}: Props) {
  const [dateValue, setDateValue] = useState(() =>
    value ? toIsoDate(value, type) : ''
  )
  const [dateObject, setDateObject] = useState<DateObject>(() =>
    value ? splitDate(toIsoDate(value, type)) : { year: '', month: '', day: '' }
  )
  const [errorMessage, setErrorMessage] = useState('')

  // 元実装（vue-ui）はマウント時にしか value を読まず、親からの更新に追従しなかった。
  // prop が実際に変わったときだけ同期する（内部編集を上書きしないため）
  const lastValueProp = useRef(value)

  useEffect(() => {
    if (lastValueProp.current === value) return
    lastValueProp.current = value

    const normalized = value ? toIsoDate(value, type) : ''
    setDateValue(normalized)
    setDateObject(splitDate(normalized))
  }, [value, type])

  const validateInput = (newValue: string) => {
    if (!newValue && isRequired)
      return { isValid: false, message: '必須項目です' }
    return { isValid: true, message: '' }
  }

  const validateObject = (object: DateObject) => {
    const { year, month } = object
    const day = type === 'month' ? '' : object.day
    const requiredCheck = (checkedValue: string) => isRequired && !checkedValue
    const isNumeric = (checkedValue: string) => /^\d+$/.test(checkedValue)

    if (
      [year, month, day].every((checkedValue) => !checkedValue) &&
      !isRequired
    ) {
      return { isValid: true, message: '' }
    }

    const requiredValues = type === 'month' ? [year, month] : [year, month, day]
    if (requiredValues.some(requiredCheck))
      return { isValid: false, message: '必須項目です' }
    if (year.length !== 4 || !isNumeric(year))
      return { isValid: false, message: '年は4桁の数字で入力してください' }
    if (month.length !== 2 || !isNumeric(month))
      return { isValid: false, message: '月は2桁の数字で入力してください' }
    if (day && (day.length !== 2 || !isNumeric(day)))
      return { isValid: false, message: '日は2桁の数字で入力してください' }

    const monthNum = parseInt(month, 10)
    if (monthNum < 1 || monthNum > 12)
      return { isValid: false, message: '月は01から12の間で入力してください' }

    const daysInMonth = (checkedYear: number, checkedMonth: number) =>
      new Date(checkedYear, checkedMonth, 0).getDate()
    const dayNum = day ? parseInt(day, 10) : null

    if (
      dayNum &&
      (dayNum < 1 || dayNum > daysInMonth(parseInt(year, 10), monthNum))
    ) {
      return {
        isValid: false,
        message: `日は01から${daysInMonth(parseInt(year, 10), monthNum)}の間で入力してください`,
      }
    }

    return { isValid: true, message: '' }
  }

  const handleDateValueChange = (newValue: string) => {
    setDateValue(newValue)
    setDateObject(splitDate(newValue))
    const { message } = validateInput(newValue)
    setErrorMessage(message)
    onChange?.(newValue)
  }

  const handleObjectChange = (key: keyof DateObject, newValue: string) => {
    const next = { ...dateObject, [key]: newValue }
    setDateObject(next)
    const { isValid, message } = validateObject(next)
    setErrorMessage(message)

    if (isValid) {
      const joined = [next.year, next.month, type === 'date' ? next.day : '']
        .filter(Boolean)
        .join('-')
      setDateValue(joined)
      onChange?.(joined)
    }
  }

  const isSmall = size === 'small'
  const textInputClass = `flex-none! ${isSmall ? 'px-[var(--sp-small,0.375rem)]! py-[var(--sp-min,0.1875rem)]! text-[length:var(--fs-small,0.6875rem)]' : 'p-[var(--sp-medium,0.75rem)]!'}`
  const iconStyle = { '--icon-color': COLOR.blue } as CSSProperties

  return (
    <InputBox
      cssStyle={cssStyle}
      isDisabled={isDisabled}
      isErrored={!!errorMessage}
      className={`flex w-full items-center leading-none ${isSmall ? 'h-[calc(var(--bv,0.375rem)*5)] px-[var(--sp-min,0.1875rem)]' : 'h-[calc(var(--bv,0.375rem)*6)] px-[var(--sp-small,0.375rem)]'}`}
    >
      <div className="relative flex-none" style={iconStyle}>
        <CalendarIcon
          className={`pointer-events-none absolute inset-y-0 left-[var(--sp-small,0.375rem)] m-auto fill-(--icon-color) ${isSmall ? 'size-[var(--icon-small,0.9375rem)]' : 'size-[var(--icon-medium,1.125rem)]'}`}
        />
        <input
          type={type}
          name={name}
          value={dateValue}
          max={maxDate}
          min={minDate}
          required={isRequired}
          disabled={isDisabled}
          onChange={(event) => handleDateValueChange(event.target.value)}
          className={`w-[calc(var(--icon-medium,1.125rem)+var(--sp-small,0.375rem)*2)]! cursor-pointer px-[var(--sp-small,0.375rem)]! opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 ${isSmall ? 'py-[var(--sp-min,0.1875rem)]!' : 'py-[var(--sp-medium,0.75rem)]!'}`}
        />
      </div>
      <input
        value={dateObject.year}
        placeholder="年"
        maxLength={4}
        type="text"
        disabled={isDisabled}
        onChange={(event) => handleObjectChange('year', event.target.value)}
        className={`w-[calc(var(--sp-medium,0.75rem)*2+5ch)]! ${textInputClass}`}
      />
      /
      <input
        value={dateObject.month}
        placeholder="月"
        maxLength={2}
        type="text"
        disabled={isDisabled}
        onChange={(event) => handleObjectChange('month', event.target.value)}
        className={`w-[calc(var(--sp-medium,0.75rem)*2+3ch)]! ${textInputClass}`}
      />
      {type === 'date' && <span>/</span>}
      {type === 'date' && (
        <input
          value={dateObject.day}
          placeholder="日"
          maxLength={2}
          type="text"
          disabled={isDisabled}
          onChange={(event) => handleObjectChange('day', event.target.value)}
          className={`w-[calc(var(--sp-medium,0.75rem)*2+3ch)]! ${textInputClass}`}
        />
      )}
      <ErrorMessage errorMessages={errorMessage ? [errorMessage] : undefined} />
    </InputBox>
  )
}
