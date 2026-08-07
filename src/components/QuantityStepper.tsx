/** Big −/+ buttons around a quantity. Far easier than a tiny number spinner
 *  on a phone, which is where this app is mostly used. */
import { parseNumber } from '../lib/money'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  ariaLabel: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  disabled,
  ariaLabel,
}: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))

  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label="−"
      >
        −
      </button>
      <input
        className="stepper__value"
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        value={String(value)}
        onChange={(e) => {
          const parsed = parseNumber(e.target.value)
          if (parsed !== null) onChange(clamp(parsed))
        }}
      />
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label="+"
      >
        +
      </button>
    </div>
  )
}
