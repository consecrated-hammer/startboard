// Free-placement helpers for the manual page layout. Rects are canvas pixels
// shaped { id, x, y, w, h, z }.

export const MANUAL_ORIGIN = 24
export const MANUAL_CARD_WIDTH = 420

const overlaps = (a, b, gap) => (
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap
  && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
)

export function hasStoredPosition(group) {
  return group.manual_x != null || group.manual_y != null
}

// Groups never placed by hand start in their natural column order rather
// than piling up on the origin.
export function seedPositions(groups, sizeOf, { width, gapX, gapY, canvasWidth }) {
  const fit = Math.max(1, Math.floor((canvasWidth - MANUAL_ORIGIN + gapX) / (width + gapX)))
  const nextY = new Map()
  const positions = new Map()
  groups
    .filter((group) => !hasStoredPosition(group))
    .sort((a, b) => (a.column ?? 0) - (b.column ?? 0) || (a.position ?? 0) - (b.position ?? 0))
    .forEach((group) => {
      const col = (group.column ?? 0) % fit
      const y = nextY.get(col) ?? MANUAL_ORIGIN
      positions.set(group.id, { x: MANUAL_ORIGIN + col * (width + gapX), y })
      nextY.set(col, y + sizeOf(group).h + gapY)
    })
  return positions
}

// Closest position to rect's own that clears every placed rect. The optimum
// always has each axis either where it started or flush against an edge, so
// only those candidates need checking.
export function findFreeSpot(rect, placed, gap, canvasWidth = 0) {
  const maxRight = Math.max(canvasWidth, rect.x + rect.w)
  const fits = (x, y) => x >= 0 && y >= 0 && x + rect.w <= maxRight
    && !placed.some((other) => overlaps({ ...rect, x, y }, other, gap))
  if (fits(rect.x, rect.y)) return { x: rect.x, y: rect.y }

  const xs = new Set([rect.x, 0, maxRight - rect.w])
  const ys = new Set([rect.y, 0])
  placed.forEach((other) => {
    xs.add(other.x + other.w + gap)
    xs.add(other.x - rect.w - gap)
    ys.add(other.y + other.h + gap)
    ys.add(other.y - rect.h - gap)
  })
  let best = null
  let bestDistance = Infinity
  xs.forEach((x) => ys.forEach((y) => {
    const distance = (x - rect.x) ** 2 + (y - rect.y) ** 2
    if (distance < bestDistance && fits(x, y)) {
      best = { x, y }
      bestDistance = distance
    }
  }))
  if (best) return best
  const bottom = Math.max(0, ...placed.map((other) => other.y + other.h + gap))
  return { x: Math.max(0, rect.x), y: bottom }
}

// Older placements keep their spot; each later (higher z) group moves to the
// nearest free spot around them, so the most recently dropped group is the
// one that yields.
export function resolveOverlaps(rects, gap, canvasWidth = 0) {
  const ordered = [...rects].sort((a, b) => a.z - b.z || a.id - b.id)
  const placed = []
  ordered.forEach((rect) => {
    placed.push({ ...rect, ...findFreeSpot(rect, placed, gap, canvasWidth) })
  })
  return new Map(placed.map((rect) => [rect.id, rect]))
}
