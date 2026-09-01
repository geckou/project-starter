'use client'

import type { PopupBoxHandle } from '@geckou/ui-react'
import {
  BasicButton,
  CheckBox,
  CheckBoxes,
  CheckButton,
  DatePicker,
  DateRangePicker,
  DateSelector,
  DropdownUi,
  FileInput,
  InputGroup,
  LabeledCheckbox,
  LabeledFieldset,
  LoadingSpinner,
  ModalBox,
  PopupBox,
  RadioButtons,
  SearchableSelectBox,
  SelectBox,
  SlideDownUi,
  TabUI,
  TextArea,
  TextBox,
  ToggleButton,
} from '@geckou/ui-react'
import { useRef, useState } from 'react'

const FRUIT_OPTIONS = [
  { label: 'りんご', value: 'apple' },
  { label: 'みかん', value: 'orange' },
  { label: 'ぶどう', value: 'grape', isDisabled: true },
]

export default function UiDemoPage() {
  const [text, setText] = useState<string | number>('')
  const [email, setEmail] = useState<string | number>('')
  const [memo, setMemo] = useState('')
  const [fruit, setFruit] = useState<string | number>('')
  const [checked, setChecked] = useState(false)
  const [checkedList, setCheckedList] = useState<(string | number)[]>([])
  const [buttonChecked, setButtonChecked] = useState(false)
  const [labeledChecked, setLabeledChecked] = useState(false)
  const [radio, setRadio] = useState<string | number>('apple')
  const [toggled, setToggled] = useState(false)
  const [date, setDate] = useState('')
  const [birthday, setBirthday] = useState('')
  const [isModalShown, setIsModalShown] = useState(false)
  const [searchable, setSearchable] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const popupRef = useRef<PopupBoxHandle>(null)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <h1 className="text-2xl font-bold">@geckou/ui-react デモ</h1>

      <section className="flex flex-col gap-4" data-demo="text">
        <h2 className="text-lg font-bold">テキスト入力</h2>
        <TextBox name="demo-text" value={text} onChange={setText} />
        <TextBox
          name="demo-email"
          value={email}
          onChange={setEmail}
          isRequired
          placeholder="メールアドレス"
          validates={[
            {
              regex: /^[^@]+@[^@]+$/,
              message: 'メールアドレスの形式が不正です',
            },
          ]}
        />
        <TextBox name="demo-disabled" value="編集不可" isDisabled />
        <TextArea
          name="demo-memo"
          value={memo}
          onChange={(newValue) => setMemo(newValue ?? '')}
          placeholder="メモ"
        />
      </section>

      <section className="flex flex-col gap-4" data-demo="select">
        <h2 className="text-lg font-bold">選択</h2>
        <SelectBox
          name="demo-fruit"
          options={FRUIT_OPTIONS}
          value={fruit}
          onChange={setFruit}
          placeholder="果物を選択"
        />
        <CheckBox name="demo-check" checked={checked} onChange={setChecked} />
        <CheckBoxes
          name="demo-checks"
          options={FRUIT_OPTIONS}
          value={checkedList}
          onChange={setCheckedList}
        />
        <CheckButton
          name="demo-check-button"
          checked={buttonChecked}
          onChange={setButtonChecked}
        />
        <LabeledCheckbox
          name="demo-labeled-check"
          label="利用規約に同意する"
          checked={labeledChecked}
          onChange={setLabeledChecked}
        />
        <RadioButtons
          options={FRUIT_OPTIONS}
          value={radio}
          onChange={setRadio}
        />
        <ToggleButton
          name="demo-toggle"
          checked={toggled}
          onChange={setToggled}
        />
        <SearchableSelectBox
          name="demo-searchable"
          options={FRUIT_OPTIONS}
          value={searchable}
          onChange={setSearchable}
          placeholder="果物を検索"
        />
        <FileInput value={files} onChange={setFiles} accept="image/*" />
      </section>

      <section className="flex flex-col gap-4" data-demo="date">
        <h2 className="text-lg font-bold">日付</h2>
        <DatePicker name="demo-date" value={date} onChange={setDate} />
        <DateSelector
          name="demo-birthday"
          value={birthday}
          onChange={setBirthday}
        />
        <DateRangePicker />
      </section>

      <section className="flex flex-col gap-4" data-demo="button">
        <h2 className="text-lg font-bold">ボタン</h2>
        <div className="flex items-center gap-4">
          <BasicButton
            onClick={() => {
              setIsLoading(true)
              setTimeout(() => setIsLoading(false), 2000)
            }}
            isLoading={isLoading}
          >
            2秒ローディング
          </BasicButton>
          <BasicButton isDisabled>無効ボタン</BasicButton>
          <span className="size-6">
            <LoadingSpinner />
          </span>
        </div>
        <InputGroup>
          <TextBox name="demo-group-text" value={text} onChange={setText} />
          <BasicButton>検索</BasicButton>
        </InputGroup>
        <LabeledFieldset label="お届け先">
          <TextBox name="demo-address" value={text} onChange={setText} />
        </LabeledFieldset>
      </section>

      <section className="flex flex-col gap-4" data-demo="overlay">
        <h2 className="text-lg font-bold">オーバーレイ / UI</h2>
        <div className="flex items-center gap-4">
          <BasicButton onClick={() => setIsModalShown(true)}>
            モーダルを開く
          </BasicButton>
          <BasicButton onClick={() => popupRef.current?.showPopup()}>
            ポップアップ表示
          </BasicButton>
        </div>
        <ModalBox
          isShown={isModalShown}
          onClose={() => setIsModalShown(false)}
          header={<span>デモモーダル</span>}
          footer={
            <BasicButton onClick={() => setIsModalShown(false)}>
              閉じる
            </BasicButton>
          }
        >
          <p>モーダルの中身。</p>
        </ModalBox>
        <PopupBox ref={popupRef}>コピーしました</PopupBox>
        <DropdownUi
          trigger={<span>メニュー</span>}
          contents={
            <ul>
              <li>項目A</li>
              <li>項目B</li>
            </ul>
          }
        />
        <SlideDownUi trigger={<span>詳細を開く</span>}>
          <p>スライドダウンの中身。</p>
        </SlideDownUi>
        <TabUI
          tabs={[
            { key: 'first', label: 'タブ1' },
            { key: 'second', label: 'タブ2' },
          ]}
          panelSlots={{
            firstContents: <p>タブ1の中身</p>,
            secondContents: <p>タブ2の中身</p>,
          }}
        />
      </section>
    </main>
  )
}
