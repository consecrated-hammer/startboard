import { useEffect, useState } from 'react'

// Responsive count of visual columns. When the page defines a Card max width,
// we derive how many columns actually fit from that width (plus the horizontal
// gap between columns), so a narrower card width lets more columns pack in.
// When no card width is set, columns render as `1fr` (stretch), so there is no
// width to divide by and we fall back to a sensible minimum column width.
// The board further caps the result by the page's `max_cols` setting.
const DEFAULT_MIN_COL_PX = 300
const MAX_COLS = 12

function compute(width, minColPx) {
  return Math.max(1, Math.min(MAX_COLS, Math.floor(width / minColPx)))
}

export default function useColumnCount(cardMaxWidth = 0, cardGapX = 16) {
  // Per-column cost: the card's own width plus one gap. Reserving a gap per
  // column (rather than gap * (n - 1)) leaves a small margin for container
  // padding so cards never butt against the viewport edge.
  const minColPx = cardMaxWidth > 0 ? cardMaxWidth + cardGapX : DEFAULT_MIN_COL_PX
  const [count, setCount] = useState(() =>
    compute(typeof window !== 'undefined' ? window.innerWidth : 1280, minColPx),
  )
  useEffect(() => {
    const onResize = () => setCount(compute(window.innerWidth, minColPx))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [minColPx])
  return count
}
