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
  TextBox,
  TextArea,
  SelectBox,
} from '@geckou/ui'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

function blur(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('TextBox のバリデーション', () => {
  it('数値 0 は必須エラーにならない', () => {
    act(() => {
      root.render(<TextBox name="quantity" value={0} isRequired />)
    })

    expect(container.textContent).not.toContain('必須項目です')
  })

  it('数値 0 でも validates が実行される', () => {
    act(() => {
      root.render(
        <TextBox
          name="quantity"
          value={0}
          validates={[{ regex: /^[1-9]\d*$/, message: '1以上を入力' }]}
        />
      )
    })

    expect(container.textContent).toContain('1以上を入力')
  })

  it('g フラグ付き RegExp でも連続検証の結果が安定する', () => {
    const validates = [{ regex: /^[0-9]+$/g, message: '数字のみ' }]
    act(() => {
      root.render(<TextBox name="quantity" value="123" validates={validates} />)
    })

    const input = container.querySelector('input')!
    blur(input)
    expect(container.textContent).not.toContain('数字のみ')

    blur(input)
    expect(container.textContent).not.toContain('数字のみ')
  })

  it('呼び出し側の RegExp の lastIndex を変異させない', () => {
    const regex = /^[0-9]+$/g
    act(() => {
      root.render(
        <TextBox
          name="quantity"
          value="123"
          validates={[{ regex, message: '数字のみ' }]}
        />
      )
    })

    blur(container.querySelector('input')!)
    expect(regex.lastIndex).toBe(0)
  })

  it('空文字は必須エラーになる', () => {
    act(() => {
      root.render(<TextBox name="quantity" value="" isRequired />)
    })

    blur(container.querySelector('input')!)
    expect(container.textContent).toContain('必須項目です')
  })
})

describe('TextArea のバリデーション', () => {
  it('g フラグ付き RegExp でも連続検証の結果が安定する', () => {
    const validates = [{ regex: /^[a-z]+$/g, message: '英小文字のみ' }]
    act(() => {
      root.render(<TextArea name="memo" value="abc" validates={validates} />)
    })

    const textarea = container.querySelector('textarea')!
    blur(textarea)
    expect(container.textContent).not.toContain('英小文字のみ')

    blur(textarea)
    expect(container.textContent).not.toContain('英小文字のみ')
  })
})

describe('SelectBox のバリデーション', () => {
  const options = [
    { label: 'ゼロ', value: 0 },
    { label: 'イチ', value: 1 },
  ]

  it('値 0 の選択肢は必須エラーにならない', () => {
    act(() => {
      root.render(
        <SelectBox name="count" options={options} value={0} isRequired />
      )
    })

    blur(container.querySelector('select')!)
    expect(container.textContent).not.toContain('必須項目です')
  })

  it('値 0 の選択肢を選ぶと数値 0 が onChange に渡る', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <SelectBox name="count" options={options} onChange={onChange} />
      )
    })

    setSelectValue(container.querySelector('select')!, '0')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('未選択は必須エラーになる', () => {
    act(() => {
      root.render(
        <SelectBox name="count" options={options} value="" isRequired />
      )
    })

    blur(container.querySelector('select')!)
    expect(container.textContent).toContain('必須項目です')
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
