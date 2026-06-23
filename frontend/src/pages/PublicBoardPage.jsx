import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleAlert, CircleCheckBig, CircleHelp, CircleX, ExternalLink, Search, Settings2 } from 'lucide-react'
import { useAppState } from '../context/AppStateContext.jsx'
import { offlineStore } from '../services/offline.js'
import { errorMessage, publicAPI } from '../services/api.js'
import Favicon from '../components/Favicon.jsx'
import Spinner from '../components/Spinner.jsx'
import Modal from '../components/Modal.jsx'
import { btnPrimary, btnSecondary, input } from '../components/ui.js'
import { SettingsGroup, SettingsRow, RangeField, Toggle, ColorField, SettingsSection } from '../components/settings/SettingsKit.jsx'
import useColumnCount from '../hooks/useColumnCount.js'
import { bookmarkDisplayUrl, isBookmarkLaunchable, openBookmark } from '../lib/bookmarkLinks.js'
import { getAnalyticsViewerKey } from '../lib/analytics.js'

const VIEWER_OVERRIDE_KEY = (shareId) => `startboard.public.viewer.${shareId}`

const DEFAULT_VIEWER_OVERRIDES = {
  bg_color: null,
  bg_image: null,
  accent: null,
  max_cols: null,
  auto_balance: null,
  single_row_order: null,
  card_max_width: null,
  card_gap_x: null,
  card_gap: null,
  bookmark_gap: null,
  show_search_bar: null,
  open_new_tab: null,
}

function slideshowIntervalMs(page) {
  if (!page || page.bg_image_mode !== 'managed_rotation' || !page.bg_slideshow_enabled) return null
  const value = Math.max(1, Number(page.bg_slideshow_interval_value) || 30)
  return value * (page.bg_slideshow_interval_unit === 'minutes' ? 60_000 : 1_000)
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

function backgroundImageUrl(page, token = '') {
  const base = page?.background_url || page?.bg_image
  if (!base) return undefined
  if (page?.bg_image_mode === 'managed_rotation' && page?.bg_slideshow_enabled) {
    const sep = String(base).includes('?') ? '&' : '?'
    return `${base}${sep}sb_bg=${token || Date.now()}`
  }
  return base
}

function readViewerOverrides(shareId) {
  try {
    const raw = window.localStorage.getItem(VIEWER_OVERRIDE_KEY(shareId))
    if (!raw) return DEFAULT_VIEWER_OVERRIDES
    return { ...DEFAULT_VIEWER_OVERRIDES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_VIEWER_OVERRIDES
  }
}

function writeViewerOverrides(shareId, value) {
  try {
    window.localStorage.setItem(VIEWER_OVERRIDE_KEY(shareId), JSON.stringify(value))
  } catch {
    // Best-effort only.
  }
}

function clearViewerOverrides(shareId) {
  try {
    window.localStorage.removeItem(VIEWER_OVERRIDE_KEY(shareId))
  } catch {
    // Best-effort only.
  }
}

function estimateGroupHeight(group) {
  const visibleBookmarks = group.visible_limit > 0
    ? Math.min(group.bookmarks?.length ?? 0, group.visible_limit)
    : (group.bookmarks?.length ?? 0)
  return 1 + visibleBookmarks
}

const GROUP_ALIGN_JUSTIFY = { left: 'start', center: 'center', right: 'end' }

function buildColumns(flatGroups, count, autoBalance = false, singleRowOrder = 'natural') {
  const cols = Array.from({ length: count }, () => [])
  const sorted = [...flatGroups].sort((a, b) => (a.column - b.column) || (a.position - b.position))
  if (autoBalance) {
    if (sorted.length <= count && singleRowOrder === 'tallest_first') {
      const singleRow = [...sorted].sort((a, b) => (
        estimateGroupHeight(b) - estimateGroupHeight(a)
      ) || ((a.column - b.column) || (a.position - b.position)))
      singleRow.forEach((group, index) => { cols[index].push(group) })
      return cols
    }
    const heights = Array.from({ length: count }, () => 0)
    for (const g of sorted) {
      let target = 0
      for (let i = 1; i < count; i++) if (heights[i] < heights[target]) target = i
      cols[target].push(g)
      heights[target] += estimateGroupHeight(g)
    }
    return cols
  }
  for (const g of sorted) cols[Math.min(g.column ?? 0, count - 1)].push(g)
  return cols
}

function PublicViewOptionsModal({ page, draft, setDraft, onClose, onApply, onReset }) {
  const [activeTab, setActiveTab] = useState('background')
  const tabs = [
    { id: 'background', label: 'Background' },
    { id: 'layout', label: 'Layout' },
    { id: 'behaviour', label: 'Behaviour' },
  ]

  return (
    <Modal
      title="View options"
      size="2xl"
      onClose={onClose}
      footer={
        <>
          <button className={btnSecondary} onClick={onReset}>Reset to owner defaults</button>
          <button className={btnPrimary} onClick={onApply}>Apply</button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="text-sm text-slate-400">
          These settings apply only in this browser for this shared page.
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                activeTab === tab.id ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'background' && (
          <SettingsSection title="Background">
            <SettingsGroup>
              <SettingsRow label="Background colour" stack>
                <ColorField
                  value={draft.bg_color ?? page.bg_color ?? ''}
                  onChange={(value) => setDraft((current) => ({ ...current, bg_color: value || null }))}
                />
              </SettingsRow>
              <SettingsRow label="Background image URL" hint="Optional local-only background image for this browser." stack>
                <input
                  className={input}
                  value={draft.bg_image ?? page.bg_image ?? ''}
                  onChange={(e) => setDraft((current) => ({ ...current, bg_image: e.target.value || null }))}
                  placeholder="https://…"
                />
              </SettingsRow>
              <SettingsRow label="Accent colour" stack>
                <ColorField
                  value={draft.accent ?? page.accent ?? ''}
                  onChange={(value) => setDraft((current) => ({ ...current, accent: value || null }))}
                />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>
        )}

        {activeTab === 'layout' && (
          <SettingsSection title="Layout">
            <SettingsGroup>
              <SettingsRow label="Columns">
                <input
                  type="number"
                  min={0}
                  max={12}
                  className={`${input} w-24`}
                  value={draft.max_cols ?? page.max_cols ?? 0}
                  onChange={(e) => setDraft((current) => ({ ...current, max_cols: Number(e.target.value) }))}
                />
              </SettingsRow>
              <SettingsRow label="Auto-balance">
                <Toggle
                  checked={draft.auto_balance ?? !!page.auto_balance}
                  onChange={(value) => setDraft((current) => ({ ...current, auto_balance: value }))}
                  label="Auto-balance columns"
                />
              </SettingsRow>
              <SettingsRow
                label="Single-row ordering"
                hint="Only applies when auto-balance is on and every visible group fits on one row."
              >
                <select
                  className={`${input} w-48 appearance-none`}
                  value={draft.single_row_order ?? page.single_row_order ?? 'natural'}
                  onChange={(e) => setDraft((current) => ({ ...current, single_row_order: e.target.value }))}
                  disabled={!(draft.auto_balance ?? !!page.auto_balance)}
                >
                  <option value="natural">Natural</option>
                  <option value="tallest_first">Tallest first</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Card width" stack>
                <RangeField
                  value={draft.card_max_width ?? page.card_max_width ?? 0}
                  onChange={(value) => setDraft((current) => ({ ...current, card_max_width: value }))}
                  min={0}
                  max={560}
                  step={20}
                  format={(value) => (value === 0 ? 'Auto' : `${value}px`)}
                />
              </SettingsRow>
              <SettingsRow label="Horizontal spacing" stack>
                <RangeField
                  value={draft.card_gap_x ?? page.card_gap_x ?? 16}
                  onChange={(value) => setDraft((current) => ({ ...current, card_gap_x: value }))}
                  min={0}
                  max={48}
                />
              </SettingsRow>
              <SettingsRow label="Vertical spacing" stack>
                <RangeField
                  value={draft.card_gap ?? page.card_gap ?? 12}
                  onChange={(value) => setDraft((current) => ({ ...current, card_gap: value }))}
                  min={0}
                  max={48}
                />
              </SettingsRow>
              <SettingsRow label="Bookmark spacing" stack>
                <RangeField
                  value={draft.bookmark_gap ?? page.bookmark_gap ?? 2}
                  onChange={(value) => setDraft((current) => ({ ...current, bookmark_gap: value }))}
                  min={0}
                  max={24}
                />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>
        )}

        {activeTab === 'behaviour' && (
          <SettingsSection title="Behaviour">
            <SettingsGroup>
              <SettingsRow label="Search bar">
                <Toggle
                  checked={draft.show_search_bar ?? (page.search_mode !== 'hide')}
                  onChange={(value) => setDraft((current) => ({ ...current, show_search_bar: value }))}
                  label="Show search bar"
                />
              </SettingsRow>
              <SettingsRow label="Open links in new window">
                <Toggle
                  checked={draft.open_new_tab ?? !!page.open_new_tab}
                  onChange={(value) => setDraft((current) => ({ ...current, open_new_tab: value }))}
                  label="Open links in new window"
                />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>
        )}
      </div>
    </Modal>
  )
}

function DockerStatusBadge({ status }) {
  if (!status?.status) return null
  const meta = {
    healthy: { Icon: CircleCheckBig, tone: 'text-emerald-400', label: 'healthy' },
    running: { Icon: CircleCheckBig, tone: 'text-emerald-400', label: 'healthy' },
    stopped: { Icon: CircleX, tone: 'text-rose-400', label: 'stopped' },
    unhealthy: { Icon: CircleAlert, tone: 'text-amber-400', label: 'unhealthy' },
    unknown: { Icon: CircleHelp, tone: 'text-slate-400', label: 'unknown' },
  }[status.status] || { Icon: CircleHelp, tone: 'text-slate-400', label: status.status }
  return (
    <span
      className={`ml-auto inline-flex shrink-0 items-center ${meta.tone}`}
      title={`Docker status: ${meta.label}`}
      aria-label={`Docker status: ${meta.label}`}
    >
      <meta.Icon className="h-4 w-4" />
    </span>
  )
}

// Read-only, unauthenticated view of a shared page.
export default function PublicBoardPage() {
  const { shareId } = useParams()
  const { settings, preferences } = useAppState()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineSnapshot, setOfflineSnapshot] = useState(false)
  const [viewerOverrides, setViewerOverrides] = useState(() => readViewerOverrides(shareId))
  const [draftOverrides, setDraftOverrides] = useState(DEFAULT_VIEWER_OVERRIDES)
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [bgRefreshToken, setBgRefreshToken] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    publicAPI.view(shareId)
      .then((d) => {
        if (!alive) return
        setData(d)
        setOfflineSnapshot(false)
        offlineStore.writePublicBoard(shareId, d)
      })
      .catch((err) => {
        if (!alive) return
        if (err?.response) {
          setError(errorMessage(err, 'This page is not available'))
          return
        }
        const cached = offlineStore.readPublicBoard(shareId)
        if (cached) {
          setData(cached)
          setOfflineSnapshot(true)
          setError('')
        } else {
          setError(errorMessage(err, 'This page is not available'))
        }
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [shareId])

  useEffect(() => {
    if (!data?.page?.analytics_enabled || offlineSnapshot) return
    publicAPI.trackView(shareId, { session_key: getAnalyticsViewerKey() })
  }, [data?.page?.analytics_enabled, offlineSnapshot, shareId])

  const trackBookmarkOpen = (bookmark) => {
    if (!data?.page?.analytics_enabled || !bookmark?.id) return
    publicAPI.trackClick(shareId, bookmark.id, { session_key: getAnalyticsViewerKey() })
  }

  const mergedPage = useMemo(() => {
    if (!data?.page) return null
    return {
      ...data.page,
      bg_color: viewerOverrides.bg_color ?? data.page.bg_color,
      bg_image: viewerOverrides.bg_image ?? data.page.bg_image,
      accent: viewerOverrides.accent ?? data.page.accent,
      max_cols: viewerOverrides.max_cols ?? data.page.max_cols,
      auto_balance: viewerOverrides.auto_balance ?? data.page.auto_balance,
      single_row_order: viewerOverrides.single_row_order ?? data.page.single_row_order,
      card_max_width: viewerOverrides.card_max_width ?? data.page.card_max_width,
      card_gap_x: viewerOverrides.card_gap_x ?? data.page.card_gap_x,
      card_gap: viewerOverrides.card_gap ?? data.page.card_gap,
      bookmark_gap: viewerOverrides.bookmark_gap ?? data.page.bookmark_gap,
      open_new_tab: viewerOverrides.open_new_tab ?? data.page.open_new_tab,
      viewer_show_search_bar: viewerOverrides.show_search_bar ?? (data.page.search_mode !== 'hide'),
    }
  }, [data, viewerOverrides])

  useEffect(() => {
    const ms = slideshowIntervalMs(mergedPage)
    if (!ms) return undefined
    const timer = window.setInterval(() => setBgRefreshToken(Date.now()), ms)
    return () => window.clearInterval(timer)
  }, [mergedPage])

  const filteredGroups = useMemo(() => {
    if (!data?.groups) return []
    if (!searchQuery.trim()) return data.groups
    const query = searchQuery.trim().toLowerCase()
    return data.groups.map((group) => {
      const matchesGroup = group.title.toLowerCase().includes(query)
      const bookmarks = matchesGroup ? group.bookmarks : group.bookmarks.filter((bookmark) => (
        bookmark.title.toLowerCase().includes(query)
        || bookmarkDisplayUrl(bookmark).toLowerCase().includes(query)
        || (bookmark.description || '').toLowerCase().includes(query)
      ))
      return { ...group, bookmarks }
    }).filter((group) => group.bookmarks.length > 0)
  }, [data, searchQuery])

  // When a Card max width is set, fit the responsive count to it; otherwise
  // columns stretch (1fr) and the hook falls back to its default min width.
  const responsiveCols = useColumnCount(mergedPage?.card_max_width ?? 0, mergedPage?.card_gap_x ?? 16)
  const maxCols = mergedPage?.max_cols ?? 0
  const colCount = Math.max(1, maxCols > 0 ? Math.min(responsiveCols, maxCols) : responsiveCols)
  const columns = useMemo(() => (
    buildColumns(filteredGroups, colCount, !!mergedPage?.auto_balance, mergedPage?.single_row_order || 'natural')
  ), [filteredGroups, colCount, mergedPage?.auto_balance, mergedPage?.single_row_order])

  // With a fixed card width the grid centres/aligns its tracks, so trailing empty
  // columns would push a sparse board off to one side. Drop them so only occupied
  // tracks are aligned. (Flexible 1fr widths fill the row, so empties are moot.)
  const displayColumns = useMemo(() => {
    if (!mergedPage?.card_max_width) return columns
    let lastUsed = -1
    columns.forEach((col, i) => { if (col.length) lastUsed = i })
    return columns.slice(0, Math.max(lastUsed + 1, 1))
  }, [columns, mergedPage?.card_max_width])

  const applyOverrides = () => {
    setViewerOverrides(draftOverrides)
    writeViewerOverrides(shareId, draftOverrides)
    setViewOptionsOpen(false)
  }

  const resetOverrides = () => {
    setViewerOverrides(DEFAULT_VIEWER_OVERRIDES)
    setDraftOverrides(DEFAULT_VIEWER_OVERRIDES)
    clearViewerOverrides(shareId)
    setViewOptionsOpen(false)
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
        <img src="/favicon.svg" alt="" className="h-10 w-10 opacity-60" />
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        '--color-accent': mergedPage?.accent || undefined,
        '--color-accent-dark': mergedPage?.accent
          ? `color-mix(in oklab, ${mergedPage.accent} 82%, black)`
          : undefined,
      }}
    >
      {offlineSnapshot && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-sm text-amber-200">
          Offline snapshot loaded. This shared board may be out of date until the server is reachable again.
        </div>
      )}
      <header className="border-b border-white/10 bg-slate-900/70 px-5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <h1 className="text-sm font-semibold text-white">{settings.site_name}</h1>
            <span className="text-sm text-slate-400">/</span>
            <span className="truncate text-sm font-medium text-slate-200">{data.page.title}</span>
            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">shared · read-only</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {mergedPage?.viewer_show_search_bar && (
              <div className="flex h-9 w-64 max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search bookmarks"
                />
              </div>
            )}
            <button className={btnSecondary} onClick={() => { setDraftOverrides(viewerOverrides); setViewOptionsOpen(true) }}>
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">View options</span>
            </button>
          </div>
        </div>
      </header>
      <main
        className="flex-1 overflow-auto p-5"
        style={{
          backgroundColor: mergedPage?.bg_image_mode === 'solid' ? (mergedPage?.bg_color || undefined) : undefined,
          backgroundImage: backgroundImageUrl(mergedPage, bgRefreshToken) ? `url(${backgroundImageUrl(mergedPage, bgRefreshToken)})` : undefined,
          backgroundPosition: backgroundPositionForPage(mergedPage?.bg_image_position),
          backgroundRepeat: 'no-repeat',
          backgroundSize: mergedPage?.bg_image_fit === 'fill'
            ? '100% 100%'
            : (mergedPage?.bg_image_fit === 'contain' || mergedPage?.bg_image_fit === 'scale-down' ? 'contain' : 'cover'),
        }}
      >
        {!!searchQuery.trim() && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/3 px-4 py-2 text-sm text-slate-300">
            Filtering bookmarks for <span className="font-medium text-white">{searchQuery}</span>.
          </div>
        )}
        <div
          className="grid items-start"
          style={{
            gridTemplateColumns: `repeat(${displayColumns.length || colCount}, minmax(0, ${mergedPage?.card_max_width ? `${mergedPage.card_max_width}px` : '1fr'}))`,
            columnGap: `${mergedPage?.card_gap_x ?? 16}px`,
            rowGap: `${mergedPage?.card_gap ?? 12}px`,
            justifyContent: GROUP_ALIGN_JUSTIFY[mergedPage?.group_align] || 'center',
          }}
        >
          {displayColumns.map((col, colIndex) => (
            <div key={colIndex} className="flex min-h-24 flex-col" style={{ gap: `${mergedPage?.card_gap ?? 12}px` }}>
              {col.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/3"
                >
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <Favicon iconUrl={g.icon_url} title={g.title} size={18} show={preferences.show_website_icons} color={g.icon_color || mergedPage?.icon_color || settings.icon_color || ''} />
                    <h3 className="truncate text-sm font-semibold uppercase tracking-wide text-slate-300">{g.title}</h3>
                  </div>
                  <div className="p-2" style={{ display: 'grid', gap: `${mergedPage?.bookmark_gap ?? 2}px` }}>
                    {g.bookmarks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        title={b.description || bookmarkDisplayUrl(b) || 'Visibility-only Docker entry'}
                        aria-disabled={!isBookmarkLaunchable(b)}
                        className={`sb-link flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-200 ${isBookmarkLaunchable(b) ? '' : 'cursor-default'}`}
                        onClick={() => {
                          trackBookmarkOpen(b)
                          openBookmark(b, mergedPage?.open_new_tab)
                        }}
                      >
                        <Favicon iconUrl={b.icon_url} title={b.title} show={preferences.show_website_icons} color={b.icon_color || g.icon_color || mergedPage?.icon_color || settings.icon_color || ''} />
                        <span
                          className="min-w-0 flex-1 truncate"
                          style={{ color: b.title_color || g.bookmark_title_color || mergedPage?.bookmark_title_color || undefined }}
                        >{b.title}</span>
                        <DockerStatusBadge status={b.docker_status} />
                        {!mergedPage?.open_new_tab && isBookmarkLaunchable(b) && <ExternalLink className="h-3.5 w-3.5 text-slate-500" />}
                      </button>
                    ))}
                    {g.bookmarks.length === 0 && <div className="px-2 py-3 text-xs text-slate-500">Empty.</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
      {viewOptionsOpen && mergedPage && (
        <PublicViewOptionsModal
          page={mergedPage}
          draft={draftOverrides}
          setDraft={setDraftOverrides}
          onClose={() => setViewOptionsOpen(false)}
          onApply={applyOverrides}
          onReset={resetOverrides}
        />
      )}
    </div>
  )
}
