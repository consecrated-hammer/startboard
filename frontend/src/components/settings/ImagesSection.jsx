import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Heart, ImagePlus, RefreshCcw, Search, Trash2 } from 'lucide-react'
import { imagesAPI, pagesAPI, errorMessage } from '../../services/api.js'
import { SettingsFootnote, SettingsGroup, SettingsSection } from './SettingsKit.jsx'
import { btnSecondary } from '../ui.js'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'single', label: 'Single' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'unassigned', label: 'Unassigned' },
]

const ASSIGNMENT_MENU_CLOSE_MS = 140

export default function ImagesSection() {
  const [images, setImages] = useState([])
  const [pages, setPages] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [assignmentMenu, setAssignmentMenu] = useState(null)
  const menuRef = useRef(null)
  const closeTimerRef = useRef(null)
  const deleteButtonClass = `${btnSecondary} border-red-800/70 bg-red-950/55 text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-red-700/75 hover:bg-red-900/45 hover:text-white`

  const load = useCallback(async () => {
    const [catalog, nextStats] = await Promise.all([imagesAPI.catalog(), imagesAPI.stats()])
    setImages(catalog.images || [])
    setPages(catalog.pages || [])
    setStats(nextStats)
  }, [])

  const closeAssignmentMenu = useCallback(() => {
    setAssignmentMenu((current) => {
      if (!current) return null
      if (current.closing) return current
      return { ...current, closing: true }
    })
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setAssignmentMenu(null)
      closeTimerRef.current = null
    }, ASSIGNMENT_MENU_CLOSE_MS)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((err) => setError(errorMessage(err)))
  }, [load])

  useEffect(() => {
    if (!assignmentMenu) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) closeAssignmentMenu()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [assignmentMenu, closeAssignmentMenu])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  const onUpload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await imagesAPI.upload(files)
      const uploaded = result?.uploaded?.length || 0
      const duplicates = result?.duplicates?.length || 0
      const failed = result?.failed?.length || 0
      setNotice(
        [
          uploaded ? `${uploaded} uploaded` : null,
          duplicates ? `${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : null,
          failed ? `${failed} failed` : null,
        ].filter(Boolean).join(' · ') || 'Upload complete',
      )
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  const removeImage = async (image) => {
    if (!window.confirm(`Delete image "${image.original_name}"? This cannot be undone.`)) return
    await imagesAPI.remove(image.id)
    await load()
  }

  const setAssignment = async (imageId, pageId, mode) => {
    closeAssignmentMenu()
    try {
      await imagesAPI.setAssignment(imageId, pageId, mode)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const toggleFavourite = async (image) => {
    try {
      await imagesAPI.update(image.id, { favourite: !image.favourite })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const toggleAssignmentMenu = (imageId, pageId) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setAssignmentMenu((current) => (
      current?.imageId === imageId && current?.pageId === pageId
        ? null
        : { imageId, pageId, closing: false }
    ))
  }

  const pageAssignments = useMemo(() => {
    const byPage = new Map()
    for (const image of images) {
      for (const allocation of image.allocations || []) {
        const entry = byPage.get(allocation.page_id) || { singleImageId: null, rotationImageIds: [] }
        if (allocation.mode === 'single') entry.singleImageId = image.id
        if (allocation.mode === 'rotation' && !entry.rotationImageIds.includes(image.id)) entry.rotationImageIds.push(image.id)
        byPage.set(allocation.page_id, entry)
      }
    }
    return byPage
  }, [images])

  const updatePageMode = async (page, nextMode) => {
    setBusy(true)
    setError('')
    try {
      const assignments = pageAssignments.get(page.id) || { singleImageId: null, rotationImageIds: [] }
      const patch = nextMode === 'external'
        ? { bg_image_mode: 'external', bg_managed_image_id: null }
        : nextMode === 'managed_single'
          ? { bg_image_mode: 'managed_single', bg_managed_image_id: assignments.singleImageId }
          : { bg_image_mode: 'managed_rotation', bg_managed_image_id: assignments.rotationImageIds[0] || null }
      await pagesAPI.update(page.id, patch)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const facets = useMemo(() => {
    const next = { all: images.length, favourites: 0, single: 0, rotation: 0, unassigned: 0 }
    for (const image of images) {
      const states = image.allocations || []
      if (image.favourite) next.favourites += 1
      if (states.some((allocation) => allocation.mode === 'single')) next.single += 1
      if (states.some((allocation) => allocation.mode === 'rotation')) next.rotation += 1
      if (!states.length) next.unassigned += 1
    }
    return next
  }, [images])

  const filteredImages = useMemo(() => {
    const q = query.trim().toLowerCase()
    return images.filter((image) => {
      const allocations = image.allocations || []
      if (activeFilter === 'favourites' && !image.favourite) return false
      if (activeFilter === 'single' && !allocations.some((allocation) => allocation.mode === 'single')) return false
      if (activeFilter === 'rotation' && !allocations.some((allocation) => allocation.mode === 'rotation')) return false
      if (activeFilter === 'unassigned' && allocations.length) return false
      if (!q) return true
      return image.original_name.toLowerCase().includes(q)
        || `${image.width || ''}x${image.height || ''}`.includes(q)
        || allocations.some((allocation) => allocation.page_title.toLowerCase().includes(q))
        || pages.some((page) => page.title.toLowerCase().includes(q))
    })
  }, [activeFilter, images, pages, query])

  return (
    <SettingsSection
      title="Managed Images"
      description="Assign images directly to pages as single backgrounds or rotation members."
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {notice && <div className="mb-3 text-sm text-emerald-300">{notice}</div>}

      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="mb-3 px-1">
          <div className="text-sm font-semibold text-white">Page background modes</div>
        </div>
        <div className="grid gap-2 xl:grid-cols-2">
          {pages.map((page) => (
            <div key={`mode-${page.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2">
              <div className="min-w-0 truncate pr-2 text-sm font-medium text-white">{page.title}</div>
              <div className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
                <ModeButton
                  active={page.bg_image_mode === 'external' || page.bg_image_mode === 'solid'}
                  label="No image"
                  onClick={() => updatePageMode(page, 'external')}
                />
                <ModeButton
                  active={page.bg_image_mode === 'managed_single'}
                  label="Single"
                  onClick={() => updatePageMode(page, 'managed_single')}
                />
                <ModeButton
                  active={page.bg_image_mode === 'managed_rotation'}
                  label="Rotation"
                  onClick={() => updatePageMode(page, 'managed_rotation')}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className={btnSecondary}>
          <ImagePlus className="h-4 w-4" />
          <span>{busy ? 'Uploading…' : 'Upload images'}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} disabled={busy} />
        </label>
        <button className={btnSecondary} onClick={() => imagesAPI.clearCache().then(load).catch((err) => setError(errorMessage(err)))}>
          <RefreshCcw className="h-4 w-4" />
          <span>Clear render cache</span>
        </button>
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search images or page assignments"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              active={activeFilter === filter.id}
              label={filter.label}
              count={facets[filter.id] || 0}
              onClick={() => setActiveFilter(filter.id)}
            />
          ))}
        </div>
      </div>

      {stats && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-300">
          <SummaryPill label="Images" value={stats.image_count} />
          <SummaryPill label="Cached variants" value={stats.variant_count} />
          <SummaryPill label="Original size" value={formatBytes(stats.total_original_size)} />
          <SummaryPill label="Variant cache" value={formatBytes(stats.total_variant_size)} />
        </div>
      )}

      <SettingsGroup className="overflow-visible">
        {filteredImages.map((image) => (
          <div
            key={image.id}
            className={`grid gap-4 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-start ${
              assignmentMenu?.imageId === image.id ? 'relative z-20' : 'relative z-0'
            }`}
          >
            <div className="relative min-w-0">
              <img
                src={imagesAPI.originalUrl(image.id)}
                alt={image.original_name}
                className="h-28 w-full rounded-xl object-cover"
              />
              <button
                type="button"
                className={`absolute left-2 top-2 inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 backdrop-blur-sm transition ${
                  image.favourite
                    ? 'bg-slate-950/72 text-amber-200 shadow-[0_10px_24px_rgba(15,23,42,0.34)] hover:bg-slate-950/82'
                    : 'bg-slate-950/58 text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.28)] hover:bg-slate-950/74 hover:text-white'
                }`}
                onClick={() => toggleFavourite(image)}
                aria-label={image.favourite ? 'Remove favourite' : 'Mark favourite'}
                title={image.favourite ? 'Favourite' : 'Mark favourite'}
              >
                <Heart className={`h-4 w-4 ${image.favourite ? 'fill-current' : ''}`} />
              </button>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{image.original_name}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {image.width || '?'}×{image.height || '?'} · {formatBytes(image.file_size || 0)}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-2">
                {pages.map((page) => {
                  const pageState = resolvePageAssignmentState(page, image.id, image.allocations || [])
                  return (
                    <div key={`${image.id}-${page.id}`} className="relative">
                      <button
                        type="button"
                        onClick={() => toggleAssignmentMenu(image.id, page.id)}
                        className={pageChipClass(pageState)}
                      >
                        <span className="truncate">{page.title}</span>
                        {pageState.currentMode === 'single' && (
                          <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.16em] text-sky-950">
                            SINGLE
                          </span>
                        )}
                        {pageState.currentMode === 'rotation' && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.16em] text-emerald-950">
                            ROTATE
                          </span>
                        )}
                      </button>
                      {assignmentMenu?.imageId === image.id && assignmentMenu?.pageId === page.id && (
                        <div
                          ref={menuRef}
                          className={`absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-48 rounded-xl border border-white/10 bg-slate-950/96 p-1.5 shadow-[0_18px_40px_rgba(2,8,23,0.55)] transition duration-150 ease-out ${
                            assignmentMenu.closing
                              ? 'pointer-events-none translate-y-1 opacity-0'
                              : 'translate-y-0 opacity-100'
                          }`}
                        >
                          {(page.bg_image_mode === 'external' || page.bg_image_mode === 'solid') && (
                            <div className="px-3 py-2 text-sm text-slate-400">
                              Choose Single or Rotation above first.
                            </div>
                          )}
                          {page.bg_image_mode === 'managed_single' && (
                            <>
                              <AssignmentOption
                                active={!pageState.isAssignedInCurrentMode}
                                label="Leave unassigned"
                                onClick={() => setAssignment(image.id, page.id, 'off')}
                              />
                              <AssignmentOption
                                active={pageState.isAssignedInCurrentMode}
                                label="Set as single background"
                                onClick={() => setAssignment(image.id, page.id, 'single')}
                              />
                            </>
                          )}
                          {page.bg_image_mode === 'managed_rotation' && (
                            <>
                              <AssignmentOption
                                active={!pageState.isAssignedInCurrentMode}
                                label="Leave out of rotation"
                                onClick={() => setAssignment(image.id, page.id, 'off')}
                              />
                              <AssignmentOption
                                active={pageState.isAssignedInCurrentMode}
                                label="Include in rotation"
                                onClick={() => setAssignment(image.id, page.id, 'rotation')}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
              <button
                className={deleteButtonClass}
                onClick={() => removeImage(image).catch((err) => setError(errorMessage(err)))}
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete image</span>
              </button>
            </div>
          </div>
        ))}

        {filteredImages.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-400">
            {images.length === 0 ? 'No managed images uploaded yet.' : 'No images match the current filters.'}
          </div>
        )}
      </SettingsGroup>

      <SettingsFootnote>
        Page modes are controlled above. In the image list, each chip only manages whether that image participates in the selected mode for that page.
      </SettingsFootnote>
    </SettingsSection>
  )
}

function formatBytes(value) {
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function FilterChip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? 'border-accent/35 bg-accent/15 text-white'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/10 text-white' : 'bg-slate-900/70 text-slate-400'}`}>
        {count}
      </span>
    </button>
  )
}

function SummaryPill({ label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}

function AssignmentOption({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition ${
        active ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/6'
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-white/10 text-white' : 'text-transparent'}`}>
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

function ModeButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
        active
          ? 'bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'text-slate-400 hover:bg-white/6 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function pageChipClass(pageState) {
  if (pageState.currentMode === 'single') return 'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-100/85 bg-sky-500/36 px-2.5 py-1 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:bg-sky-500/46'
  if (pageState.currentMode === 'rotation') return 'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-100/80 bg-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-emerald-500/40'
  return 'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10'
}

function resolvePageAssignmentState(page, imageId, allocations) {
  const pageAllocations = allocations.filter((item) => item.page_id === page.id)
  const hasSingle = pageAllocations.some((item) => item.mode === 'single')
  const hasRotation = pageAllocations.some((item) => item.mode === 'rotation')
  const pageMode = page.bg_image_mode
  const currentMode = pageMode === 'managed_single'
    ? (hasSingle ? 'single' : null)
    : pageMode === 'managed_rotation'
      ? (hasRotation ? 'rotation' : null)
      : null
  return {
    pageMode,
    currentMode,
    hasSingle,
    hasRotation,
    isAssignedInCurrentMode: currentMode !== null,
    imageId,
  }
}
