export type StateVariation =
  | 'default'
  | 'error'
  | 'disabled'
  | 'valid'
  | 'focus'
  | 'hover'

export type BorderStyle = {
  color: string
  size: string
  radius: string
}

export type BaseStyle = {
  textColor?: string
  backgroundColor?: string
  border?: BorderStyle
  boxShadow?: string
}

export type StyleForEachStatus<T> = Partial<Record<StateVariation, T>> & {
  default: T
}

export type InputBoxStyle = BaseStyle & {
  placeholderColor?: string
}

export type InputBoxStyleForEachStatus = StyleForEachStatus<InputBoxStyle>

export type ButtonStyle = BaseStyle & {
  backgroundImage?: string
}

export type ButtonStyleForEachStatus = StyleForEachStatus<ButtonStyle>

export type CheckBoxStyle = Pick<
  BaseStyle,
  'textColor' | 'border' | 'backgroundColor'
>
export type CheckBoxStyleForEachStatus = StyleForEachStatus<CheckBoxStyle>

export type RadioButtonStyle = {
  border?: Omit<BorderStyle, 'radius'>
  backgroundColor?: string
}

export type RadioButtonStyleForEachStatus = StyleForEachStatus<RadioButtonStyle>

export type SelectValue = string | number

export type Option = {
  label: string
  value: SelectValue
  order?: number
  isDisabled?: boolean
}

export type Validate = {
  regex: RegExp
  message: string
}

export type Validates = Validate[]
