import { useEffect, useState } from 'react'

// Responsive count of visual columns: roughly one column per ~300px of viewport
// width, up to 6. The board further caps this by the page's `max_cols` setting,
// so wide screens can use all 6 columns when the page allows it.
const MIN_COL_PX = 300
const MAX_COLS = 12

function compute(width) {
  return Math.max(1, Math.min(MAX_COLS, Math.floor(width / MIN_COL_PX)))
}

export default function useColumnCount() {
  const [count, setCount] = useState(() =>
    compute(typeof window !== 'undefined' ? window.innerWidth : 1280),
  )
  useEffect(() => {
    const onResize = () => setCount(compute(window.innerWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return count
}
