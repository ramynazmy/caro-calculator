/**
 * A text field for a money amount.
 *
 * It keeps the raw text you typed in local state while the field is focused,
 * so half-finished input like "12." is never yanked out from under you. On
 * blur it snaps back to a tidy "12.00".
 */
import { useEffect, useState } from 'react'
import { minorToInputString, parseToMinor } from '../lib/money'
import { getCurrency } from '../lib/currencies'
import { useI18n } from '../i18n'

interface Props {
  valueMinor: number | null
  onChange: (minor: number | null) => void
  currency: string
  placeholder?: string
  id?: string
  ariaLabel?: string
  autoFocus?: boolean
}

export function MoneyInput({
  valueMinor,
  onChange,
  currency,
  placeholder,
  id,
  ariaLabel,
  autoFocus,
}: Props) {
  const { lang } = useI18n()
  const info = getCurrency(currency)
  const [text, setText] = useState(() =>
    valueMinor === null ? '' : minorToInputString(valueMinor, currency),
  )
  const [focused, setFocused] = useState(false)

  // Pull in changes made elsewhere (currency switch, "adjust service" button),
  // but never while the user is mid-type.
  useEffect(() => {
    if (focused) return
    setText(valueMinor === null ? '' : minorToInputString(valueMinor, currency))
  }, [valueMinor, currency, focused])

  return (
    <div className="money-input">
      <input
        id={id}
        aria-label={ariaLabel}
        className="input money-input__field"
        type="text"
        // Shows the numeric keypad on phones without the spinner arrows and
        // locale headaches that come with type="number".
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder ?? minorToInputString(0, currency)}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          const parsed = parseToMinor(text, currency)
          setText(parsed === null ? '' : minorToInputString(parsed, currency))
        }}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseToMinor(e.target.value, currency))
        }}
      />
      <span className="money-input__suffix" aria-hidden="true">
        {lang === 'ar' ? info.symbolAr : info.symbolEn}
      </span>
    </div>
  )
}
