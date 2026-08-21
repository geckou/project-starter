// @geckou/ui の移植時に修正したバグのリグレッションテスト
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  TabUI,
  DateSelector,
  DatePicker,
  SearchableSelectBox,
  FileInput,
  CheckButton,
  CheckBox,
  RadioButtons,
  ToggleButton,
  ModalBox,
  SlideDownUi,
  DropdownUi,
} from '@geckou/ui'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom には ResizeObserver が無いため（DropdownUi / SlideDownUi が使用）
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value'
  )!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('TabUI', () => {
  const tabs = [
    { key: 'first', label: 'タブ1' },
    { key: 'second', label: 'タブ2' },
  ]

  function renderTabs() {
    act(() => {
      root.render(
        <TabUI
          tabs={tabs}
          panelSlots={{
            firstContents: <p>panel1</p>,
            secondContents: <p>panel2</p>,
          }}
        />
      )
    })
  }

  it('タブリスト上の矢印キーでタブが切り替わる', () => {
    renderTabs()
    const tablist = container.querySelector('[role="tablist"]')!

    act(() => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
    })

    const selected = [...container.querySelectorAll('[role="tab"]')].map((t) =>
      t.getAttribute('aria-selected')
    )
    expect(selected).toEqual(['false', 'true'])
  })

  it('タブリスト外のキー入力では切り替わらない（元実装の window リスナー起因バグの修正）', () => {
    renderTabs()

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
    })

    const selected = [...container.querySelectorAll('[role="tab"]')].map((t) =>
      t.getAttribute('aria-selected')
    )
    expect(selected).toEqual(['true', 'false'])
  })
})

describe('DateSelector', () => {
  it('月の変更で選択済みの日が範囲外になったらクランプされる', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<DateSelector name="birthday" onChange={onChange} />)
    })

    const selects = () =>
      [...container.querySelectorAll('select')] as HTMLSelectElement[]

    act(() => setSelectValue(selects()[0], '2000'))
    act(() => setSelectValue(selects()[1], '03'))
    act(() => setSelectValue(selects()[2], '31'))
    expect(onChange).toHaveBeenLastCalledWith('2000-03-31')

    act(() => setSelectValue(selects()[1], '02'))

    // 2000年はうるう年なので 02/29 にクランプ
    expect(selects()[2].value).toBe('29')
    expect(onChange).toHaveBeenLastCalledWith('2000-02-29')
  })

  it('親が value を空に戻すとリセットされる', () => {
    function renderWithValue(value: string) {
      act(() => {
        root.render(<DateSelector name="birthday" value={value} />)
      })
    }

    renderWithValue('2000-01-15')
    const selects = () =>
      [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects()[0].value).toBe('2000')

    renderWithValue('')
    expect(selects().map((s) => s.value)).toEqual(['', '', ''])
  })
})

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('SearchableSelectBox', () => {
  const options = [
    { label: 'りんご', value: 'apple' },
    { label: 'みかん', value: 'orange' },
  ]

  function renderBox(value: string, onChange?: (v: string) => void) {
    act(() => {
      root.render(
        <SearchableSelectBox
          name="fruit"
          options={options}
          value={value}
          onChange={onChange}
        />
      )
    })
  }

  it('入力でフィルタされた選択肢が開き、選択で確定する', () => {
    const onChange = vi.fn()
    renderBox('', onChange)

    const input = container.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    act(() => setInputValue(input, 'りん'))

    const optionButtons = [...container.querySelectorAll('button')].filter(
      (b) => b.textContent === 'りんご'
    )
    expect(optionButtons).toHaveLength(1)
    expect(
      [...container.querySelectorAll('button')].some(
        (b) => b.textContent === 'みかん'
      )
    ).toBe(false)

    act(() => optionButtons[0].click())
    expect(onChange).toHaveBeenLastCalledWith('apple')
    expect(
      [...container.querySelectorAll('button')].some(
        (b) => b.textContent === 'りんご'
      )
    ).toBe(false)
  })

  it('入力を空にすると選択肢が閉じる', () => {
    renderBox('')
    const input = container.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement

    act(() => setInputValue(input, 'り'))
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)

    act(() => setInputValue(input, ''))
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})

describe('FileInput', () => {
  it('ファイル選択で onChange、個別削除・全削除が機能する', () => {
    const files: File[] = []
    const onChange = vi.fn()

    function renderInput(value: File[]) {
      act(() => {
        root.render(<FileInput value={value} onChange={onChange} />)
      })
    }

    renderInput(files)
    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement

    const file = new File(['data'], 'photo.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    act(() => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith([file])

    renderInput([file])
    expect(container.textContent).toContain('photo.png')
    expect(container.textContent).toContain('全て削除')

    const removeAll = [...container.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('全て削除')
    )!
    act(() => removeAll.click())
    expect(onChange).toHaveBeenLastCalledWith([])

    renderInput([])
    expect(container.textContent).not.toContain('photo.png')
  })
})

// Issue #90: display:none の入力要素はタブ順・アクセシビリティツリーから除外されるため、
// sr-only 化してフォーカス到達できることのリグレッションテスト
describe('キーボードアクセシビリティ', () => {
  it('CheckButton: input が label 内にあり sr-only でフォーカス可能', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <CheckButton name="agree" checked={false} onChange={onChange} />
      )
    })

    const input = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement
    expect(input.classList.contains('hidden')).toBe(false)
    expect(input.classList.contains('sr-only')).toBe(true)
    expect(input.closest('label')).not.toBeNull()

    input.focus()
    expect(document.activeElement).toBe(input)

    // ネイティブ checkbox の Space トグルは click 経由で発火する
    act(() => input.click())
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it('CheckBox: button に aria-pressed と disabled が反映される', () => {
    const onChange = vi.fn()

    function renderCheckBox(checked: boolean, isDisabled?: boolean) {
      act(() => {
        root.render(
          <CheckBox
            name="agree"
            checked={checked}
            onChange={onChange}
            isDisabled={isDisabled}
          />
        )
      })
    }

    renderCheckBox(false)
    const button = () => container.querySelector('button')!
    expect(button().getAttribute('aria-pressed')).toBe('false')

    act(() => button().click())
    expect(onChange).toHaveBeenLastCalledWith(true)

    renderCheckBox(true)
    expect(button().getAttribute('aria-pressed')).toBe('true')

    renderCheckBox(false, true)
    expect(button().disabled).toBe(true)
  })

  it('RadioButtons: input が sr-only でフォーカス・選択できる', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <RadioButtons
          value=""
          onChange={onChange}
          options={[
            { label: 'りんご', value: 'apple' },
            { label: 'みかん', value: 'orange' },
          ]}
        />
      )
    })

    const inputs = [
      ...container.querySelectorAll('input[type="radio"]'),
    ] as HTMLInputElement[]
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      expect(input.classList.contains('hidden')).toBe(false)
      expect(input.classList.contains('sr-only')).toBe(true)
    }

    inputs[0].focus()
    expect(document.activeElement).toBe(inputs[0])

    act(() => inputs[1].click())
    expect(onChange).toHaveBeenLastCalledWith('orange')
  })

  it('ToggleButton: aria-pressed とアクセシブル名がある', () => {
    const onChange = vi.fn()

    function renderToggle(checked: boolean) {
      act(() => {
        root.render(
          <ToggleButton
            name="notification"
            checked={checked}
            onChange={onChange}
          />
        )
      })
    }

    renderToggle(false)
    const button = () => container.querySelector('button')!
    expect(button().getAttribute('aria-pressed')).toBe('false')
    expect(button().getAttribute('aria-label')).toBe('notification')

    act(() => button().click())
    expect(onChange).toHaveBeenLastCalledWith(true)

    renderToggle(true)
    expect(button().getAttribute('aria-pressed')).toBe('true')
  })

  it('ModalBox: 非表示時は inert、閉じるボタンにアクセシブル名がある', () => {
    function renderModal(isShown: boolean) {
      act(() => {
        root.render(
          <ModalBox isShown={isShown} onClose={() => {}}>
            <p>本文</p>
          </ModalBox>
        )
      })
    }

    renderModal(false)
    const overlay = () => container.firstElementChild as HTMLElement
    expect(overlay().hasAttribute('inert')).toBe(true)

    renderModal(true)
    expect(overlay().hasAttribute('inert')).toBe(false)

    const closeButton = container.querySelector('button[aria-label="閉じる"]')
    expect(closeButton).not.toBeNull()

    // 表示時はダイアログへ初期フォーカスが移る
    const dialog = container.querySelector('[role="dialog"]')
    expect(document.activeElement).toBe(dialog)
  })

  it('SlideDownUi: トリガーに aria-expanded、閉状態のコンテンツは inert', () => {
    act(() => {
      root.render(
        <SlideDownUi trigger={<span>開く</span>}>
          <button type="button">中のボタン</button>
        </SlideDownUi>
      )
    })

    const trigger = container.querySelector('button')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    const contents = container.querySelector('[inert]')
    expect(contents).not.toBeNull()

    act(() => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[inert]')).toBeNull()
  })

  it('DropdownUi: トリガーに aria-expanded、閉状態のコンテンツは inert', () => {
    act(() => {
      root.render(
        <DropdownUi
          trigger={<span>メニュー</span>}
          contents={<button type="button">項目</button>}
        />
      )
    })

    const trigger = container.querySelector('button')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[inert]')).not.toBeNull()

    act(() => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[inert]')).toBeNull()
  })

  it('FileInput: ファイル選択 input が sr-only、削除ボタンにアクセシブル名がある', () => {
    const file = new File(['data'], 'photo.png', { type: 'image/png' })
    act(() => {
      root.render(<FileInput value={[file]} onChange={() => {}} />)
    })

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(input.classList.contains('hidden')).toBe(false)
    expect(input.classList.contains('sr-only')).toBe(true)

    const removeButton = container.querySelector(
      'button[aria-label="photo.png を削除"]'
    )
    expect(removeButton).not.toBeNull()
  })
})

describe('DatePicker', () => {
  it('親からの value 更新に追従する', () => {
    function renderWithValue(value: string) {
      act(() => {
        root.render(<DatePicker name="date" value={value} />)
      })
    }

    renderWithValue('2026-01-01')
    const dateInput = () =>
      container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput().value).toBe('2026-01-01')

    renderWithValue('2026-12-31')
    expect(dateInput().value).toBe('2026-12-31')
  })

  it('不正な value でもクラッシュしない', () => {
    expect(() => {
      act(() => {
        root.render(<DatePicker name="date" value="invalid-date" />)
      })
    }).not.toThrow()
  })

  it('type="month" では YYYY-MM 形式になる', () => {
    act(() => {
      root.render(<DatePicker name="month" type="month" value="2026-08-17" />)
    })

    const monthInput = container.querySelector(
      'input[type="month"]'
    ) as HTMLInputElement
    expect(monthInput.value).toBe('2026-08')
  })
})
