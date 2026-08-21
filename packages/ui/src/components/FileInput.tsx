'use client'

import type { CSSProperties, DragEvent } from 'react'
import { BackupIcon } from './icons/BackupIcon'
import { CloseIcon } from './icons/CloseIcon'
import { COLOR } from '../constants'

type Props = {
  value: File[]
  onChange?: (files: File[]) => void
  accept?: string
}

export function FileInput({ value, onChange, accept = '' }: Props) {
  const uploadFiles = value ?? []

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles || !newFiles.length) return
    onChange?.([...uploadFiles, ...Array.from(newFiles)])
  }

  const removeFile = (target: File) => {
    onChange?.(uploadFiles.filter((file) => file !== target))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  const style = {
    '--link-color': COLOR.blue,
    '--caution-color': COLOR.red,
  } as CSSProperties

  return (
    <div
      style={style}
      className="w-full rounded-[var(--radius-small,0.1875rem)] border border-dashed border-[var(--link-color,#1c4ac9)] p-[var(--sp-medium,0.75rem)]"
    >
      <div
        className="flex h-full flex-col items-center justify-center gap-[var(--sp-small,0.375rem)] [&>span]:inline-block [&>span]:p-[var(--sp-small,0.375rem)]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span>ファイルをドロップしてアップロード</span>
        <span>または</span>
        <label className="relative inline-flex cursor-pointer items-center gap-[var(--sp-small,0.375rem)] rounded-[var(--radius-small,0.1875rem)] bg-transparent p-[var(--sp-small,0.375rem)] font-medium text-[var(--link-color,#1c4ac9)] transition-colors duration-100 hover:bg-[var(--hover-color,#EEF7FB)] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--link-color,#1c4ac9)]">
          <BackupIcon className="size-[var(--icon-small,0.9375rem)]" />
          <span>ファイルを選択</span>
          <input
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
      </div>
      {uploadFiles.length > 0 && (
        <div className="mt-[var(--sp-medium,0.75rem)] flex flex-col items-center gap-[var(--sp-small,0.375rem)] bg-[var(--light-blue,#d2e4f7)] p-[var(--sp-medium,0.75rem)] [&>*:last-child]:mt-[var(--sp-small,0.375rem)]">
          {uploadFiles.map((file, index) => (
            <span
              key={`${file.name}_${index}`}
              className="inline-flex items-center gap-[var(--sp-min,0.1875rem)]"
            >
              {file.name}
              <button
                type="button"
                aria-label={`${file.name} を削除`}
                className="inline-flex cursor-pointer items-center"
                onClick={() => removeFile(file)}
              >
                <CloseIcon className="size-[var(--icon-small,0.9375rem)] text-[var(--caution-color,#aa0000)]" />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-[var(--sp-min,0.1875rem)] rounded-[var(--radius-small,0.1875rem)] border border-[var(--caution-color,#aa0000)] bg-white px-[var(--sp-medium,0.75rem)] py-[var(--sp-small,0.375rem)] text-[length:var(--fs-small,0.6875rem)] text-[var(--caution-color,#aa0000)]"
            onClick={() => onChange?.([])}
          >
            <CloseIcon className="size-[var(--icon-min,0.75rem)]" />
            全て削除
          </button>
        </div>
      )}
    </div>
  )
}
