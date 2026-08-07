/**
 * The Caro Calculator mark: a girl with long hair and a bow.
 *
 * Inline SVG rather than an image file so the hair inherits `currentColor` —
 * one CSS variable controls the brand colour everywhere the mark appears, and
 * it stays sharp at any density without shipping @2x/@3x assets.
 *
 * Checked legible down to 20px, which is roughly favicon size. The white
 * pieces are literal white (not transparent) because they carve the face and
 * neck out of the solid hair shape behind them.
 */
interface Props {
  size?: number
  className?: string
}

export function GirlLogo({ size = 34, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Caro"
    >
      {/* Hair: a dome with two long strands falling past the chin. */}
      <path
        d="M13 28a19 19 0 0 1 38 0v22a5 5 0 0 1-10 0V30H23v20a5 5 0 0 1-10 0Z"
        fill="currentColor"
      />

      {/* Neck, then face — both cut out of the hair shape above. */}
      <path d="M26 40h12v22H26z" fill="#fff" />
      <ellipse cx="32" cy="31" rx="11.5" ry="13.5" fill="#fff" />

      {/* Eyes and a small smile. */}
      <circle cx="27" cy="32" r="2.2" fill="currentColor" />
      <circle cx="37" cy="32" r="2.2" fill="currentColor" />
      <path
        d="M28 39c1.6 2 6.8 2 8 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Bow. The white stroke keeps it readable where it overlaps the hair. */}
      <g fill="currentColor" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M20 16 11 10.5v11z" />
        <path d="M20 16 29 10.5v11z" />
        <circle cx="20" cy="16" r="3" />
      </g>
    </svg>
  )
}
