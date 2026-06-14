import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ContextMenu({ open, position, anchorRect, anchorRef, items, onClose, anchorOffset = 8 }) {
  const ref = useRef(null)
  const [coords, setCoords] = useState(position)

  useLayoutEffect(() => {
    if (!open) return
    const resolvedAnchorRect = anchorRect ?? anchorRef?.current?.getBoundingClientRect?.() ?? null
    const rect = ref.current?.getBoundingClientRect() ?? { width: 224, height: 160 }
    let left
    let top

    if (resolvedAnchorRect) {
      const fitsBelow = resolvedAnchorRect.bottom + anchorOffset + rect.height <= window.innerHeight - 8
      const fitsAbove = resolvedAnchorRect.top - anchorOffset - rect.height >= 8
      top = fitsBelow || !fitsAbove
        ? resolvedAnchorRect.bottom + anchorOffset
        : resolvedAnchorRect.top - rect.height - anchorOffset

      const fitsRightAligned = resolvedAnchorRect.right - rect.width >= 8
      const fitsLeftAligned = resolvedAnchorRect.left + rect.width <= window.innerWidth - 8
      if (fitsRightAligned) left = resolvedAnchorRect.right - rect.width
      else if (fitsLeftAligned) left = resolvedAnchorRect.left
      else left = Math.max(8, Math.min(resolvedAnchorRect.right - rect.width, window.innerWidth - rect.width - 8))
    } else {
      left = position?.x
      top = position?.y
    }

    if (left == null || top == null) return
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))
    setCoords({ x: left, y: top })
  }, [open, position, anchorRect, anchorRef, items, anchorOffset])

  useEffect(() => {
    if (!open) return undefined
    const onMouseDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    const onViewportChange = () => onClose()
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, onClose])

  if (!open || !coords || !items.length) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-120 min-w-56 overflow-hidden rounded-xl border border-white/10 bg-slate-800 py-1 shadow-2xl"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            role="menuitem"
            className={`flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-left text-sm ${
              item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-200 hover:bg-white/5'
            } ${item.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            onClick={() => {
              if (item.disabled) return
              onClose()
              item.onClick?.()
            }}
            disabled={item.disabled}
          >
            {Icon ? <Icon className="h-4 w-4" /> : <span className="w-4 text-center text-xs">{item.glyph}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
