'use client'

import type { InputBoxStyleForEachStatus, Option } from '../types'
import { useEffect, useRef, useState } from 'react'
import { TextBox } from './TextBox'

type Props = {
  options: Option[]
  value: string
  onChange?: (newValue: string) => void
  onSelect?: (newValue: string) => void
  name: string
  placeholder?: string
  isDisabled?: boolean
  searchTarget?: 'label' | 'value'
  cssStyle?: InputBoxStyleForEachStatus
}

export function SearchableSelectBox({
  options,
  value,
  onChange,
  onSelect,
  name,
  placeholder = '入力してください',
  isDisabled,
  searchTarget = 'label',
  cssStyle,
}: Props) {
  const [searchWord, setSearchWord] = useState(value)
  const [isOpened, setIsOpened] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 親からの value 更新に追従（正本の watch(modelValue, immediate) 相当）
  const lastValueProp = useRef(value)

  useEffect(() => {
    if (lastValueProp.current === value) return
    lastValueProp.current = value
    setSearchWord(value)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) setIsOpened(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  const filteredOptions = searchWord
    ? options.filter((option) =>
        String(option[searchTarget])
          .toLowerCase()
          .includes(searchWord.toLowerCase())
      )
    : options

  const handleInputChange = (newValue: string | number) => {
    const word = String(newValue)
    setSearchWord(word)

    if (!word) {
      setIsOpened(false)
      return
    }

    setIsOpened(true)
    onChange?.(word)
  }

  const selectOption = (option: Option) => {
    const newValue = option.value.toString()
    setSearchWord(newValue)
    setIsOpened(false)
    onChange?.(newValue)
    onSelect?.(newValue)
  }

  return (
    <div ref={rootRef} className="relative">
      <TextBox
        name={name}
        value={searchWord}
        onChange={handleInputChange}
        isDisabled={isDisabled}
        placeholder={placeholder}
        cssStyle={cssStyle}
      />
      {isOpened && filteredOptions.length > 0 && (
        <div className="absolute top-[calc(100%-var(--sp-min,0.1875rem))] left-0 z-[2] max-h-[calc(var(--bv,0.375rem)*56)] min-w-full overflow-auto rounded-[var(--radius-small,0.1875rem)] bg-white py-[var(--sp-small,0.375rem)] shadow-[0_0_6px_#33333333]">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="block w-full cursor-pointer p-[var(--sp-medium,0.75rem)] text-left text-[length:var(--fs-small,0.6875rem)] text-[var(--link-color,#1c4ac9)] hover:bg-[var(--hover-color,#EEF7FB)] hover:transition-all hover:duration-100"
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
