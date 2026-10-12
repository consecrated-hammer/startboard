import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DndContext, PointerSensor, closestCorners, useSensor, useSensors,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Image as ImageIcon, Plus } from 'lucide-react'
import { adminAPI, bookmarksAPI, errorMessage, groupsAPI, pagesAPI } from '../services/api.js'
import { offlineStore } from '../services/offline.js'
import useColumnCount from '../hooks/useColumnCount.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppState } from '../context/AppStateContext.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import TopBar from '../components/board/TopBar.jsx'
import BoardColumn from '../components/board/BoardColumn.jsx'
import BookmarkModal from '../components/board/BookmarkModal.jsx'
import GroupModal from '../components/board/GroupModal.jsx'
import MoveGroupModal from '../components/board/MoveGroupModal.jsx'
import PageSettingsModal from '../components/board/PageSettingsModal.jsx'
import SearchPalette from '../components/board/SearchPalette.jsx'
import TextPromptModal from '../components/board/TextPromptModal.jsx'
import GroupBookmarkManagerModal from '../components/board/GroupBookmarkManagerModal.jsx'
import CopyDockerBookmarkModal from '../components/board/CopyDockerBookmarkModal.jsx'
import { btnPrimary } from '../components/ui.js'
import Spinner from '../components/Spinner.jsx'
import { isBookmarkLaunchable } from '../lib/bookmarkLinks.js'
import { getAnalyticsViewerKey } from '../lib/analytics.js'
import {
  MANUAL_CARD_WIDTH, findFreeSpot, hasStoredPosition, resolveOverlaps, seedPositions,
} from '../lib/manualLayout.js'

const numId = (prefixed) => Number(String(prefixed).split(':')[1])

// ---- 2D column helpers ----
function estimateGroupHeight(group) {
  const visibleBookmarks = group.visible_limit > 0
    ? Math.min(group.bookmarks?.length ?? 0, group.visible_limit)
    : (group.bookmarks?.length ?? 0)
  // Icon grids fit four per row, each row about twice a list row's height.
  if (group.display_mode === 'icons') return 1 + Math.ceil(visibleBookmarks / 4) * 2
  return 1 + visibleBookmarks
}

function buildColumns(flatGroups, count, autoBalance = false, singleRowOrder = 'natural', tallestFirst = false) {
  const cols = Array.from({ length: count }, () => [])
  const sorted = [...flatGroups].sort(
    (a, b) => (a.column - b.column) || (a.position - b.position),
  )
  // Tallest-first feeds the same masonry pass tallest to shortest, so the
  // first row reads tallest to shortest and the rest fill the shortest column.
  if (tallestFirst) sorted.sort((a, b) => estimateGroupHeight(b) - estimateGroupHeight(a))
  if (autoBalance || tallestFirst) {
    if (autoBalance && sorted.length <= count && singleRowOrder === 'tallest_first') {
      const singleRow = [...sorted].sort((a, b) => (
        estimateGroupHeight(b) - estimateGroupHeight(a)
      ) || ((a.column - b.column) || (a.position - b.position)))
      singleRow.forEach((group, index) => { cols[index].push(group) })
      return cols
    }
    // Display-only masonry: greedily place each group into the currently
    // shortest column (estimated height = header + bookmark count) so the board
    // packs evenly. Never rewrites the stored column, so disabling restores it.
    const heights = Array.from({ length: count }, () => 0)
    for (const g of sorted) {
      let t = 0
      for (let i = 1; i < count; i++) if (heights[i] < heights[t]) t = i
      cols[t].push(g)
      heights[t] += estimateGroupHeight(g)
    }
    return cols
  }
  for (const g of sorted) cols[Math.min(g.column ?? 0, count - 1)].push(g)
  return cols
}
function flattenColumns(cols) {
  const out = []
  cols.forEach((col, ci) => col.forEach((g, pi) => out.push({ ...g, column: ci, position: pi })))
  return out
}
function mergeBookmarksIntoGroups(baseGroups, cols) {
  const byId = new Map()
  cols.forEach((col) => col.forEach((group) => byId.set(group.id, group.bookmarks)))
  return baseGroups.map((group) => (
    byId.has(group.id) ? { ...group, bookmarks: byId.get(group.id) } : group
  ))
}
function findGroup(cols, gid) {
  for (let ci = 0; ci < cols.length; ci++) {
    const gi = cols[ci].findIndex((g) => g.id === gid)
    if (gi !== -1) return [ci, gi]
  }
  return null
}
function findBookmark(cols, bid) {
  for (let ci = 0; ci < cols.length; ci++)
    for (let gi = 0; gi < cols[ci].length; gi++) {
      const bi = cols[ci][gi].bookmarks.findIndex((b) => b.id === bid)
      if (bi !== -1) return [ci, gi, bi]
    }
  return null
}

const GROUP_ALIGN_JUSTIFY = { left: 'start', center: 'center', right: 'end' }

function isSlideshowActive(page) {
  return page?.bg_image_mode === 'managed_rotation' && Boolean(page?.bg_slideshow_enabled)
}

function slideshowIntervalMs(page) {
  if (!isSlideshowActive(page)) return null
  const value = Math.max(1, Number(page.bg_slideshow_interval_value) || 30)
  return value * (page.bg_slideshow_interval_unit === 'minutes' ? 60_000 : 1_000)
}

function backgroundImageUrl(page, token = '', advance = 0) {
  const base = page?.background_url || page?.bg_image
  if (!base) return undefined
  if (isSlideshowActive(page)) {
    const sep = String(base).includes('?') ? '&' : '?'
    return `${base}${sep}sb_bg=${token || Date.now()}&advance=${advance}`
  }
  return base
}

function pageLayoutMode(page) {
  return page?.layout_mode || (page?.auto_balance ? 'balanced' : 'natural')
}

function estimateManualGroupHeightPx(group) {
  const visibleBookmarks = group.visible_limit > 0
    ? Math.min(group.bookmarks?.length ?? 0, group.visible_limit)
    : (group.bookmarks?.length ?? 0)
  const iconGridRows = group.display_mode === 'icons'
    ? Math.max(1, Math.ceil(visibleBookmarks / 4))
    : visibleBookmarks
  return 96 + (iconGridRows * (group.display_mode === 'icons' ? 60 : 34))
}

function manualCanvasHeightFor(positions) {
  if (!positions.size) return 480
  const maxBottom = Math.max(...[...positions.values()].map((rect) => rect.y + rect.h))
  return Math.max(480, maxBottom + 64)
}

export default function BoardPage() {
  const { preferences, settings } = useAppState()
  const { pageId } = useParams()
  const navigate = useNavigate()
  const { offlineAuth } = useAuth()
  const [board, setBoard] = useState(null)
  // max_cols 0 (or null) = "Max": fill the screen using the responsive count.
  const maxCols = board?.page?.max_cols ?? 0
  const currentPageId = board?.page?.id ?? null
  // When a Card max width is set, the responsive count fits to it; otherwise
  // columns stretch (1fr) and we fall back to the hook's default min width.
  const responsiveCols = useColumnCount(board?.page?.card_max_width ?? 0, board?.page?.card_gap_x ?? 16)
  const colCount = maxCols > 0 ? Math.min(responsiveCols, maxCols) : responsiveCols
  const colCountRef = useRef(colCount)
  useEffect(() => { colCountRef.current = colCount }, [colCount])

  const [pages, setPages] = useState([])
  const [groups, setGroups] = useState([])   // authoritative layout (logical cols 0..3)
  const [columns, setColumns] = useState([]) // rendered/working 2D, folded to colCount
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [offlineSnapshot, setOfflineSnapshot] = useState(false)
  const [bgRefreshToken, setBgRefreshToken] = useState(() => Date.now())
  const [bgAdvance, setBgAdvance] = useState(0)
  const [boardMenu, setBoardMenu] = useState(null)

  const [bookmarkModal, setBookmarkModal] = useState(null)
  const [groupModal, setGroupModal] = useState(null)
  const [moveGroupModal, setMoveGroupModal] = useState(null)
  const [bookmarkManagerGroup, setBookmarkManagerGroup] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsState, setSettingsState] = useState(null)
  const [prompt, setPrompt] = useState(null)
  const [moveGroupError, setMoveGroupError] = useState('')
  const [moveGroupBusy, setMoveGroupBusy] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [manualDragGroupId, setManualDragGroupId] = useState(null)
  const [dockerCopyBookmark, setDockerCopyBookmark] = useState(null)
  const [dockerCopyDestinations, setDockerCopyDestinations] = useState([])
  const [dockerCopyBusy, setDockerCopyBusy] = useState(false)
  const groupsRef = useRef(groups)
  const dragStartRef = useRef(null)
  const manualDragRef = useRef(null)
  const manualCanvasRef = useRef(null)
  const manualLayoutRef = useRef(null)
  const [manualSizes, setManualSizes] = useState({})
  const [manualCanvasWidth, setManualCanvasWidth] = useState(0)
  const loadRequestRef = useRef(0)
  const pagePatchTimerRef = useRef(null)
  const pendingPagePatchRef = useRef({})
  const trackedViewKeyRef = useRef(null)

  useEffect(() => {
    const ms = slideshowIntervalMs(board?.page)
    if (!ms) return undefined
    const timer = window.setInterval(() => setBgRefreshToken(Date.now()), ms)
    return () => window.clearInterval(timer)
  }, [board?.page])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const loadPages = useCallback(async () => {
    const list = await pagesAPI.list()
    setPages(list)
    offlineStore.writePageList(list)
    return list
  }, [])

  // Persist tab-bar order. Optimistically reorder local state, then save; on
  // failure reload from the server to resync.
  const reorderPages = useCallback(async (orderedIds) => {
    setPages((current) => {
      const byId = new Map(current.map((p) => [p.id, p]))
      const next = orderedIds.map((id) => byId.get(id)).filter(Boolean)
      offlineStore.writePageList(next)
      return next
    })
    try {
      await pagesAPI.setPositions(orderedIds)
    } catch {
      await loadPages()
    }
  }, [loadPages])

  const applyBoardData = useCallback((data, offline = false) => {
    const nextBoard = offline
      ? {
        ...data,
        page: { ...data.page, can_edit: false, is_owner: false },
        can_edit: false,
      }
      : data
    setBoard(nextBoard)
    setGroups(data.groups)
    setBgAdvance(0)
    setColumns(
      buildColumns(
        data.groups,
        colCountRef.current,
        pageLayoutMode(data.page) === 'balanced',
        data.page?.single_row_order || 'natural',
        pageLayoutMode(data.page) === 'tallest',
      ),
    )
    setOfflineSnapshot(offline)
  }, [])

  const loadBoard = useCallback(async (id) => {
    const data = await pagesAPI.get(id)
    applyBoardData(data, false)
    offlineStore.writeBoard(id, data)
    return data
  }, [applyBoardData])

  useEffect(() => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const list = await loadPages()
        if (cancelled || loadRequestRef.current !== requestId) return
        let target = pageId ? Number(pageId) : list[0]?.id
        if (!pageId && preferences.restore_last_page) {
          const remembered = Number(window.localStorage.getItem('startboard.lastPageId') || '')
          if (remembered && list.find((p) => p.id === remembered)) target = remembered
        }
        if (!list.find((p) => p.id === target)) target = list[0]?.id
        if (!target) {
          setBoard(null)
          setGroups([])
          setColumns([])
          setLoading(false)
          return
        }
        // Load the resolved page's board up-front so it renders even on "/" (where
        // pageId is absent), instead of relying on a redirect re-run. Then sync the
        // URL only if this is still the latest in-flight load.
        await loadBoard(target)
        if (!cancelled && loadRequestRef.current === requestId && (!pageId || Number(pageId) !== target)) {
          navigate(`/p/${target}`, { replace: true })
        }
      } catch (err) {
        if (cancelled || loadRequestRef.current !== requestId) return
        if (err?.response) {
          setError(errorMessage(err))
          return
        }
        const cachedPages = offlineStore.readPageList()
        let target = pageId ? Number(pageId) : cachedPages[0]?.id
        if (!cachedPages.find((p) => p.id === target)) target = cachedPages[0]?.id
        const cachedBoard = target ? offlineStore.readBoard(target) : null
        if (cachedPages.length && cachedBoard) {
          setPages(cachedPages)
          applyBoardData(cachedBoard, true)
          setError('')
        } else {
          setError(errorMessage(err))
        }
      } finally {
        if (!cancelled && loadRequestRef.current === requestId) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [pageId, loadPages, loadBoard, navigate, applyBoardData, preferences.restore_last_page])

  // Render columns from the authoritative layout. Folding to fewer columns is
  // display-only and never rewrites a group's logical column, so widening the
  // viewport restores the original spread.
  const layoutMode = pageLayoutMode(board?.page)
  const autoBalance = layoutMode === 'balanced'
  const manualLayout = layoutMode === 'manual'
  const tallestFirst = layoutMode === 'tallest'
  const singleRowOrder = board?.page?.single_row_order || 'natural'
  const isDockerSystemPage = board?.page?.is_system_page
  const filteredGroups = useMemo(() => (
    isDockerSystemPage ? groups.filter((group) => group.bookmarks.length > 0) : groups
  ), [groups, isDockerSystemPage])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(buildColumns(filteredGroups, colCount, autoBalance, singleRowOrder, tallestFirst))
  }, [filteredGroups, colCount, autoBalance, singleRowOrder, tallestFirst])

  useEffect(() => {
    if (board?.page?.id) window.localStorage.setItem('startboard.lastPageId', String(board.page.id))
  }, [board?.page?.id])

  useEffect(() => {
    if (!board?.page?.id || !board?.page?.analytics_enabled || offlineSnapshot || offlineAuth) return
    const viewKey = `page:${board.page.id}`
    if (trackedViewKeyRef.current === viewKey) return
    trackedViewKeyRef.current = viewKey
    pagesAPI.trackView(board.page.id, { session_key: getAnalyticsViewerKey() })
  }, [board?.page?.id, board?.page?.analytics_enabled, offlineSnapshot, offlineAuth])

  useEffect(() => () => {
    if (pagePatchTimerRef.current) window.clearTimeout(pagePatchTimerRef.current)
  }, [])

  const searchShortcutLabel = useMemo(() => {
    const platform = typeof navigator !== 'undefined'
      ? navigator.userAgentData?.platform || navigator.platform || ''
      : ''
    return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘ K' : 'Ctrl K'
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'k') return
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const canEdit = board?.can_edit && !offlineSnapshot && !offlineAuth
  const canManageBookmarks = canEdit && !isDockerSystemPage
  const canCustomizeDockerBookmarkIcons = canEdit && isDockerSystemPage
  const effectiveEditing = editing && canEdit
  const showSearchBar = board?.page?.search_mode === 'show'
    || (board?.page?.search_mode !== 'hide' && preferences.show_search_bar)
  // Group dragging is disabled while auto-balance is on so the stored manual
  // layout is preserved underneath. Bookmark dragging remains available.
  const groupDndEnabled = effectiveEditing && !autoBalance && !tallestFirst && !manualLayout
  const bookmarkDndEnabled = effectiveEditing && !isDockerSystemPage

  // With a fixed card width the grid centres its tracks, so reserving the full
  // colCount of tracks for a sparse board pushes the groups off to one side.
  // In that case (view mode only) drop trailing empty columns so only occupied
  // tracks are centred. While editing we keep every column mounted as a drop
  // target, and with flexible (1fr) widths the empty tracks are harmless.
  const displayColumns = useMemo(() => {
    if (effectiveEditing || !board?.page?.card_max_width) return columns
    let lastUsed = -1
    columns.forEach((col, i) => { if (col.length) lastUsed = i })
    return columns.slice(0, Math.max(lastUsed + 1, 1))
  }, [columns, effectiveEditing, board?.page?.card_max_width])
  // Manual layout renders from these rects: stored positions, seeded spots for
  // groups never placed by hand, and, with overlap prevented, each group nudged
  // clear of the others. The group being dragged follows the pointer freely.
  const preventOverlap = manualLayout && Boolean(board?.page?.prevent_overlap)
  const manualGap = board?.page?.card_gap ?? 12
  const manualGapX = board?.page?.card_gap_x ?? 16
  const manualPositions = useMemo(() => {
    if (!manualLayout) return new Map()
    const cardWidth = Math.min(manualCanvasWidth || MANUAL_CARD_WIDTH, MANUAL_CARD_WIDTH)
    const sizeOf = (group) => manualSizes[group.id]
      || { w: cardWidth, h: estimateManualGroupHeightPx(group) }
    const seeded = seedPositions(groups, sizeOf, {
      width: cardWidth,
      gapX: manualGapX,
      gapY: manualGap,
      canvasWidth: manualCanvasWidth || cardWidth,
    })
    const rects = groups.map((group) => ({
      id: group.id,
      z: Number(group.manual_z) || 0,
      ...(hasStoredPosition(group)
        ? { x: Number(group.manual_x) || 0, y: Number(group.manual_y) || 0 }
        : seeded.get(group.id)),
      ...sizeOf(group),
    }))
    if (!preventOverlap) return new Map(rects.map((rect) => [rect.id, rect]))
    const dragged = rects.find((rect) => rect.id === manualDragGroupId)
    const resolved = resolveOverlaps(rects.filter((rect) => rect !== dragged), manualGap, manualCanvasWidth)
    if (dragged) resolved.set(dragged.id, dragged)
    return resolved
  }, [groups, manualCanvasWidth, manualDragGroupId, manualGap, manualGapX, manualLayout, manualSizes, preventOverlap])
  const manualCanvasHeight = useMemo(() => manualCanvasHeightFor(manualPositions), [manualPositions])

  useEffect(() => {
    manualLayoutRef.current = { positions: manualPositions, preventOverlap, gap: manualGap, canvasWidth: manualCanvasWidth }
  }, [manualCanvasWidth, manualGap, manualPositions, preventOverlap])

  // Measure the canvas and each group card so placement uses real sizes.
  const manualGroupIdsKey = manualLayout ? groups.map((group) => group.id).join(',') : ''
  useEffect(() => {
    const canvas = manualCanvasRef.current
    if (!manualGroupIdsKey || !canvas || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const sizes = {}
      entries.forEach(({ target }) => {
        if (target === canvas) setManualCanvasWidth(canvas.clientWidth)
        else sizes[target.dataset.manualGroupId] = { w: target.offsetWidth, h: target.offsetHeight }
      })
      if (!Object.keys(sizes).length) return
      setManualSizes((current) => {
        const changed = Object.entries(sizes).some(([id, size]) => (
          current[id]?.w !== size.w || current[id]?.h !== size.h
        ))
        return changed ? { ...current, ...sizes } : current
      })
    })
    observer.observe(canvas)
    canvas.querySelectorAll('[data-manual-group-id]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [manualGroupIdsKey])

  const persistColumns = useCallback(async (cols) => {
    try {
      await pagesAPI.reorder(board.page.id, flattenColumns(cols).map((g) => ({
        group_id: g.id,
        column: g.column,
        position: g.position,
        bookmark_ids: g.bookmarks.map((b) => b.id),
      })))
    } catch (err) {
      setError(errorMessage(err))
      loadBoard(board.page.id)
    }
  }, [board, loadBoard])

  const persistGroups = useCallback(async (nextGroups) => {
    try {
      await pagesAPI.reorder(board.page.id, nextGroups.map((g) => ({
        group_id: g.id,
        column: g.column,
        position: g.position,
        bookmark_ids: g.bookmarks.map((b) => b.id),
      })))
    } catch (err) {
      setError(errorMessage(err))
      loadBoard(board.page.id)
    }
  }, [board, loadBoard])

  const patchPage = useCallback((patch) => {
    if (!currentPageId) return
    setBoard((current) => (
      current ? { ...current, page: { ...current.page, ...patch } } : current
    ))
    if (typeof patch.title === 'string') {
      setPages((current) => current.map((page) => (
        page.id === currentPageId ? { ...page, title: patch.title } : page
      )))
    }
    pendingPagePatchRef.current = { ...pendingPagePatchRef.current, ...patch }
    if (pagePatchTimerRef.current) window.clearTimeout(pagePatchTimerRef.current)
    pagePatchTimerRef.current = window.setTimeout(async () => {
      const payload = pendingPagePatchRef.current
      pendingPagePatchRef.current = {}
      pagePatchTimerRef.current = null
      try {
        const updatedPage = await pagesAPI.update(currentPageId, payload)
        setBoard((current) => (
          current ? { ...current, page: { ...current.page, ...updatedPage } } : current
        ))
        setPages((current) => current.map((page) => (
          page.id === updatedPage.id ? { ...page, title: updatedPage.title, slug: updatedPage.slug } : page
        )))
      } catch (err) {
        setError(errorMessage(err))
        await loadBoard(currentPageId)
      }
    }, 180)
  }, [currentPageId, loadBoard])

  const setGroupsManualIfNeeded = useCallback(async (cols, groupIds) => {
    const targets = flattenColumns(cols)
      .filter((group) => groupIds.has(group.id) && group.bookmark_sort !== 'manual')
    if (!targets.length) return
    await Promise.all(targets.map((group) => groupsAPI.update(group.id, { bookmark_sort: 'manual' })))
  }, [])

  const startManualGroupDrag = useCallback((event, group) => {
    if (!effectiveEditing || !manualLayout) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const shown = manualLayoutRef.current?.positions.get(group.id)
    const originX = shown?.x ?? (Number(group.manual_x) || 0)
    const originY = shown?.y ?? (Number(group.manual_y) || 0)
    const nextZ = Math.max(...groupsRef.current.map((item) => Number(item.manual_z) || 0), 0) + 1

    setManualDragGroupId(group.id)
    setGroups((current) => current.map((item) => (
      item.id === group.id ? { ...item, manual_z: nextZ } : item
    )))
    manualDragRef.current = { groupId: group.id, startX, startY, originX, originY, z: nextZ }

    const onMove = (moveEvent) => {
      const drag = manualDragRef.current
      if (!drag || drag.groupId !== group.id) return
      const nextX = Math.max(0, Math.round(drag.originX + (moveEvent.clientX - drag.startX)))
      const nextY = Math.max(0, Math.round(drag.originY + (moveEvent.clientY - drag.startY)))
      setGroups((current) => current.map((item) => (
        item.id === group.id ? { ...item, manual_x: nextX, manual_y: nextY, manual_z: drag.z } : item
      )))
    }

    const onUp = async () => {
      const drag = manualDragRef.current
      manualDragRef.current = null
      setManualDragGroupId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!drag || drag.groupId !== group.id) return
      const target = groupsRef.current.find((item) => item.id === group.id)
      const liveTarget = target && target.id === group.id ? target : null
      const finalGroup = liveTarget || { ...group }
      let finalX = Number(finalGroup.manual_x) || 0
      let finalY = Number(finalGroup.manual_y) || 0
      const layout = manualLayoutRef.current
      const dropped = layout?.positions.get(group.id)
      if (layout?.preventOverlap && dropped) {
        const others = [...layout.positions.values()].filter((rect) => rect.id !== group.id)
        ;({ x: finalX, y: finalY } = findFreeSpot({ ...dropped, x: finalX, y: finalY }, others, layout.gap, layout.canvasWidth))
        setGroups((current) => current.map((item) => (
          item.id === group.id ? { ...item, manual_x: finalX, manual_y: finalY } : item
        )))
      }
      try {
        await groupsAPI.update(group.id, {
          manual_x: finalX,
          manual_y: finalY,
          manual_z: drag.z,
        })
      } catch (err) {
        setError(errorMessage(err))
        loadBoard(board.page.id)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }, [board?.page?.id, effectiveEditing, loadBoard, manualLayout])

  // ---- drag handlers ----
  const onDragStart = ({ active }) => {
    const type = active.data.current?.type
    if (type !== 'bookmark') {
      dragStartRef.current = null
      return
    }
    const loc = findBookmark(columns, numId(active.id))
    dragStartRef.current = loc ? { columnIndex: loc[0], groupIndex: loc[1], bookmarkIndex: loc[2] } : null
  }

  const onDragOver = ({ active, over }) => {
    if (!over) return
    const type = active.data.current?.type
    const overType = over.data.current?.type

    if (type === 'group') {
      setColumns((prev) => {
        const loc = findGroup(prev, numId(active.id))
        if (!loc) return prev
        const [ci, gi] = loc
        let toCi
        if (overType === 'group') { const o = findGroup(prev, numId(over.id)); toCi = o ? o[0] : ci }
        else if (overType === 'column') toCi = over.data.current.index
        else if (overType === 'bookmark') { const o = findBookmark(prev, numId(over.id)); toCi = o ? o[0] : ci }
        else if (overType === 'group-drop') { const o = findGroup(prev, over.data.current.groupId); toCi = o ? o[0] : ci }
        else return prev
        if (toCi === ci) return prev
        const next = prev.map((c) => [...c])
        const [moving] = next[ci].splice(gi, 1)
        let at = next[toCi].length
        if (overType === 'group') { const oi = next[toCi].findIndex((g) => g.id === numId(over.id)); if (oi >= 0) at = oi }
        next[toCi].splice(at, 0, moving)
        return next
      })
      return
    }

    if (type === 'bookmark') {
      setColumns((prev) => {
        const loc = findBookmark(prev, numId(active.id))
        if (!loc) return prev
        const [ci, gi, bi] = loc
        let target
        if (overType === 'bookmark') { const o = findBookmark(prev, numId(over.id)); if (o) target = [o[0], o[1]] }
        else if (overType === 'group-drop') target = findGroup(prev, over.data.current.groupId)
        else if (overType === 'group') target = findGroup(prev, numId(over.id))
        if (!target) return prev
        const [tci, tgi] = target
        if (tci === ci && tgi === gi) return prev
        const next = prev.map((c) => c.map((g) => ({ ...g, bookmarks: [...g.bookmarks] })))
        const [moving] = next[ci][gi].bookmarks.splice(bi, 1)
        let at = next[tci][tgi].bookmarks.length
        if (overType === 'bookmark') { const oi = next[tci][tgi].bookmarks.findIndex((b) => b.id === numId(over.id)); if (oi >= 0) at = oi }
        next[tci][tgi].bookmarks.splice(at, 0, moving)
        return next
      })
    }
  }

  const onDragEnd = async ({ active, over }) => {
    if (!over) { dragStartRef.current = null; persistColumns(columns); return }
    const type = active.data.current?.type
    const overType = over.data.current?.type

    if (type === 'group') {
      const loc = findGroup(columns, numId(active.id))
      let next = columns
      if (loc && overType === 'group') {
        const o = findGroup(columns, numId(over.id))
        if (o && o[0] === loc[0] && o[1] !== loc[1]) {
          next = columns.map((c) => [...c])
          next[loc[0]] = arrayMove(next[loc[0]], loc[1], o[1])
        }
      }
      setColumns(next)
      setGroups(flattenColumns(next))
      dragStartRef.current = null
      persistColumns(next)
      return
    }
    if (type === 'bookmark') {
      const startLoc = dragStartRef.current
      const originalGroupId = active.data.current?.bookmark?.group_id
      const loc = findBookmark(columns, numId(active.id))
      let next = columns
      let manualGroupIds = new Set()
      if (loc && overType === 'bookmark') {
        const o = findBookmark(columns, numId(over.id))
        if (o && o[0] === loc[0] && o[1] === loc[1] && o[2] !== loc[2]) {
          next = columns.map((c) => c.map((g) => ({ ...g, bookmarks: [...g.bookmarks] })))
          next[loc[0]][loc[1]].bookmarks = arrayMove(next[loc[0]][loc[1]].bookmarks, loc[2], o[2])
        }
      }
      const finalLoc = findBookmark(next, numId(active.id))
      if (finalLoc) {
        const targetGroup = next[finalLoc[0]]?.[finalLoc[1]]
        const targetGroupId = targetGroup?.id
        if (targetGroupId != null) {
          if (startLoc && finalLoc[0] === startLoc.columnIndex && finalLoc[1] === startLoc.groupIndex) {
            if (finalLoc[2] !== startLoc.bookmarkIndex) manualGroupIds.add(targetGroupId)
          } else if (originalGroupId != null) {
            manualGroupIds.add(targetGroupId)
          }
        }
      }
      if (manualGroupIds.size) {
        next = next.map((col) => col.map((group) => (
          manualGroupIds.has(group.id) ? { ...group, bookmark_sort: 'manual' } : group
        )))
      }
      const nextGroups = mergeBookmarksIntoGroups(groups, next).map((group) => (
        manualGroupIds.has(group.id) ? { ...group, bookmark_sort: 'manual' } : group
      ))
      setColumns(next)
      setGroups(nextGroups)
      await setGroupsManualIfNeeded(next, manualGroupIds)
      dragStartRef.current = null
      persistGroups(nextGroups)
    }
  }

  // ---- mutations ----
  const addPage = () => setPrompt({
    title: 'New page', fieldLabel: 'Page name',
    onSubmit: async (name) => { const p = await pagesAPI.create(name); await loadPages(); navigate(`/p/${p.id}`) },
  })
  const openPageSettings = useCallback(async (page = null) => {
    const targetId = page?.id ?? board?.page?.id
    if (!targetId) return
    if (board?.page?.id === targetId) {
      setSettingsState({ page: board.page, groups })
      setSettingsOpen(true)
      return
    }
    const data = await pagesAPI.get(targetId)
    setSettingsState({ page: data.page, groups: data.groups })
    setSettingsOpen(true)
  }, [board, groups])
  const openAddGroup = () => setGroupModal({ group: null })
  const renameGroup = (group) => setGroupModal({ group })
  const copyGroup = async (group) => {
    await groupsAPI.duplicate(group.id)
    await loadBoard(board.page.id)
  }
  const moveGroup = (group) => {
    setMoveGroupError('')
    setMoveGroupModal({ group, destinationPageId: null })
  }
  const setBookmarkSort = async (group, bookmark_sort) => {
    await groupsAPI.update(group.id, { bookmark_sort })
    await loadBoard(board.page.id)
  }
  const deleteGroup = async (group) => {
    const n = group.bookmarks?.length ?? 0
    const detail = n > 0 ? `${n} bookmark${n === 1 ? '' : 's'} inside it` : 'an empty group'
    if (!window.confirm(
      `⚠️ Delete the group “${group.title}”?\n\n` +
      `This permanently removes the group and ${detail}. This cannot be undone.`
    )) return
    await groupsAPI.remove(group.id)
    await loadBoard(board.page.id)
  }
  const saveGroup = async (data) => {
    if (groupModal?.group) await groupsAPI.update(groupModal.group.id, data)
    else await groupsAPI.create(board.page.id, data)
    setGroupModal(null)
    await loadBoard(board.page.id)
  }
  const deleteGroupFromModal = async () => {
    await groupsAPI.remove(groupModal.group.id)
    setGroupModal(null)
    await loadBoard(board.page.id)
  }
  const saveBookmark = async (data) => {
    if (bookmarkModal.managedIcon) {
      await bookmarksAPI.updateIconOverride(bookmarkModal.bookmark.id, data.icon_url)
      await loadBoard(board.page.id)
      return
    }
    if (bookmarkModal.bookmark) await bookmarksAPI.update(bookmarkModal.bookmark.id, data)
    else await bookmarksAPI.create(bookmarkModal.group.id, data)
    await loadBoard(board.page.id)
  }
  const deleteBookmark = async () => {
    await bookmarksAPI.remove(bookmarkModal.bookmark.id)
    setBookmarkModal(null)
    await loadBoard(board.page.id)
  }
  const deleteBookmarkDirect = async (bookmark) => {
    await bookmarksAPI.remove(bookmark.id)
    await loadBoard(board.page.id)
  }
  const shareBookmark = async (bookmark) => {
    const recipient = window.prompt('Share bookmark with which username or email?')
    if (!recipient?.trim()) return
    await bookmarksAPI.share(bookmark.id, { recipient: recipient.trim() })
  }
  const duplicateBookmark = async (bookmark) => {
    await bookmarksAPI.duplicate(bookmark.id)
    await loadBoard(board.page.id)
  }
  const moveBookmarkToEdge = async (bookmark, edge) => {
    await bookmarksAPI.moveToEdge(bookmark.id, edge)
    await loadBoard(board.page.id)
  }
  const copyBookmarkLink = async (bookmark) => {
    if (!isBookmarkLaunchable(bookmark)) return
    await navigator.clipboard?.writeText(bookmark.url)
  }
  const copyDockerBookmark = async (groupId) => {
    if (!dockerCopyBookmark?.source_ref) return
    setDockerCopyBusy(true)
    try {
      await adminAPI.copyDockerSystemWorkload(dockerCopyBookmark.source_ref, groupId)
      setDockerCopyBookmark(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDockerCopyBusy(false)
    }
  }
  const openDockerCopy = async (bookmark) => {
    setDockerCopyBookmark(bookmark)
    setDockerCopyDestinations([])
    try {
      const destinationBoards = await Promise.all(
        pages.filter((page) => !page.is_system_page).map((page) => pagesAPI.get(page.id)),
      )
      setDockerCopyDestinations(destinationBoards.map((data) => ({ ...data.page, groups: data.groups })))
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  const copyPageShareLink = async (page) => {
    if (!page?.share_id) return
    const slug = page.slug || 'page'
    await navigator.clipboard?.writeText(`${window.location.origin}/s/${page.share_id}/${slug}`)
  }
  const sharePage = async (page) => {
    if (!page?.id) return
    const result = await pagesAPI.share(page.id)
    await loadPages()
    if (board?.page?.id === page.id) await loadBoard(page.id)
    await copyPageShareLink({ ...page, share_id: result.share_id })
  }
  const unsharePage = async (page) => {
    if (!page?.id) return
    await pagesAPI.unshare(page.id)
    await loadPages()
    if (board?.page?.id === page.id) await loadBoard(page.id)
  }
  const trackBookmarkOpen = (bookmark) => {
    if (!board?.page?.id || !board?.page?.analytics_enabled || !bookmark?.id) return
    pagesAPI.trackClick(board.page.id, bookmark.id, { session_key: getAnalyticsViewerKey() })
  }
  const openAllInTabs = (group) => {
    const bookmarks = (group.visible_limit > 0 ? group.bookmarks.slice(0, group.visible_limit) : group.bookmarks)
      .filter((bookmark) => isBookmarkLaunchable(bookmark))
    bookmarks.forEach((bookmark) => {
      trackBookmarkOpen(bookmark)
      window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    })
  }
  const openBookmarkManager = (group) => setBookmarkManagerGroup(group)

  // Right-clicking blank board space while a slideshow background is active offers
  // a manual "Show next image"; otherwise the native context menu is left alone.
  const onBoardContextMenu = (event) => {
    if (!isSlideshowActive(board?.page)) return
    event.preventDefault()
    setBoardMenu({ x: event.clientX, y: event.clientY })
  }
  const showNextBackground = () => {
    setBgAdvance((value) => value + 1)
    setBgRefreshToken(Date.now())
  }

  const submitMoveGroup = async () => {
    if (!moveGroupModal?.destinationPageId) return
    setMoveGroupBusy(true)
    setMoveGroupError('')
    try {
      await groupsAPI.update(moveGroupModal.group.id, { page_id: moveGroupModal.destinationPageId })
      setMoveGroupModal(null)
      await loadPages()
      await loadBoard(board.page.id)
    } catch (err) {
      setMoveGroupError(errorMessage(err))
      setMoveGroupBusy(false)
      return
    }
    setMoveGroupBusy(false)
  }

  const handlers = {
    onOpenBookmark: trackBookmarkOpen,
    onEditBookmark: (group, b) => setBookmarkModal({ group, bookmark: b }),
    onChangeBookmarkIcon: (group, b) => setBookmarkModal({ group, bookmark: b, focusIcon: true, managedIcon: isDockerSystemPage }),
    onAddBookmark: (group) => setBookmarkModal({ group, bookmark: null }),
    onEditBookmarks: openBookmarkManager,
    onOpenAll: openAllInTabs,
    onRenameGroup: renameGroup,
    onCopyGroup: copyGroup,
    onMoveGroup: moveGroup,
    onSetBookmarkSort: setBookmarkSort,
    onDeleteGroup: deleteGroup,
    onDuplicateBookmark: duplicateBookmark,
    onMoveBookmark: (bookmark) => {
      const group = groups.find((item) => item.id === bookmark.group_id)
      setBookmarkModal({ group, bookmark })
    },
    onCopyBookmarkLink: copyBookmarkLink,
    onCopyBookmarkToPage: openDockerCopy,
    onMoveBookmarkTop: (bookmark) => moveBookmarkToEdge(bookmark, 'top'),
    onMoveBookmarkBottom: (bookmark) => moveBookmarkToEdge(bookmark, 'bottom'),
    onDeleteBookmark: deleteBookmarkDirect,
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  return (
    <div
      className="flex h-full flex-col"
      style={{
        '--color-accent': board?.page?.accent || undefined,
        '--color-accent-dark': board?.page?.accent
          ? `color-mix(in oklab, ${board.page.accent} 82%, black)`
          : undefined,
      }}
    >
      <TopBar
        pages={pages}
        currentPageId={currentPageId}
        currentPage={board?.page}
        onSelectPage={(id) => navigate(`/p/${id}`)}
        onAddPage={addPage}
        onReorderPages={reorderPages}
        editing={effectiveEditing}
        onToggleEdit={() => setEditing((e) => !e)}
        canEdit={canEdit}
        onOpenSettings={() => openPageSettings(board?.page)}
        onOpenPageSettings={openPageSettings}
        onSharePage={sharePage}
        onUnsharePage={unsharePage}
        onCopyPageShareLink={copyPageShareLink}
        onAddGroup={openAddGroup}
        canAddGroup={!isDockerSystemPage}
        onPatchPage={patchPage}
        showSearch={showSearchBar}
        onOpenSearch={() => setSearchOpen(true)}
        searchShortcutLabel={searchShortcutLabel}
      />

      {(offlineSnapshot || offlineAuth) && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Offline mode: showing your last saved snapshot. Editing is disabled until the server is reachable again.
        </div>
      )}
      {error && <div className="bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}

      {!board ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <p>No pages yet.</p>
          <button className={btnPrimary} onClick={addPage}>Create your first page</button>
        </div>
      ) : (
        <main
          className="flex-1 overflow-auto p-4 sm:p-5"
          onContextMenu={onBoardContextMenu}
          style={{
            backgroundColor: board.page.bg_image_mode === 'solid' ? (board.page.bg_color || undefined) : undefined,
            backgroundImage: backgroundImageUrl(board.page, bgRefreshToken, bgAdvance) ? `url(${backgroundImageUrl(board.page, bgRefreshToken, bgAdvance)})` : undefined,
            backgroundPosition: backgroundPositionForPage(board.page.bg_image_position),
            backgroundRepeat: 'no-repeat',
            backgroundSize: board.page.bg_image_fit === 'fill'
              ? '100% 100%'
              : (board.page.bg_image_fit === 'contain' || board.page.bg_image_fit === 'scale-down' ? 'contain' : 'cover'),
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            {filteredGroups.length === 0 ? (
              <div className="flex min-h-[42vh] items-center justify-center">
                <div className="w-full max-w-lg rounded-3xl border border-dashed border-white/10 bg-white/3 px-6 py-10 text-center">
                  <h2 className="text-lg font-semibold text-white">{isDockerSystemPage ? 'No Docker workloads reported' : 'No groups on this page yet'}</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {isDockerSystemPage
                      ? 'Docker will add workloads here when it reports them.'
                      : 'Create your first group to start organizing bookmarks on this page.'}
                  </p>
                  {canEdit && !isDockerSystemPage && (
                    <div className="mt-5">
                      <button className={btnPrimary} onClick={openAddGroup}>
                        <Plus className="h-4 w-4" />
                        <span>Add group</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : manualLayout ? (
              <div ref={manualCanvasRef} className="relative min-h-[42vh]" style={{ minHeight: `${manualCanvasHeight}px` }}>
                {groups.map((group) => (
                  <div
                    key={group.id}
                    data-manual-group-id={group.id}
                    className="absolute w-full max-w-[min(100%,420px)]"
                    style={{
                      left: `${manualPositions.get(group.id)?.x ?? 0}px`,
                      top: `${manualPositions.get(group.id)?.y ?? 0}px`,
                      zIndex: Number(group.manual_z) || 0,
                    }}
                  >
                    <BoardColumn
                      index={group.column ?? 0}
                      groups={[group]}
                      editing={effectiveEditing}
                      canManage={canManageBookmarks}
                      canCustomizeBookmarkIcons={canCustomizeDockerBookmarkIcons}
                      managedGroup={isDockerSystemPage && canEdit}
                      groupDndEnabled={false}
                      manualDragEnabled={effectiveEditing}
                      activeManualDragGroupId={manualDragGroupId}
                      onManualDragStart={startManualGroupDrag}
                      bookmarkDndEnabled={bookmarkDndEnabled}
                      openNewTab={board.page.open_new_tab}
                      showWebsiteIcons={preferences.show_website_icons}
                      cardGap={board.page.card_gap}
                      bookmarkGap={board.page.bookmark_gap}
                      pageTitleColor={board.page.bookmark_title_color}
                      pageIconColor={board.page.icon_color || settings.icon_color || ''}
                      handlers={handlers}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid items-start"
                style={{
                  gridTemplateColumns: `repeat(${displayColumns.length || colCount}, minmax(0, ${board.page.card_max_width ? `${board.page.card_max_width}px` : '1fr'}))`,
                  columnGap: `${board.page.card_gap_x ?? 16}px`,
                  rowGap: `${board.page.card_gap ?? 12}px`,
                  justifyContent: GROUP_ALIGN_JUSTIFY[board.page.group_align] || 'center',
                }}
              >
                {displayColumns.map((col, i) => (
                  <BoardColumn
                    key={i}
                    index={i}
                    groups={col}
                    editing={effectiveEditing}
                    canManage={canManageBookmarks}
                    canCustomizeBookmarkIcons={canCustomizeDockerBookmarkIcons}
                    managedGroup={isDockerSystemPage && canEdit}
                    groupDndEnabled={groupDndEnabled}
                    bookmarkDndEnabled={bookmarkDndEnabled}
                    openNewTab={board.page.open_new_tab}
                    showWebsiteIcons={preferences.show_website_icons}
                    cardGap={board.page.card_gap}
                    bookmarkGap={board.page.bookmark_gap}
                    pageTitleColor={board.page.bookmark_title_color}
                    pageIconColor={board.page.icon_color || settings.icon_color || ''}
                    handlers={handlers}
                  />
                ))}
              </div>
            )}
          </DndContext>
        </main>
      )}

      <ContextMenu
        open={!!boardMenu}
        position={boardMenu}
        items={boardMenu ? [{
          key: 'next-bg',
          label: 'Show next image',
          icon: ImageIcon,
          onClick: showNextBackground,
        }] : []}
        onClose={() => setBoardMenu(null)}
      />

      <SearchPalette
        open={searchOpen}
        groups={groups}
        openNewTab={board?.page?.open_new_tab}
        shortcutLabel={searchShortcutLabel}
        onOpenBookmark={trackBookmarkOpen}
        onClose={() => setSearchOpen(false)}
      />

      {bookmarkModal && (
        <BookmarkModal
          bookmark={bookmarkModal.bookmark}
          groups={groups}
          pages={pages}
          currentPageId={currentPageId}
          currentGroupId={bookmarkModal.group?.id ?? bookmarkModal.bookmark?.group_id ?? null}
          focusIcon={bookmarkModal.focusIcon || false}
          managedIcon={bookmarkModal.managedIcon || false}
          onSave={saveBookmark}
          onDelete={deleteBookmark}
          onClose={() => setBookmarkModal(null)}
        />
      )}
      {bookmarkManagerGroup && (
        <GroupBookmarkManagerModal
          group={groups.find((item) => item.id === bookmarkManagerGroup.id) || bookmarkManagerGroup}
          onAdd={(group, url) => bookmarksAPI.create(group.id, { url }).then(() => loadBoard(board.page.id))}
          onEdit={(group, bookmark) => setBookmarkModal({ group, bookmark })}
          onShare={shareBookmark}
          onDelete={async (bookmark) => { await deleteBookmarkDirect(bookmark) }}
          onClose={() => setBookmarkManagerGroup(null)}
        />
      )}
      {groupModal && (
        <GroupModal
          group={groupModal.group}
          onSave={saveGroup}
          onDelete={isDockerSystemPage ? undefined : deleteGroupFromModal}
          onClose={() => setGroupModal(null)}
        />
      )}
      {settingsOpen && settingsState && (
        <PageSettingsModal
          page={settingsState.page}
          groups={settingsState.groups}
          onClose={() => {
            setSettingsOpen(false)
            setSettingsState(null)
          }}
          onSaved={async () => {
            await loadPages()
            if (board?.page?.id === settingsState.page.id) await loadBoard(board.page.id)
          }}
          onDeleted={async () => {
            const list = await loadPages()
            if (board?.page?.id === settingsState.page.id) {
              navigate(list[0] ? `/p/${list[0].id}` : '/')
            }
            setSettingsOpen(false)
            setSettingsState(null)
          }}
        />
      )}
      {moveGroupModal && (
        <MoveGroupModal
          group={moveGroupModal.group}
          pages={pages}
          currentPageId={board.page.id}
          destinationPageId={moveGroupModal.destinationPageId}
          setDestinationPageId={(destinationPageId) => setMoveGroupModal((current) => ({ ...current, destinationPageId }))}
          onClose={() => { setMoveGroupModal(null); setMoveGroupBusy(false); setMoveGroupError('') }}
          onSubmit={submitMoveGroup}
          busy={moveGroupBusy}
          error={moveGroupError}
        />
      )}
      {prompt && (
        <TextPromptModal
          title={prompt.title}
          fieldLabel={prompt.fieldLabel}
          initial={prompt.initial}
          onSubmit={prompt.onSubmit}
          onClose={() => setPrompt(null)}
        />
      )}
      {dockerCopyBookmark && (
        <CopyDockerBookmarkModal
          key={dockerCopyDestinations.map((page) => page.id).join(',')}
          bookmark={dockerCopyBookmark}
          pages={dockerCopyDestinations}
          onCopy={copyDockerBookmark}
          onClose={() => setDockerCopyBookmark(null)}
          busy={dockerCopyBusy}
        />
      )}
    </div>
  )
}

function backgroundPositionForPage(position) {
  if (position === 'north') return 'center top'
  if (position === 'south') return 'center bottom'
  if (position === 'east') return 'right center'
  if (position === 'west') return 'left center'
  if (position === 'northwest') return 'left top'
  if (position === 'northeast') return 'right top'
  if (position === 'southwest') return 'left bottom'
  if (position === 'southeast') return 'right bottom'
  return 'center'
}
